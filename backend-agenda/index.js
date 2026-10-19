import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import axios from 'axios';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();

const requiredEnvironment = [
  'MP_ACCESS_TOKEN',
  'MP_WEBHOOK_SECRET',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'FIREBASE_DATABASE_URL',
  'CLIENT_URL',
  'BACKEND_PUBLIC_URL',
];
const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]?.trim());
if (missingEnvironment.length) {
  throw new Error(`Faltan variables de entorno requeridas: ${missingEnvironment.join(', ')}`);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
if (serviceAccount.project_id !== 'fotos-44002') {
  throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON debe pertenecer al proyecto fotos-44002.');
}

const accessToken = process.env.MP_ACCESS_TOKEN;
const expectedLiveMode = accessToken.startsWith('APP_USR-');
if (!expectedLiveMode && !accessToken.startsWith('TEST-')) {
  throw new Error('MP_ACCESS_TOKEN debe ser una credencial TEST- o APP_USR- de Mercado Pago.');
}

const firebaseApp = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);
const preferenceClient = new Preference(new MercadoPagoConfig({ accessToken }));
const paymentClient = new Payment(new MercadoPagoConfig({ accessToken }));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const clientUrl = process.env.CLIENT_URL.replace(/\/+$/, '');
const backendPublicUrl = process.env.BACKEND_PUBLIC_URL.replace(/\/+$/, '');
const clientOrigin = new URL(clientUrl).origin;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT debe ser un puerto TCP válido.');
}

// Configuración de Multer para archivos en memoria
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 5, fileSize: 25 * 1024 * 1024 },
});

// Configuración de Mercado Pago
// Dominios permitidos (Producción y Desarrollo local)
const allowedOrigins = new Set([
  clientOrigin,
  'https://fotos-44002.firebaseapp.com',
  'http://localhost:4200',
  'http://localhost:4500',
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️ Origen bloqueado por CORS: ${origin}`);
      callback(null, false);
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------
// HELPER: SANEAR EMAIL (Puntos a Comas para Realtime DB)
// ---------------------------------------------
function encodeEmail(email) {
  if (!email) return '';
  return email.toLowerCase().trim().replace(/\./g, ',');
}

function validAlbumId(albumId) {
  return typeof albumId === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(albumId);
}

function galleryErrorMessage(error, fallback) {
  if (error instanceof Error && error.message.startsWith('Faltan credenciales de Google Photos:')) {
    return error.message;
  }
  return fallback;
}

async function getGalleryAlbum(email, albumId) {
  const cleanEmail = encodeEmail(email);
  const defaultSnapshot = await db.ref(`albumes/${cleanEmail}`).once('value');
  const defaultAlbum = defaultSnapshot.val();

  if ((!albumId || defaultAlbum?.albumId === albumId) && defaultAlbum?.albumId) {
    return defaultAlbum;
  }
  if (!validAlbumId(albumId)) {
    return null;
  }

  const folderSnapshot = await db.ref(`galeria_carpetas/${cleanEmail}/${albumId}`).once('value');
  const folder = folderSnapshot.val();
  return folder?.albumId === albumId ? folder : null;
}

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS || 'admin@gmail.com,estebangarriga@gmail.com')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
);

function isAdmin(email) {
  return adminEmails.has(email);
}

function validEmail(email) {
  return typeof email === 'string'
    && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function requireFirebaseAuth(req, res, next) {
  const authorization = req.get('Authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return res.status(401).json({ error: 'Debes iniciar sesión para acceder a las fotos.' });
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    if (!decodedToken.email) {
      return res.status(401).json({ error: 'La cuenta autenticada no tiene un correo válido.' });
    }
    req.authenticatedEmail = decodedToken.email.toLowerCase().trim();
  } catch (error) {
    console.error('❌ No se pudo verificar el token de Firebase:', error.message);
    return res.status(401).json({ error: 'La sesión no es válida o expiró. Inicia sesión nuevamente.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req.authenticatedEmail)) {
    return res.status(403).json({ error: 'Solo un administrador puede realizar esta acción.' });
  }
  next();
}

function requireFirebaseUser(req, res, next) {
  const authorization = req.get('Authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return res.status(401).json({ error: 'Se requiere iniciar sesión para pagar.' });
  }

  auth.verifyIdToken(token)
    .then((user) => {
      if (!user.email) {
        return res.status(401).json({ error: 'La cuenta no tiene un correo asociado.' });
      }

      req.paymentUser = user;
      next();
    })
    .catch(() => res.status(401).json({ error: 'La sesión no es válida o ha vencido.' }));
}

function userDatabaseKey(email) {
  return email.trim().toLowerCase().replace(/\./g, ',');
}

function toMinorUnits(amount) {
  return Math.round(Number(amount) * 100);
}

function verifyWebhookSignature(dataId, requestId, signatureHeader) {
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const separator = part.indexOf('=');
      return separator < 0
        ? [part.trim(), '']
        : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
    })
  );
  const timestamp = parts.ts;
  const signature = parts.v1;

  if (!timestamp || !signature || !requestId) {
    return false;
  }
  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`;
  const expected = createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
    .update(manifest)
    .digest();
  const received = Buffer.from(signature, 'hex');

  return received.length === expected.length && timingSafeEqual(received, expected);
}

function validateEventDate(fecha) {
  if (!fecha) {
    return;
  }

  const datePart = String(fecha).split('T')[0];
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error('La fecha de la reserva no es válida.');
  }

  const [, year, month, day] = match;
  const fechaEvento = new Date(Number(year), Number(month) - 1, Number(day));

  if (
    fechaEvento.getFullYear() !== Number(year) ||
    fechaEvento.getMonth() !== Number(month) - 1 ||
    fechaEvento.getDate() !== Number(day)
  ) {
    throw new Error('La fecha de la reserva no es válida.');
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  fechaEvento.setHours(0, 0, 0, 0);

  const fechaMinimaReserva = new Date(hoy);
  fechaMinimaReserva.setDate(fechaMinimaReserva.getDate() + 3);
  if (fechaEvento < fechaMinimaReserva) {
    throw new Error('No se pueden realizar ni pagar reservas con menos de 3 días de anticipación.');
  }

  const fechaLimitePago = new Date(fechaEvento);
  fechaLimitePago.setDate(fechaLimitePago.getDate() - 2);
  if (hoy > fechaLimitePago) {
    throw new Error('La reserva ha caducado. El plazo límite de pago era hasta 2 días antes del evento.');
  }
}

async function createPreference(req, res) {
  const email = req.paymentUser.email;
  const requestedId = String(req.body?.id || '');
  const userKey = userDatabaseKey(email);

  if (requestedId !== 'pago-general' && !/^[A-Za-z0-9_-]{1,128}$/.test(requestedId)) {
    return res.status(400).json({ error: 'Falta identificar la reserva a pagar.' });
  }

  const reservationsSnapshot = await db.ref(`reservas/${userKey}`).get();
  const reservations = reservationsSnapshot.val();
  if (!reservations || typeof reservations !== 'object') {
    return res.status(404).json({ error: 'No se encontraron reservas para esta cuenta.' });
  }

  const selectedReservations = requestedId === 'pago-general'
    ? Object.entries(reservations)
    : [[requestedId, reservations[requestedId]]];
  const allocations = [];

  for (const [id, reservation] of selectedReservations) {
    if (!reservation || typeof reservation !== 'object') {
      if (requestedId !== 'pago-general') {
        return res.status(404).json({ error: 'No se encontró la reserva solicitada.' });
      }
      continue;
    }

    const total = Number(reservation.total);
    const paid = Number(reservation.pagado || 0);
    const outstanding = total - paid;
    if (!Number.isFinite(total) || !Number.isFinite(paid) || total <= 0 || outstanding <= 0) {
      continue;
    }

    try {
      validateEventDate(reservation.fecha);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    allocations.push({
      id,
      amount: Math.round(outstanding * 100) / 100,
      description: `${reservation.tipoEvento === '15_años' ? '15 Años' : 'Boda'} - ${reservation.fecha}`,
    });
  }

  if (!allocations.length) {
    return res.status(400).json({ error: 'No hay saldo pendiente para pagar.' });
  }

  const amount = Math.round(allocations.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
  const externalReference = randomUUID();
  const intentRef = db.ref(`pagos_pendientes/${externalReference}`);
  await intentRef.set({
    usuario: email,
    allocations,
    monto: amount,
    moneda: 'UYU',
    estado: 'pending',
    creado: new Date().toISOString(),
  });

  try {
    const preference = await preferenceClient.create({
      body: {
        items: [{
          title: requestedId === 'pago-general' ? 'Pago de deuda - Agenda' : allocations[0].description,
          quantity: 1,
          unit_price: amount,
          currency_id: 'UYU',
        }],
        payer: { email },
        external_reference: externalReference,
        notification_url: `${backendPublicUrl}/webhook`,
        back_urls: {
          success: `${clientUrl}/agenda`,
          failure: `${clientUrl}/agenda`,
          pending: `${clientUrl}/agenda`,
        },
        auto_return: 'approved',
        binary_mode: true,
      },
    });

    if (!preference.id || !preference.init_point) {
      throw new Error('Mercado Pago no devolvió los datos de checkout esperados.');
    }

    await intentRef.update({ preferenceId: preference.id });
    return res.json({
      id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
    });
  } catch (error) {
    await intentRef.update({ estado: 'error' });
    throw error;
  }
}

async function applyApprovedPayment(paymentId) {
  const payment = await paymentClient.get({ id: paymentId });
  if (payment.status !== 'approved') {
    return { status: payment.status || 'pending' };
  }
  if (payment.live_mode !== expectedLiveMode) {
    throw new Error('El modo del pago no coincide con las credenciales configuradas.');
  }

  const externalReference = payment.external_reference;
  if (!externalReference) {
    throw new Error('El pago no está asociado a una intención registrada.');
  }

  const intentRef = db.ref(`pagos_pendientes/${externalReference}`);
  const intentSnapshot = await intentRef.get();
  const intent = intentSnapshot.val();
  if (!intent || !Array.isArray(intent.allocations)) {
    throw new Error('No se encontró la intención de pago asociada.');
  }
  if (intent.estado === 'approved') {
    if (String(intent.paymentId) !== String(paymentId)) {
      throw new Error('La intención ya fue aplicada a otro pago.');
    }
    return { status: 'approved' };
  }
  if (
    payment.currency_id !== 'UYU' ||
    toMinorUnits(payment.transaction_amount) !== toMinorUnits(intent.monto)
  ) {
    throw new Error('El monto o la moneda del pago no coincide con la reserva.');
  }

  const userKey = userDatabaseKey(intent.usuario);
  for (const allocation of intent.allocations) {
    const reservationRef = db.ref(`reservas/${userKey}/${allocation.id}`);
    let conflict = false;
    const transaction = await reservationRef.transaction((reservation) => {
      if (!reservation) {
        conflict = true;
        return;
      }
      if (reservation.pagosMercadoPago?.[paymentId]) {
        return reservation;
      }

      const total = Number(reservation.total);
      const paid = Number(reservation.pagado || 0);
      const allocationAmount = Number(allocation.amount);
      if (
        !Number.isFinite(total) ||
        !Number.isFinite(paid) ||
        !Number.isFinite(allocationAmount) ||
        allocationAmount <= 0 ||
        toMinorUnits(total - paid) < toMinorUnits(allocationAmount)
      ) {
        conflict = true;
        return;
      }

      reservation.pagado = Math.round((paid + allocationAmount) * 100) / 100;
      reservation.estado =
        toMinorUnits(reservation.pagado) >= toMinorUnits(total) ? 'completado' : 'pendiente';
      reservation.pagosMercadoPago = reservation.pagosMercadoPago || {};
      reservation.pagosMercadoPago[paymentId] = true;
      return reservation;
    });

    if (!transaction.committed && !transaction.snapshot.child(`pagosMercadoPago/${paymentId}`).exists()) {
      throw new Error(
        conflict ? 'La reserva cambió después de iniciar el pago.' : 'No se pudo actualizar la reserva.'
      );
    }
  }

  await db.ref(`historial_pagos/${userKey}/${paymentId}`).set({
    fecha: payment.date_approved || new Date().toISOString(),
    monto: Number(payment.transaction_amount),
    paymentId: String(paymentId),
    descripcion: `Pago de Mercado Pago (${intent.allocations.length} reserva(s))`,
    usuario: intent.usuario,
  });
  await intentRef.update({
    estado: 'approved',
    paymentId: String(paymentId),
    aprobado: payment.date_approved || new Date().toISOString(),
  });

  return { status: 'approved' };
}

// ---------------------------------------------
// NODEMAILER (CONFIGURACIÓN DE CORREO)
// ---------------------------------------------
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_PORT == 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ---------------------------------------------
// HELPER: OBTENER ACCESS TOKEN DE GOOGLE PHOTOS
// ---------------------------------------------
async function getGooglePhotosToken() {
  const requiredVariables = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
    'REFRESH_TOKEN',
  ];
  const missingVariables = requiredVariables.filter(key => !process.env[key]?.trim());
  if (missingVariables.length) {
    throw new Error(`Faltan credenciales de Google Photos: ${missingVariables.join(', ')}.`);
  }
  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    auth.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
    const { token } = await auth.getAccessToken();
    if (!token) throw new Error('Token devuelto es nulo');
    return token;
  } catch (error) {
    console.error('❌ Error al obtener token de Google Photos:', error.message);
    throw new Error('No se pudo obtener el token de acceso a Google Photos.');
  }
}

// ---------------------------------------------
// HELPER: CREAR ÁLBUM EN GOOGLE PHOTOS
// ---------------------------------------------
async function createAlbumInGooglePhotos(token, albumTitle) {
  try {
    const response = await axios.post(
      'https://photoslibrary.googleapis.com/v1/albums',
      { album: { title: albumTitle } },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );
    return response.data.id;
  } catch (error) {
    console.error('❌ Error creando álbum en Google Photos:', error.response?.data?.error || error.message);
    return null;
  }
}

// ---------------------------------------------
// RUTAS DEL SERVIDOR
// ---------------------------------------------

// Endpoint de prueba
app.get('/', (req, res) => {
  res.send({ status: 'OK', message: 'Backend de EventPlanner Pro activo' });
});

// ---------------------------------------------
// MERCADO PAGO: PREFERENCIA DE PAGO
// ---------------------------------------------
app.post('/create_preference', requireFirebaseUser, (req, res, next) => {
  createPreference(req, res).catch(next);
});

app.post('/confirm_payment', requireFirebaseUser, async (req, res, next) => {
  try {
    const paymentId = String(req.body?.payment_id || '');
    const externalReference = String(req.body?.external_reference || '');
    if (!/^\d+$/.test(paymentId) || !/^[0-9a-f-]{36}$/i.test(externalReference)) {
      return res.status(400).json({ error: 'Faltan los datos para verificar el pago.' });
    }

    const payment = await paymentClient.get({ id: paymentId });
    if (payment.external_reference !== externalReference) {
      return res.status(400).json({ error: 'El pago no corresponde a esta operación.' });
    }

    const intentSnapshot = await db.ref(`pagos_pendientes/${externalReference}`).get();
    const intent = intentSnapshot.val();
    if (
      !intent ||
      userDatabaseKey(intent.usuario) !== userDatabaseKey(req.paymentUser.email)
    ) {
      return res.status(403).json({ error: 'El pago no corresponde a esta cuenta.' });
    }

    const result = await applyApprovedPayment(paymentId);
    return res.status(result.status === 'approved' ? 200 : 202).json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/webhook', async (req, res, next) => {
  try {
    const paymentId = String(req.body?.data?.id || req.query['data.id'] || req.query.id || '');
    const eventType = req.body?.type || req.query.type || req.query.topic;
    if (eventType !== 'payment') {
      return res.sendStatus(200);
    }
    if (!/^\d+$/.test(paymentId)) {
      return res.status(400).json({ error: 'Identificador de pago inválido.' });
    }

    const signature = req.get('x-signature') || '';
    const requestId = req.get('x-request-id') || '';
    if (!verifyWebhookSignature(paymentId, requestId, signature)) {
      return res.status(401).json({ error: 'Firma de notificación inválida.' });
    }

    await applyApprovedPayment(paymentId);
    return res.sendStatus(200);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------
// GOOGLE PHOTOS: ASEGURAR / CREAR ÁLBUM
// ---------------------------------------------
app.post('/api/ensure-album', requireFirebaseAuth, requireAdmin, async (req, res) => {
  const { email } = req.body;
  if (!validEmail(email)) {
    return res.status(400).json({ error: 'El email debe ser válido.' });
  }
  const cleanEmail = encodeEmail(email);

  try {
    const snapshot = await db.ref(`albumes/${cleanEmail}`).once('value');
    const albumData = snapshot.val();

    if (albumData && albumData.albumId) {
      return res.status(200).json({
        message: 'El álbum ya existe.',
        albumId: albumData.albumId,
        email: albumData.email
      });
    }

    const token = await getGooglePhotosToken();
    const albumTitle = `Evento - ${email}`;
    const albumId = await createAlbumInGooglePhotos(token, albumTitle);

    if (!albumId) {
      return res.status(500).json({ error: 'Error al generar el álbum en Google Photos.' });
    }

    await db.ref(`albumes/${cleanEmail}`).set({
      email: email.toLowerCase().trim(),
      albumId,
      createdAt: new Date().toISOString()
    });

    console.log(`✅ [Álbum Creado] Asignado a: ${cleanEmail} -> AlbumId: ${albumId}`);
    res.status(201).json({ message: 'Álbum creado exitosamente.', albumId, email });

  } catch (error) {
    console.error('❌ Error en /api/ensure-album:', error.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ---------------------------------------------
// GOOGLE PHOTOS: LISTAR CARPETAS DE UN USUARIO
// ---------------------------------------------
app.get('/api/gallery/:email/folders', requireFirebaseAuth, async (req, res) => {
  res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  const email = req.params.email;
  if (!validEmail(email)) {
    return res.status(400).json({ error: 'El email debe ser válido.' });
  }
  if (email.toLowerCase().trim() !== req.authenticatedEmail && !isAdmin(req.authenticatedEmail)) {
    return res.status(403).json({ error: 'Solo puedes acceder a tus propias carpetas.' });
  }

  const cleanEmail = encodeEmail(email);
  try {
    const [defaultSnapshot, foldersSnapshot] = await Promise.all([
      db.ref(`albumes/${cleanEmail}`).once('value'),
      db.ref(`galeria_carpetas/${cleanEmail}`).once('value'),
    ]);
    const defaultAlbum = defaultSnapshot.val();
    const folders = [];

    if (defaultAlbum?.albumId) {
      folders.push({
        albumId: defaultAlbum.albumId,
        title: 'Galería general',
        email: defaultAlbum.email || email.toLowerCase().trim(),
        createdAt: defaultAlbum.createdAt,
        isDefault: true,
      });
    }

    Object.values(foldersSnapshot.val() || {}).forEach(folder => {
      if (folder?.albumId && folder.title) {
        folders.push({
          albumId: folder.albumId,
          title: folder.title,
          email: folder.email || email.toLowerCase().trim(),
          createdAt: folder.createdAt,
          isDefault: false,
        });
      }
    });

    return res.status(200).json(folders);
  } catch (error) {
    console.error('❌ Error al listar carpetas de galería:', error.message);
    return res.status(500).json({ error: 'No se pudieron cargar las carpetas de la galería.' });
  }
});

// ---------------------------------------------
// GOOGLE PHOTOS: CREAR CARPETA (ÁLBUM)
// ---------------------------------------------
app.post('/api/gallery/folders', requireFirebaseAuth, requireAdmin, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (!validEmail(email) || !title || title.length > 100) {
    return res.status(400).json({ error: 'Indica un email válido y un nombre de carpeta de hasta 100 caracteres.' });
  }

  const cleanEmail = encodeEmail(email);
  try {
    const foldersSnapshot = await db.ref(`galeria_carpetas/${cleanEmail}`).once('value');
    const existingFolders = Object.values(foldersSnapshot.val() || {});
    if (existingFolders.some(folder => folder?.title?.toLowerCase() === title.toLowerCase())) {
      return res.status(409).json({ error: 'Ya existe una carpeta con ese nombre para este usuario.' });
    }

    const token = await getGooglePhotosToken();
    const albumId = await createAlbumInGooglePhotos(token, title);
    if (!albumId) {
      return res.status(502).json({ error: 'Google Photos no pudo crear el álbum. Revisa la conexión de Google Photos del backend.' });
    }

    const folder = {
      albumId,
      title,
      email,
      createdAt: new Date().toISOString(),
    };
    await db.ref(`galeria_carpetas/${cleanEmail}/${albumId}`).set(folder);
    return res.status(201).json(folder);
  } catch (error) {
    console.error('❌ Error al crear carpeta de galería:', error.response?.data?.error || error.message);
    return res.status(500).json({
      error: galleryErrorMessage(error, 'No se pudo crear la carpeta de la galería.'),
    });
  }
});

// ---------------------------------------------
// GOOGLE PHOTOS: OBTENER FOTOS DE UN USUARIO
// ---------------------------------------------
app.get('/api/gallery/:email', requireFirebaseAuth, async (req, res) => {
  res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  const rawEmail = req.params.email;
  if (!validEmail(rawEmail)) {
    return res.status(400).json({ error: 'El email debe ser válido.' });
  }
  if (rawEmail.toLowerCase().trim() !== req.authenticatedEmail && !isAdmin(req.authenticatedEmail)) {
    return res.status(403).json({ error: 'Solo puedes acceder a tu propia galería.' });
  }
  const cleanEmail = encodeEmail(rawEmail);

  try {
    const requestedAlbumId = req.query.albumId;
    if (requestedAlbumId && !validAlbumId(requestedAlbumId)) {
      return res.status(400).json({ error: 'La carpeta solicitada no es válida.' });
    }
    const albumData = await getGalleryAlbum(cleanEmail, requestedAlbumId);

    if (!albumData) {
      return res.status(404).json({ error: 'No se encontró una carpeta asociada a este usuario.' });
    }

    const token = await getGooglePhotosToken();

    const photosResponse = await axios.post(
      'https://photoslibrary.googleapis.com/v1/mediaItems:search',
      { albumId: albumData.albumId, pageSize: 100 },
      { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }
    );

    const mediaItems = photosResponse.data.mediaItems || [];
    const photos = mediaItems.map(p => ({
      id: p.id,
      baseUrl: `${p.baseUrl}=w1200-h800`,
      thumbnailUrl: `${p.baseUrl}=w320-h240`,
      downloadUrl: `${p.baseUrl}=d`,
      filename: p.filename,
      mimeType: p.mimeType
    }));

    res.status(200).json(photos);

  } catch (error) {
    console.error('❌ Error al cargar galería:', error.message);
    res.status(500).json({
      error: galleryErrorMessage(error, 'Error al recuperar imágenes de la galería.'),
    });
  }
});

// ---------------------------------------------
// GOOGLE PHOTOS: SUBIR FOTOS AL ÁLBUM
// ---------------------------------------------
app.post('/api/upload-photos', requireFirebaseAuth, requireAdmin, (req, res, next) => {
  upload.array('photos', 5)(req, res, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Cada foto debe pesar como máximo 25 MB.'
        : 'Puedes subir hasta 5 fotos por vez.';
      return res.status(status).json({ error: message });
    }
    next(error);
  });
}, async (req, res) => {
  const { targetEmail, albumId: requestedAlbumId } = req.body;
  const files = req.files;

  if (!validEmail(targetEmail) || !files || files.length === 0) {
    return res.status(400).json({ error: 'Debes especificar el email del destinatario y adjuntar archivos.' });
  }
  const allowedImageTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/gif',
    'image/bmp',
    'image/tiff',
  ]);
  if (!files.every(file => allowedImageTypes.has(file.mimetype))) {
    return res.status(400).json({ error: 'Formato no permitido. Usa JPG, PNG, WebP, HEIC, GIF, BMP o TIFF.' });
  }
  if (requestedAlbumId && !validAlbumId(requestedAlbumId)) {
    return res.status(400).json({ error: 'La carpeta solicitada no es válida.' });
  }

  const cleanEmail = encodeEmail(targetEmail);

  try {
    let albumData = requestedAlbumId
      ? await getGalleryAlbum(cleanEmail, requestedAlbumId)
      : null;
    if (requestedAlbumId && !albumData) {
      return res.status(404).json({ error: 'No se encontró la carpeta de destino.' });
    }
    let token = await getGooglePhotosToken();

    if (!requestedAlbumId && !albumData) {
      const snapshot = await db.ref(`albumes/${cleanEmail}`).once('value');
      albumData = snapshot.val();
    }
    if (!requestedAlbumId && !albumData?.albumId) {
      const albumTitle = `Evento - ${targetEmail}`;
      const albumId = await createAlbumInGooglePhotos(token, albumTitle);
      if (!albumId) throw new Error('No se pudo crear el álbum automáticamente.');

      albumData = { email: targetEmail.toLowerCase().trim(), albumId, createdAt: new Date().toISOString() };
      await db.ref(`albumes/${cleanEmail}`).set(albumData);
    }

    const uploadRequests = files.map(file =>
      axios.post(
        'https://photoslibrary.googleapis.com/v1/uploads',
        file.buffer,
        {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Authorization': `Bearer ${token}`,
            'X-Goog-Upload-File-Name': file.originalname.replace(/[\r\n]/g, '_').slice(0, 200) || 'foto',
            'X-Goog-Upload-Protocol': 'raw'
          }
        }
      )
    );

    const uploadResponses = await Promise.all(uploadRequests);
    const newMediaItems = uploadResponses.map(r => ({
      simpleMediaItem: { uploadToken: r.data }
    }));

    const batchResponse = await axios.post(
      'https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate',
      { albumId: albumData.albumId, newMediaItems },
      { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }
    );
    const results = batchResponse.data.newMediaItemResults;
    if (!Array.isArray(results) || results.length !== files.length) {
      throw new Error('Google Photos no confirmó todas las fotos subidas.');
    }
    if (results.some(result => result.status?.code)) {
      throw new Error('Google Photos rechazó una o más imágenes.');
    }

    res.status(200).json({ message: 'Fotos subidas y agregadas al álbum correctamente.' });

  } catch (error) {
    console.error('❌ Error en /api/upload-photos:', error.response?.data?.error || error.message);
    res.status(500).json({
      error: galleryErrorMessage(error, 'Error al procesar la subida de fotos.'),
    });
  }
});

// ---------------------------------------------
// GOOGLE PHOTOS: ELIMINAR FOTO
// ---------------------------------------------
app.post('/api/delete-photo/:photoId', requireFirebaseAuth, requireAdmin, async (req, res) => {
  const { photoId } = req.params;
  const { email, albumId: requestedAlbumId } = req.body;

  if (!photoId || !validEmail(email) || !validAlbumId(requestedAlbumId)) {
    return res.status(400).json({ error: 'Falta photoId, email o carpeta válida.' });
  }

  const cleanEmail = encodeEmail(email);

  try {
    const albumData = await getGalleryAlbum(cleanEmail, requestedAlbumId);

    if (!albumData) {
      return res.status(404).json({ error: 'Carpeta no encontrada para este usuario.' });
    }

    const token = await getGooglePhotosToken();

    await axios.post(
      `https://photoslibrary.googleapis.com/v1/albums/${albumData.albumId}:batchRemoveMediaItems`,
      { mediaItemIds: [photoId] },
      { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }
    );

    res.status(200).json({ message: 'Foto removida del álbum con éxito.' });

  } catch (error) {
    console.error('❌ Error al eliminar foto:', error.message);
    res.status(500).json({
      error: galleryErrorMessage(error, 'Error al eliminar la foto.'),
    });
  }
});

// ---------------------------------------------
// CORREO: ENVIAR MENSAJE
// ---------------------------------------------
app.post('/api/send-email', async (req, res) => {
  const { from, to, subject, text } = req.body;
  if (!from || !to || !subject || !text) {
    return res.status(400).json({ error: 'Faltan campos requeridos.' });
  }

  try {
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4; color: #333;">
        <div style="max-width: 600px; margin: auto; background: #fff; padding: 20px; border-radius: 8px;">
          <h2 style="color: #007bff; border-bottom: 2px solid #007bff; padding-bottom: 10px;">Nuevo Mensaje de EventPlannerPro</h2>
          <p><strong>De:</strong> ${from}</p>
          <p><strong>Asunto:</strong> ${subject}</p>
          <div style="border: 1px solid #ddd; padding: 15px; background: #fafafa; border-radius: 5px; margin-top: 15px;">
            <p style="white-space: pre-wrap; margin: 0;">${text}</p>
          </div>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from,
      to,
      subject,
      text: `De: ${from}\n\nAsunto: ${subject}\n\nMensaje:\n${text}`,
      html: htmlContent
    });

    res.status(200).json({ message: 'Correo enviado con éxito.' });
  } catch (error) {
    console.error('❌ Error al enviar correo:', error);
    res.status(500).json({ error: 'Error interno al enviar correo.' });
  }
});

app.use((error, _req, res, _next) => {
  console.error('Error en el backend:', error.api_response?.content || error.message || error);
  if (!res.headersSent) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend de EventPlanner Pro ejecutándose en el puerto ${PORT}`);
});
