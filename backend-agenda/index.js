import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

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
app.set('trust proxy', 1);
const personalAlbumProvisioning = new Map();
const contactRequests = new Map();
const PORT = Number(process.env.PORT || 3000);
const clientUrl = process.env.CLIENT_URL.replace(/\/+$/, '');
const backendPublicUrl = process.env.BACKEND_PUBLIC_URL.replace(/\/+$/, '');
const clientOrigin = new URL(clientUrl).origin;
const contactPhone = process.env.CONTACT_PHONE?.trim() || '+598 97 403 118';
const seniaRecordatorioInterval = 24 * 60 * 60 * 1000;

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

async function ensurePersonalGalleryAlbum(email, uid, username) {
  const cleanEmail = encodeEmail(email);
  const albumRef = db.ref(`albumes/${cleanEmail}`);
  const existingSnapshot = await albumRef.once('value');
  const existingAlbum = existingSnapshot.val();
  if (existingAlbum?.albumId) {
    return existingAlbum;
  }

  const currentProvisioning = personalAlbumProvisioning.get(uid);
  if (currentProvisioning) {
    return currentProvisioning;
  }

  const provisioning = (async () => {
    const latestSnapshot = await albumRef.once('value');
    const latestAlbum = latestSnapshot.val();
    if (latestAlbum?.albumId) {
      return latestAlbum;
    }

    const safeUsername = String(username || email.split('@')[0])
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'usuario';
    const title = `Galería - ${safeUsername} - ${uid}`;
    const token = await getGooglePhotosToken();
    const albumId = await createAlbumInGooglePhotos(token, title);
    if (!albumId) {
      throw new Error('Google Photos no pudo crear la carpeta personal.');
    }

    const album = {
      email,
      albumId,
      title,
      createdAt: new Date().toISOString(),
    };
    await albumRef.set(album);
    return album;
  })();

  personalAlbumProvisioning.set(uid, provisioning);
  try {
    return await provisioning;
  } finally {
    if (personalAlbumProvisioning.get(uid) === provisioning) {
      personalAlbumProvisioning.delete(uid);
    }
  }
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
    req.authenticatedUid = decodedToken.uid;
    req.authenticatedName = decodedToken.name || '';
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

function requireGalleryAdmin(req, res, next) {
  if (req.authenticatedEmail !== 'admin@gmail.com') {
    return res.status(403).json({ error: 'Solo admin@gmail.com puede administrar las fotos.' });
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

function crearSnapshotComprobante(id, reservation, email, total, paid) {
  const servicios = Array.isArray(reservation.servicios)
    ? reservation.servicios.map((servicio) => ({
        id: String(servicio?.id || ''),
        nombre: String(servicio?.nombre || '').trim(),
        categoria: String(servicio?.categoria || ''),
        precio: Number(servicio?.precio),
      }))
    : [];
  const descripcion = String(reservation.descripcion || '').trim();
  const fecha = String(reservation.fecha || '');
  const tipoEvento = reservation.tipoEvento;
  const serviciosValidos =
    servicios.length > 0 &&
    servicios.every(
      (servicio) => servicio.nombre && Number.isFinite(servicio.precio) && servicio.precio >= 0,
    );

  if (
    !id ||
    !email ||
    !descripcion ||
    !fecha ||
    !['15_años', 'bodas'].includes(tipoEvento) ||
    !serviciosValidos
  ) {
    return null;
  }

  return {
    id: reservation.id || id,
    usuario: email,
    fecha,
    descripcion,
    tipoEvento,
    servicios,
    total,
    descuento: Math.max(0, Number(reservation.descuento || 0)),
    pagado: paid,
    estado: reservation.estado || 'pendiente',
  };
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

function validateEventDate(fecha, diasMinimos = 3) {
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
  fechaMinimaReserva.setDate(fechaMinimaReserva.getDate() + diasMinimos);
  if (fechaEvento < fechaMinimaReserva) {
    throw new Error(
      diasMinimos === 5
        ? 'Para pagar una seña deben faltar al menos 5 días para el evento.'
        : 'No se pueden realizar ni pagar reservas con menos de 3 días de anticipación.'
    );
  }

  const fechaLimitePago = new Date(fechaEvento);
  fechaLimitePago.setDate(fechaLimitePago.getDate() - 3);
  if (hoy > fechaLimitePago) {
    throw new Error('La reserva ha caducado. El plazo límite de pago era hasta 3 días antes del evento.');
  }
}

async function createPreference(req, res) {
  const email = req.paymentUser.email;
  const requestedId = String(req.body?.id || '');
  const tipoPago = String(req.body?.tipo_pago || 'total');
  const userKey = userDatabaseKey(email);

  if (!['senia', 'total'].includes(tipoPago)) {
    return res.status(400).json({ error: 'El tipo de pago solicitado no es válido.' });
  }
  if (requestedId !== 'pago-general' && !/^[A-Za-z0-9_-]{1,128}$/.test(requestedId)) {
    return res.status(400).json({ error: 'Falta identificar la reserva a pagar.' });
  }
  if (tipoPago === 'senia' && requestedId === 'pago-general') {
    return res.status(400).json({ error: 'La seña debe pagarse para una reserva individual.' });
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
    if (reservation.estado === 'caducada') {
      if (requestedId !== 'pago-general') {
        return res.status(400).json({ error: 'La reserva está cancelada y no admite nuevos pagos.' });
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
      validateEventDate(reservation.fecha, tipoPago === 'senia' ? 5 : 3);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    if (tipoPago === 'senia' && paid > 0) {
      return res.status(400).json({ error: 'La seña solo está disponible antes de realizar el primer pago.' });
    }

    const amount = tipoPago === 'senia'
      ? Math.round(total * 0.3 * 100) / 100
      : Math.round(outstanding * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'El importe del pago no es válido.' });
    }

    const reservaSnapshot = crearSnapshotComprobante(id, reservation, email, total, paid);
    if (!reservaSnapshot) {
      return res.status(409).json({
        error: 'La reserva no tiene todos los datos de servicios necesarios para emitir el comprobante. Actualiza la reserva o contacta al negocio antes de pagar.',
      });
    }

    allocations.push({
      id,
      reservaId: reservation.id || id,
      amount,
      tipoPago,
      fecha: reservation.fecha,
      tipoEvento: reservation.tipoEvento,
      reservaSnapshot,
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
    tipoPago,
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
          title: requestedId === 'pago-general'
            ? 'Pago de deuda - Agenda'
            : tipoPago === 'senia'
              ? `Seña del 30% - ${allocations[0].description}`
              : allocations[0].description,
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

async function persistApprovedPayment(paymentId, payment, externalReference, intent, userKey) {
  const approvedAt =
    payment.date_approved || intent.aprobado || new Date().toISOString();
  const paymentRecord = {
    ...intent,
    externalReference,
    estado: 'approved',
    paymentId: String(paymentId),
    aprobado: approvedAt,
    monto: Number(payment.transaction_amount ?? intent.monto),
    moneda: payment.currency_id || intent.moneda || 'UYU',
    paymentStatus: payment.status,
  };
  const historyRecord = {
    fecha: approvedAt,
    monto: Number(payment.transaction_amount ?? intent.monto),
    paymentId: String(paymentId),
    externalReference,
    descripcion: `${intent.tipoPago === 'senia' ? 'Seña del 30 %' : 'Pago total/saldo'} de Mercado Pago`,
    usuario: intent.usuario,
    tipoPago: intent.tipoPago === 'senia' ? 'senia' : 'total',
    moneda: payment.currency_id || intent.moneda || 'UYU',
    reservas: intent.allocations.map((allocation) => {
      const reserva = allocation.reservaSnapshot || {};
      return {
        id: String(allocation.reservaId || allocation.id || ''),
        descripcion: String(reserva.descripcion || allocation.description || 'Evento'),
        fecha: String(reserva.fecha || allocation.fecha || ''),
        tipoEvento: reserva.tipoEvento || allocation.tipoEvento || '',
        monto: Number(allocation.amount || 0),
        total: Number(reserva.total || 0),
        pagadoAntes: Number(reserva.pagado || 0),
        saldoDespues: Math.max(
          0,
          Number(reserva.total || 0) -
            Number(reserva.pagado || 0) -
            Number(allocation.amount || 0),
        ),
        descuento: Math.max(0, Number(reserva.descuento || 0)),
        servicios: Array.isArray(reserva.servicios)
          ? reserva.servicios.map((servicio) => ({
              id: String(servicio?.id || ''),
              nombre: String(servicio?.nombre || 'Servicio'),
              categoria: String(servicio?.categoria || ''),
              precio: Number(servicio?.precio || 0),
            }))
          : [],
      };
    }),
  };

  await db.ref().update({
    [`pagos_pendientes/${externalReference}/estado`]: 'approved',
    [`pagos_pendientes/${externalReference}/paymentId`]: String(paymentId),
    [`pagos_pendientes/${externalReference}/aprobado`]: approvedAt,
    [`pagos_aprovados/${paymentId}`]: paymentRecord,
    [`historial_pagos/${userKey}/${paymentId}`]: historyRecord,
  });
}

function formatoMonto(monto, moneda = 'UYU') {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 2,
  }).format(Number(monto));
}

function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (caracter) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[caracter]);
}

async function enviarNotificacionPago({ paymentId, intent, payment, email, destinatario, tipo }) {
  const brevoApiKey = process.env.BREVO_API_KEY?.trim();
  const emailFrom = process.env.EMAIL_FROM?.trim();
  if (
    !brevoApiKey ||
    !emailFrom ||
    !validEmail(emailFrom) ||
    !validEmail(destinatario)
  ) {
    throw new Error('La configuración de email para notificaciones de pago no es válida.');
  }

  const notificationRef = db.ref(`notificaciones_pagos/${paymentId}/${tipo}`);
  let alreadySent = false;
  let alreadySending = false;
  const claim = await notificationRef.transaction((current) => {
    alreadySent = current?.estado === 'sent';
    alreadySending =
      current?.estado === 'sending' &&
      Date.now() - Date.parse(current.iniciado || '') < 2 * 60 * 1000;
    if (alreadySent || alreadySending) return;
    return { estado: 'sending', iniciado: new Date().toISOString(), destinatario };
  });

  if (!claim.committed) {
    if (alreadySent || alreadySending) return;
    throw new Error('No se pudo reservar el envío del email de pago.');
  }

  const moneda = payment.currency_id || intent.moneda || 'UYU';
  const tipoPago = intent.tipoPago === 'senia' ? 'senia' : 'total';
  const asuntoPago = tipoPago === 'senia' ? 'Seña del 30 % recibida' : 'Pago total recibido';
  const filas = intent.allocations.map((allocation) => {
    const reserva = allocation.reservaSnapshot || {};
    const pagadoAntes = Number(reserva.pagado || 0);
    const total = Number(reserva.total || 0);
    const monto = Number(allocation.amount || 0);
    const pagadoAcumulado = Math.min(total, pagadoAntes + monto);
    const saldo = Math.max(0, total - pagadoAcumulado);
    const servicios = Array.isArray(reserva.servicios)
      ? reserva.servicios.map((servicio) => String(servicio?.nombre || 'Servicio')).join(', ')
      : '';
    const descripcion = String(reserva.descripcion || allocation.description || 'Evento');
    const fecha = String(reserva.fecha || allocation.fecha || '').split('T')[0];
    const descuento = Math.max(0, Number(reserva.descuento || 0));
    return {
      descripcion,
      fecha,
      servicios,
      total,
      descuento,
      subtotal: total + descuento,
      monto,
      pagadoAcumulado,
      saldo,
    };
  });
  const montoTotalPago = Number(payment.transaction_amount ?? intent.monto);
  const cliente = String(intent.usuario || email).trim().toLowerCase();
  const lineas = filas.map((fila) => [
    `${fila.descripcion} — ${fila.fecha}`,
    `Importe de este pago: ${formatoMonto(fila.monto, moneda)}`,
    fila.descuento > 0 ? `Subtotal antes del descuento: ${formatoMonto(fila.subtotal, moneda)}` : '',
    fila.descuento > 0 ? `Descuento por categoría completa: ${formatoMonto(fila.descuento, moneda)}` : '',
    `Total del evento: ${formatoMonto(fila.total, moneda)}`,
    `Abonado acumulado: ${formatoMonto(fila.pagadoAcumulado, moneda)}`,
    `Saldo pendiente: ${formatoMonto(fila.saldo, moneda)}`,
    fila.servicios ? `Servicios: ${fila.servicios}` : '',
  ].filter(Boolean).join('\n'));
  const esCliente = tipo === 'cliente';
  const titulo = esCliente
    ? `Confirmamos tu ${tipoPago === 'senia' ? 'seña' : 'pago total'}`
    : `Nuevo ${tipoPago === 'senia' ? 'pago de seña' : 'pago total'} confirmado`;
  const texto = [
    esCliente ? `Hola ${cliente},` : 'Se confirmó un pago de Mercado Pago.',
    '',
    esCliente
      ? `Recibimos correctamente tu ${tipoPago === 'senia' ? 'seña del 30 %' : 'pago total'}.`
      : `Tipo de pago: ${asuntoPago}`,
    `Cliente: ${cliente}`,
    `Importe recibido: ${formatoMonto(montoTotalPago, moneda)}`,
    '',
    ...lineas,
    '',
    `Identificador de pago: ${paymentId}`,
    esCliente ? 'Gracias por confiar en BSfotografia & Videografia.' : '',
  ].filter(Boolean).join('\n');
  const bloquesHtml = filas.map((fila) => `
    <div style="margin:16px 0;padding:16px;border:1px solid #eee8e0;border-radius:8px">
      <h3 style="margin:0 0 8px;color:#722f4d">${escaparHtml(fila.descripcion)}</h3>
      <p style="margin:4px 0"><strong>Fecha del evento:</strong> ${escaparHtml(fila.fecha)}</p>
      ${fila.servicios ? `<p style="margin:4px 0"><strong>Servicios:</strong> ${escaparHtml(fila.servicios)}</p>` : ''}
      <p style="margin:4px 0"><strong>Importe de este pago:</strong> ${escaparHtml(formatoMonto(fila.monto, moneda))}</p>
      ${fila.descuento > 0 ? `<p style="margin:4px 0"><strong>Subtotal antes del descuento:</strong> ${escaparHtml(formatoMonto(fila.subtotal, moneda))}</p>` : ''}
      ${fila.descuento > 0 ? `<p style="margin:4px 0"><strong>Descuento por categoría completa:</strong> ${escaparHtml(formatoMonto(fila.descuento, moneda))}</p>` : ''}
      <p style="margin:4px 0"><strong>Total del evento:</strong> ${escaparHtml(formatoMonto(fila.total, moneda))}</p>
      <p style="margin:4px 0"><strong>Abonado acumulado:</strong> ${escaparHtml(formatoMonto(fila.pagadoAcumulado, moneda))}</p>
      <p style="margin:4px 0"><strong>Saldo pendiente:</strong> ${escaparHtml(formatoMonto(fila.saldo, moneda))}</p>
    </div>
  `).join('');
  const htmlContent = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#332927;line-height:1.6">
      <h2 style="color:#722f4d">${escaparHtml(titulo)}</h2>
      <p>${esCliente ? 'Hola ' + escaparHtml(cliente) + ', recibimos correctamente tu pago.' : 'Se confirmó un pago de Mercado Pago para la siguiente reserva.'}</p>
      <p><strong>Tipo:</strong> ${escaparHtml(asuntoPago)}<br>
      <strong>Cliente:</strong> ${escaparHtml(cliente)}<br>
      <strong>Importe recibido:</strong> ${escaparHtml(formatoMonto(montoTotalPago, moneda))}</p>
      ${bloquesHtml}
      <p style="color:#777;font-size:12px">Pago ${escaparHtml(paymentId)} · BSfotografia &amp; Videografia</p>
    </div>
  `;

  try {
    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: process.env.EMAIL_FROM_NAME?.trim() || 'BSfotografia & Videografia',
          email: emailFrom,
        },
        to: [{ email: destinatario }],
        subject: `${asuntoPago} - ${filas.length} evento(s)`,
        textContent: texto,
        htmlContent,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!emailResponse.ok) {
      const providerResponse = await emailResponse.text();
      let providerMessage = 'Sin detalle del proveedor';
      try {
        providerMessage = JSON.parse(providerResponse).message || providerMessage;
      } catch {
        providerMessage = providerResponse.slice(0, 300) || providerMessage;
      }
      throw new Error(`Brevo respondió ${emailResponse.status}: ${providerMessage}`);
    }

    await notificationRef.update({
      estado: 'sent',
      enviado: new Date().toISOString(),
    });
  } catch (error) {
    await notificationRef.update({
      estado: 'failed',
      error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      actualizado: new Date().toISOString(),
    });
    throw error;
  }
}

async function notificarPagoAprobado(paymentId, intent, payment) {
  const emailCliente = String(intent.usuario || '').trim().toLowerCase();
  const emailAdmin = process.env.EMAIL_TO?.trim().toLowerCase();
  const destinatarios = [
    { email: emailCliente, tipo: 'cliente' },
    ...(emailAdmin && emailAdmin !== emailCliente ? [{ email: emailAdmin, tipo: 'admin' }] : []),
  ];

  for (const destinatario of destinatarios) {
    try {
      await enviarNotificacionPago({
        paymentId,
        intent,
        payment,
        email: emailCliente,
        destinatario: destinatario.email,
        tipo: destinatario.tipo,
      });
    } catch (error) {
      console.error('No se pudo enviar la notificación de pago por email:', {
        paymentId: String(paymentId),
        tipo: destinatario.tipo,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function allocationMatchesReservation(reservation, allocation, tipoPago) {
  const total = Number(reservation?.total);
  const paid = Number(reservation?.pagado || 0);
  const amount = Number(allocation?.amount);
  const paymentType = allocation?.tipoPago || tipoPago || 'total';
  if (
    !Number.isFinite(total) ||
    !Number.isFinite(paid) ||
    !Number.isFinite(amount) ||
    total <= 0 ||
    paid < 0 ||
    paid >= total ||
    amount <= 0
  ) {
    return false;
  }

  const expectedAmount = paymentType === 'senia'
    ? Math.round(total * 0.3 * 100) / 100
    : Math.round((total - paid) * 100) / 100;
  return toMinorUnits(expectedAmount) === toMinorUnits(amount);
}

async function applyApprovedPayment(paymentId, verifiedPayment) {
  const payment = verifiedPayment || await paymentClient.get({ id: paymentId });
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
    await persistApprovedPayment(paymentId, payment, externalReference, intent, userDatabaseKey(intent.usuario));
    await notificarPagoAprobado(paymentId, intent, payment);
    return { status: 'approved' };
  }
  if (
    payment.currency_id !== 'UYU' ||
    toMinorUnits(payment.transaction_amount) !== toMinorUnits(intent.monto)
  ) {
    throw new Error('El monto o la moneda del pago no coincide con la reserva.');
  }

  const userKey = userDatabaseKey(intent.usuario);
  const existingPaymentSnapshot = await db
    .ref(`historial_pagos/${userKey}/${paymentId}`)
    .get();
  const paymentAlreadyRecorded = existingPaymentSnapshot.exists();
  const approvedAt = typeof payment.date_approved === 'string' &&
    Number.isFinite(Date.parse(payment.date_approved))
    ? new Date(payment.date_approved).toISOString()
    : new Date().toISOString();

  for (const allocation of intent.allocations) {
    let reservationRef = db.ref(`reservas/${userKey}/${allocation.id}`);
    let reservationSnapshot = await reservationRef.get();

    if (!reservationSnapshot.exists()) {
      const reservationsSnapshot = await db.ref(`reservas/${userKey}`).get();
      const reservations = reservationsSnapshot.val();
      const entries = reservations && typeof reservations === 'object'
        ? Object.entries(reservations).filter(([, reservation]) =>
            reservation && typeof reservation === 'object'
          )
        : [];
      const matchingById = entries.filter(([, reservation]) =>
        [allocation.id, allocation.reservaId].includes(String(reservation.id || ''))
      );

      let matchingReservations = matchingById;
      if (!matchingReservations.length) {
        let allocationDate = allocation.fecha
          ? String(allocation.fecha).split('T')[0]
          : '';
        let allocationEventType = allocation.tipoEvento;

        if ((!allocationDate || !allocationEventType) && allocation.description) {
          const separatorIndex = String(allocation.description).indexOf(' - ');
          if (separatorIndex >= 0) {
            const eventLabel = String(allocation.description).slice(0, separatorIndex);
            allocationDate = String(allocation.description)
              .slice(separatorIndex + 3)
              .split('T')[0];
            allocationEventType =
              eventLabel === '15 Años' ? '15_años' : eventLabel === 'Boda' ? 'bodas' : undefined;
          }
        }

        matchingReservations = entries.filter(([, reservation]) => {
          const reservationDate = String(reservation.fecha || '').split('T')[0];
          const reservationType = reservation.tipoEvento || (
            reservation.descripcion?.toLowerCase().includes('boda') ? 'bodas' : undefined
          );
          return (
            allocationDate &&
            allocationEventType &&
            reservationDate === allocationDate &&
            reservationType === allocationEventType &&
            allocationMatchesReservation(reservation, allocation, intent.tipoPago)
          );
        });
      }

      if (matchingReservations.length === 1) {
        reservationRef = db.ref(`reservas/${userKey}/${matchingReservations[0][0]}`);
        reservationSnapshot = await reservationRef.get();
      } else if (matchingReservations.length > 1) {
        throw new Error('No se pudo identificar una única reserva coincidente para el pago aprobado.');
      }
    }

    if (!reservationSnapshot.exists()) {
      const savedReservation = allocation.reservaSnapshot;
      const savedDate = String(savedReservation?.fecha || '').split('T')[0];
      const validSavedReservation =
        savedReservation &&
        userDatabaseKey(savedReservation.usuario) === userKey &&
        String(savedReservation.id || '') === String(allocation.reservaId || allocation.id) &&
        /^\d{4}-\d{2}-\d{2}$/.test(savedDate) &&
        allocationMatchesReservation(savedReservation, allocation, intent.tipoPago);

      if (validSavedReservation) {
        console.warn('Se restaurará la reserva desde la copia de la intención porque el pago está aprobado y la reserva ya no existe:', {
          paymentId: String(paymentId),
          externalReference,
          reservationId: allocation.id,
        });
      } else {
        const reservationsSnapshot = await db.ref(`reservas/${userKey}`).get();
        const reservations = reservationsSnapshot.val();
        const reservationKeys =
          reservations && typeof reservations === 'object' ? Object.keys(reservations) : [];
        console.error('No se encontró la reserva para aplicar el pago aprobado:', {
          paymentId: String(paymentId),
          externalReference,
          reservationId: allocation.id,
          tipoPago: allocation.tipoPago || intent.tipoPago || 'total',
          allocationAmount: allocation.amount,
          savedReservationValid: Boolean(validSavedReservation),
          reservationCount: reservationKeys.length,
          reservationKeys: reservationKeys.slice(0, 20),
        });
        throw new Error(
          reservationKeys.length
            ? `No se encontró una reserva coincidente entre las ${reservationKeys.length} reservas de la cuenta.`
            : 'La cuenta no tiene reservas en la base de datos configurada para el backend.'
        );
      }
    }

    let transaction;
    let callbackSawMissingReservation = false;
    let restoringReservationFromSnapshot = false;
    let paymentDataInvalid = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      callbackSawMissingReservation = false;
      restoringReservationFromSnapshot = false;
      paymentDataInvalid = false;

      transaction = await reservationRef.transaction((reservation) => {
        if (!reservation) {
          callbackSawMissingReservation = true;
          const savedReservation = allocation.reservaSnapshot;
          const savedDate = String(savedReservation?.fecha || '').split('T')[0];
          const canRestore =
            savedReservation &&
            userDatabaseKey(savedReservation.usuario) === userKey &&
            String(savedReservation.id || '') === String(allocation.reservaId || allocation.id) &&
            /^\d{4}-\d{2}-\d{2}$/.test(savedDate) &&
            allocationMatchesReservation(savedReservation, allocation, intent.tipoPago);

          if (!canRestore) return;
          restoringReservationFromSnapshot = true;
          reservation = {
            ...savedReservation,
            id: allocation.reservaId || allocation.id,
          };
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
          total <= 0 ||
          paid < 0 ||
          allocationAmount <= 0
        ) {
          paymentDataInvalid = true;
          return;
        }

        if (!paymentAlreadyRecorded || restoringReservationFromSnapshot) {
          const saldoPendiente = Math.max(0, total - paid);
          if (allocationAmount > saldoPendiente) {
            console.warn('Pago aprobado supera el saldo actual de la reserva; se registra el importe real:', {
              paymentId: String(paymentId),
              externalReference,
              reservationId: allocation.id,
              importePagado: allocationAmount,
              saldoPendiente,
            });
          }
          reservation.pagado = Math.round((paid + allocationAmount) * 100) / 100;
        }
        reservation.estado =
          toMinorUnits(reservation.pagado) >= toMinorUnits(total) ? 'pagado' : 'pendiente';
        if (
          (allocation.tipoPago || intent.tipoPago) === 'senia' &&
          !reservation.seniaConfirmadaAt
        ) {
          reservation.seniaConfirmadaAt = approvedAt;
        }
        reservation.pagosMercadoPago = reservation.pagosMercadoPago || {};
        reservation.pagosMercadoPago[paymentId] = true;
        return reservation;
      });

      if (
        transaction.committed ||
        transaction.snapshot.child(`pagosMercadoPago/${paymentId}`).exists()
      ) {
        break;
      }

      if (attempt === 0 && callbackSawMissingReservation && transaction.snapshot.exists()) {
        console.warn('Se reintentará la transacción: la reserva existe pese a recibir null en la primera lectura.', {
          paymentId: String(paymentId),
          externalReference,
          reservationId: allocation.id,
        });
        await reservationRef.get();
        continue;
      }

      break;
    }

    if (!transaction.committed && !transaction.snapshot.child(`pagosMercadoPago/${paymentId}`).exists()) {
      const reservationStillExists = transaction.snapshot.exists();
      console.error('No se pudo aplicar el pago aprobado a la reserva:', {
        paymentId: String(paymentId),
        externalReference,
        reservationId: allocation.id,
        reservationKey: reservationRef.key,
        reservationStillExists,
        callbackSawMissingReservation,
        paymentDataInvalid,
      });
      throw new Error(
        paymentDataInvalid
          ? 'Los importes de la reserva o del pago no son válidos.'
          : reservationStillExists
            ? 'Firebase no aplicó la actualización aunque la reserva existe; vuelve a intentar la confirmación.'
            : 'La reserva ya no existe en la base de datos del backend.'
      );
    }
  }

  await persistApprovedPayment(paymentId, payment, externalReference, intent, userKey);
  await notificarPagoAprobado(paymentId, intent, payment);

  return { status: 'approved' };
}

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
  res.send({ status: 'OK', message: 'Backend de BSfotografia & Videografia activo' });
});

// ---------------------------------------------
// MERCADO PAGO: PREFERENCIA DE PAGO
// ---------------------------------------------
app.post('/create_preference', requireFirebaseUser, (req, res, next) => {
  createPreference(req, res).catch(next);
});

app.post('/confirm_payment', requireFirebaseUser, async (req, res) => {
  let paymentId = '';
  let externalReference = '';
  let payment = null;

  try {
    paymentId = String(req.body?.payment_id || '');
    externalReference = String(req.body?.external_reference || '');
    if (!/^\d+$/.test(paymentId) || !/^[0-9a-f-]{36}$/i.test(externalReference)) {
      return res.status(400).json({ error: 'Faltan los datos para verificar el pago.' });
    }

    payment = await paymentClient.get({ id: paymentId });
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

    const result = await applyApprovedPayment(paymentId, payment);
    return res.status(result.status === 'approved' ? 200 : 202).json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error al confirmar pago de Mercado Pago:', {
      paymentId,
      externalReference,
      message: errorMessage,
      name: error instanceof Error ? error.name : 'UnknownError',
    });

    if (payment?.status === 'approved') {
      return res.status(500).json({
        error: `Mercado Pago confirmó el pago, pero no se pudo actualizar la reserva (${errorMessage}). No vuelvas a pagar; recarga esta página para reintentar la confirmación.`,
      });
    }

    return res.status(502).json({
      error:
        'No se pudo consultar o verificar el pago con Mercado Pago. No inicies otro pago; espera unos segundos y vuelve a cargar esta página para reintentar.',
    });
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
app.post('/api/ensure-album', requireFirebaseAuth, requireGalleryAdmin, async (req, res) => {
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
app.post('/api/gallery/ensure-own-folder', requireFirebaseAuth, async (req, res) => {
  try {
    const requestedEmail = typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : req.authenticatedEmail;
    if (!validEmail(requestedEmail)) {
      return res.status(400).json({ error: 'El email debe ser válido.' });
    }
    if (requestedEmail !== req.authenticatedEmail && req.authenticatedEmail !== 'admin@gmail.com') {
      return res.status(403).json({ error: 'Solo puedes preparar tu propia carpeta personal.' });
    }

    let targetUser;
    try {
      targetUser = requestedEmail === req.authenticatedEmail
        ? {
            uid: req.authenticatedUid,
            displayName: req.authenticatedName,
            email: req.authenticatedEmail,
          }
        : await auth.getUserByEmail(requestedEmail);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        return res.status(404).json({ error: 'No existe una cuenta registrada con ese correo.' });
      }
      throw error;
    }

    const album = await ensurePersonalGalleryAlbum(
      targetUser.email.toLowerCase().trim(),
      targetUser.uid,
      targetUser.displayName
    );
    return res.status(200).json({
      albumId: album.albumId,
      title: album.title || 'Galería general',
      email: album.email || targetUser.email,
      createdAt: album.createdAt,
      isDefault: true,
    });
  } catch (error) {
    console.error('❌ Error al preparar la carpeta personal de Google Photos:', error.message);
    return res.status(500).json({
      error: galleryErrorMessage(error, 'No se pudo crear la carpeta personal de Google Photos.'),
    });
  }
});

app.get('/api/gallery/:email/folders', requireFirebaseAuth, async (req, res) => {
  res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  const email = req.params.email;
  if (!validEmail(email)) {
    return res.status(400).json({ error: 'El email debe ser válido.' });
  }
  if (email.toLowerCase().trim() !== req.authenticatedEmail && req.authenticatedEmail !== 'admin@gmail.com') {
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
        title: defaultAlbum.title || 'Galería general',
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
app.post('/api/gallery/folders', requireFirebaseAuth, requireGalleryAdmin, async (req, res) => {
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
// GOOGLE PHOTOS: ASIGNAR ÁLBUM DEL ADMIN A CLIENTE
// ---------------------------------------------
app.post('/api/gallery/folders/assign', requireFirebaseAuth, requireGalleryAdmin, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const albumId = req.body?.albumId;
  if (!validEmail(email) || !validAlbumId(albumId)) {
    return res.status(400).json({ error: 'Indica un email válido y una carpeta existente.' });
  }
  if (email === req.authenticatedEmail) {
    return res.status(400).json({ error: 'Selecciona el correo del cliente, no el del administrador.' });
  }

  try {
    const sourceAlbum = await getGalleryAlbum(req.authenticatedEmail, albumId);
    if (!sourceAlbum) {
      return res.status(404).json({ error: 'La carpeta seleccionada no pertenece a tu galería.' });
    }

    const targetKey = encodeEmail(email);
    const targetRef = db.ref(`galeria_carpetas/${targetKey}/${albumId}`);
    const existingSnapshot = await targetRef.once('value');
    if (existingSnapshot.exists()) {
      return res.status(409).json({ error: 'Esa carpeta ya está asignada a este cliente.' });
    }

    const folder = {
      albumId,
      title: sourceAlbum.title || 'Galería general',
      email,
      createdAt: sourceAlbum.createdAt || new Date().toISOString(),
      sharedBy: req.authenticatedEmail,
    };
    await targetRef.set(folder);
    return res.status(201).json(folder);
  } catch (error) {
    console.error('❌ Error al asignar carpeta al cliente:', error.message);
    return res.status(500).json({ error: 'No se pudo asignar la carpeta al cliente.' });
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
  if (rawEmail.toLowerCase().trim() !== req.authenticatedEmail && req.authenticatedEmail !== 'admin@gmail.com') {
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
    const pageTokens = new Set();
    let pageToken = photosResponse.data.nextPageToken;
    while (pageToken) {
      if (pageTokens.has(pageToken)) {
        throw new Error('Google Photos devolvió un token de página repetido.');
      }
      pageTokens.add(pageToken);
      const nextPageResponse = await axios.post(
        'https://photoslibrary.googleapis.com/v1/mediaItems:search',
        { albumId: albumData.albumId, pageSize: 100, pageToken },
        { headers: photosResponse.config.headers }
      );
      mediaItems.push(...(nextPageResponse.data.mediaItems || []));
      pageToken = nextPageResponse.data.nextPageToken;
    }

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
app.post('/api/upload-photos', requireFirebaseAuth, requireGalleryAdmin, (req, res, next) => {
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
  const { targetEmail } = req.body;
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
  try {
    let targetUser;
    try {
      targetUser = targetEmail.trim().toLowerCase() === req.authenticatedEmail
        ? {
            uid: req.authenticatedUid,
            displayName: req.authenticatedName,
            email: req.authenticatedEmail,
          }
        : await auth.getUserByEmail(targetEmail.trim().toLowerCase());
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        return res.status(404).json({ error: 'No existe una cuenta registrada con ese correo.' });
      }
      throw error;
    }
    const albumData = await ensurePersonalGalleryAlbum(
      targetUser.email.toLowerCase().trim(),
      targetUser.uid,
      targetUser.displayName
    );
    const token = await getGooglePhotosToken();

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
app.post('/api/delete-photo/:photoId', requireFirebaseAuth, async (req, res) => {
  const { photoId } = req.params;
  const { email, albumId: requestedAlbumId } = req.body;

  if (!photoId || !validEmail(email) || !validAlbumId(requestedAlbumId)) {
    return res.status(400).json({ error: 'Falta photoId, email o carpeta válida.' });
  }
  if (req.authenticatedEmail !== 'admin@gmail.com') {
    return res.status(403).json({ error: 'Solo admin@gmail.com puede eliminar fotos.' });
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
// CORREO: FORMULARIO DE CONTACTO
// ---------------------------------------------
app.post('/api/contact', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (
    !name || name.length > 100 ||
    !validEmail(email) ||
    !message || message.length > 5000
  ) {
    return res.status(400).json({ error: 'Completa nombre, correo válido y mensaje (máximo 5000 caracteres).' });
  }

  const now = Date.now();
  const clientIp = req.ip;
  const attempts = (contactRequests.get(clientIp) || []).filter(timestamp => now - timestamp < 15 * 60 * 1000);
  if (attempts.length >= 5) {
    contactRequests.set(clientIp, attempts);
    return res.status(429).json({ error: 'Se alcanzó el límite de mensajes. Inténtalo nuevamente más tarde.' });
  }
  attempts.push(now);
  contactRequests.set(clientIp, attempts);

  const brevoApiKey = process.env.BREVO_API_KEY?.trim();
  const emailFrom = process.env.EMAIL_FROM?.trim();
  if (!brevoApiKey || !emailFrom || !validEmail(emailFrom)) {
    console.error('El correo de contacto no está configurado: revisa BREVO_API_KEY y EMAIL_FROM.');
    return res.status(503).json({ error: 'El formulario de contacto no está disponible temporalmente.' });
  }

  try {
    const escapeHtml = value => value.replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]);
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f4f4; color: #333;">
        <div style="max-width: 600px; margin: auto; background: #fff; padding: 20px; border-radius: 8px;">
          <h2 style="color: #722f4d; border-bottom: 2px solid #c2a16d; padding-bottom: 10px;">Nuevo mensaje de BSfotografia &amp; Videografia</h2>
          <p><strong>Nombre:</strong> ${escapeHtml(name)}</p>
          <p><strong>Correo:</strong> ${escapeHtml(email)}</p>
          <div style="border: 1px solid #ddd; padding: 15px; background: #fafafa; border-radius: 5px; margin-top: 15px;">
            <p style="white-space: pre-wrap; margin: 0;">${escapeHtml(message)}</p>
          </div>
        </div>
      </div>
    `;

    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: process.env.EMAIL_FROM_NAME?.trim() || 'BSfotografia & Videografia',
          email: emailFrom,
        },
        to: [{ email: process.env.EMAIL_TO?.trim() || 'esteban.garriga@gmail.com' }],
        replyTo: { email },
        subject: `Contacto BSfotografia & Videografia: ${name.slice(0, 80)}`,
        textContent: `Nombre: ${name}\nCorreo: ${email}\n\nMensaje:\n${message}`,
        htmlContent,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!emailResponse.ok) {
      const responseBody = await emailResponse.text();
      let providerMessage = 'Sin detalle del proveedor';
      try {
        providerMessage = JSON.parse(responseBody).message || providerMessage;
      } catch {
        providerMessage = responseBody.slice(0, 300) || providerMessage;
      }
      console.error('Brevo rechazó el correo de contacto:', {
        status: emailResponse.status,
        message: providerMessage,
      });
      return res.status(502).json({
        error: 'No se pudo enviar tu mensaje. Revisa la configuración de Brevo e inténtalo nuevamente.',
      });
    }

    return res.status(200).json({ message: '¡Gracias! Tu mensaje fue enviado. Te responderemos pronto.' });
  } catch (error) {
    console.error('Error al enviar correo de contacto:', {
      message: error.message,
      name: error.name,
    });
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? 'El servicio de correo tardó demasiado en responder. Inténtalo nuevamente en unos minutos.'
        : 'No se pudo enviar tu mensaje. Inténtalo nuevamente más tarde.',
    });
  }
});

app.post('/api/reservation-notification', requireFirebaseUser, async (req, res) => {
  const reservationId =
    typeof req.body?.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(req.body.id)
      ? req.body.id
      : '';
  if (!reservationId) {
    return res.status(400).json({ error: 'Falta un identificador de reserva válido.' });
  }

  const email = req.paymentUser.email.trim().toLowerCase();
  const userKey = userDatabaseKey(email);
  const reservationSnapshot = await db
    .ref(`reservas/${userKey}/${reservationId}`)
    .get();
  const reservation = reservationSnapshot.val();
  if (!reservation || typeof reservation !== 'object') {
    return res.status(404).json({ error: 'No se encontró la reserva de esta cuenta.' });
  }

  const date = String(reservation.fecha || '');
  const description = String(reservation.descripcion || '').trim();
  const eventType = reservation.tipoEvento;
  const total = Number(reservation.total);
  const descuento = Math.max(0, Number(reservation.descuento || 0));
  const subtotal = total + descuento;
  const services = Array.isArray(reservation.servicios) ? reservation.servicios : [];
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(date) ||
    !description ||
    !['15_años', 'bodas'].includes(eventType) ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return res.status(400).json({ error: 'Los datos guardados de la reserva no son válidos.' });
  }

  const notificationRef = db.ref(`notificaciones_reservas/${userKey}/${reservationId}`);
  let alreadySent = false;
  let alreadySending = false;
  const claim = await notificationRef.transaction((current) => {
    alreadySent = current?.estado === 'sent';
    alreadySending =
      current?.estado === 'sending' &&
      Date.now() - Date.parse(current.iniciado || '') < 2 * 60 * 1000;
    if (alreadySent || alreadySending) return;
    return { estado: 'sending', iniciado: new Date().toISOString() };
  });

  if (!claim.committed) {
    if (alreadySent) {
      return res.status(200).json({ message: 'El aviso de esta reserva ya fue enviado.' });
    }
    if (alreadySending) {
      return res.status(202).json({ message: 'El aviso de esta reserva ya se está enviando.' });
    }
    return res.status(503).json({ error: 'No se pudo reservar el envío del aviso. Inténtalo nuevamente.' });
  }

  const brevoApiKey = process.env.BREVO_API_KEY?.trim();
  const emailFrom = process.env.EMAIL_FROM?.trim();
  const emailTo = process.env.EMAIL_TO?.trim() || 'esteban.garriga@gmail.com';
  if (!brevoApiKey || !emailFrom || !validEmail(emailFrom) || !validEmail(emailTo)) {
    await notificationRef.update({ estado: 'failed' });
    console.error('El aviso por email de reservas no está configurado: revisa BREVO_API_KEY, EMAIL_FROM y EMAIL_TO.');
    return res.status(503).json({ error: 'El aviso por correo no está disponible temporalmente.' });
  }

  try {
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]);
    const eventName = eventType === '15_años' ? '15 años' : 'Boda';
    const serviceLines = services.map((service) =>
      `${String(service?.nombre || 'Servicio')} — $${Number(service?.precio || 0).toFixed(2)}`
    );
    const textContent = [
      'Nueva reserva de evento',
      `Cliente: ${email}`,
      `Fecha: ${date}`,
      `Tipo de evento: ${eventName}`,
      `Descripción: ${description}`,
      ...(descuento > 0 ? [`Subtotal: $${subtotal.toFixed(2)}`, `Descuento por categoría completa (10%): -$${descuento.toFixed(2)}`] : []),
      `Total: $${total.toFixed(2)}`,
      'Servicios:',
      ...(serviceLines.length ? serviceLines : ['Sin detalle de servicios']),
      `ID de reserva: ${reservationId}`,
    ].join('\n');
    const htmlContent = `
      <div style="font-family:Arial,sans-serif;color:#332927;line-height:1.6">
        <h2 style="color:#722f4d">Nueva reserva de evento</h2>
        <p><strong>Cliente:</strong> ${escapeHtml(email)}</p>
        <p><strong>Fecha:</strong> ${escapeHtml(date)}</p>
        <p><strong>Tipo de evento:</strong> ${eventName}</p>
        <p><strong>Descripción:</strong> ${escapeHtml(description)}</p>
        ${descuento > 0 ? `<p><strong>Subtotal:</strong> $${subtotal.toFixed(2)}<br><strong>Descuento por categoría completa (10%):</strong> −$${descuento.toFixed(2)}</p>` : ''}
        <p><strong>Total:</strong> $${total.toFixed(2)}</p>
        <p><strong>Servicios:</strong></p>
        <ul>${serviceLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('') || '<li>Sin detalle de servicios</li>'}</ul>
        <p><strong>ID de reserva:</strong> ${escapeHtml(reservationId)}</p>
      </div>`;
    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: process.env.EMAIL_FROM_NAME?.trim() || 'BSfotografia & Videografia',
          email: emailFrom,
        },
        to: [{ email: emailTo }],
        replyTo: { email },
        subject: `Nueva reserva: ${eventName} - ${date}`,
        textContent,
        htmlContent,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!emailResponse.ok) {
      const providerResponse = await emailResponse.text();
      console.error('Brevo rechazó el aviso de reserva:', {
        status: emailResponse.status,
        message: providerResponse.slice(0, 300),
        reservationId,
      });
      await notificationRef.update({ estado: 'failed' });
      return res.status(502).json({ error: 'Brevo no pudo enviar el aviso de la reserva.' });
    }

    await notificationRef.update({
      estado: 'sent',
      enviado: new Date().toISOString(),
    });
    return res.status(200).json({ message: 'Aviso de reserva enviado por correo.' });
  } catch (error) {
    await notificationRef.update({ estado: 'failed' });
    console.error('Error al enviar el aviso de reserva:', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
      reservationId,
    });
    const timedOut = error.name === 'TimeoutError' || error.name === 'AbortError';
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? 'El envío del aviso de reserva tardó demasiado.'
        : 'No se pudo enviar el aviso de la reserva.',
    });
  }
});

app.use((error, _req, res, _next) => {
  console.error('Error en el backend:', error.api_response?.content || error.message || error);
  if (!res.headersSent) {
    res.status(500).json({ error: 'No se pudo completar la operación.' });
  }
});

async function cancelarReservasVencidas() {
  const [reservasSnapshot, fechasSnapshot] = await Promise.all([
    db.ref('reservas').get(),
    db.ref('fechas_ocupadas').get(),
  ]);
  const reservasPorUsuario = reservasSnapshot.val();
  const fechasOcupadas = fechasSnapshot.val() || {};
  if (!reservasPorUsuario || typeof reservasPorUsuario !== 'object') return;

  const hoy = fechaActualUruguay();
  const cambios = {};

  for (const [userKey, reservas] of Object.entries(reservasPorUsuario)) {
    if (!reservas || typeof reservas !== 'object') continue;
    for (const [reservationKey, reserva] of Object.entries(reservas)) {
      if (!reserva || typeof reserva !== 'object' || !reserva.fecha) continue;

      const total = Number(reserva.total || 0);
      const pagado = Number(reserva.pagado || 0);
      if (total <= 0 || pagado >= total) continue;

      const fechaLimite = fechaLimitePago(reserva.fecha);
      if (!fechaLimite || hoy <= fechaLimite) continue;

      const reservationId = String(reserva.id || reservationKey);
      if (reserva.estado !== 'caducada') {
        cambios[`reservas/${userKey}/${reservationKey}/estado`] = 'caducada';
      }
      if (Object.prototype.hasOwnProperty.call(fechasOcupadas, reservationId)) {
        cambios[`fechas_ocupadas/${reservationId}`] = null;
      }
    }
  }

  if (Object.keys(cambios).length > 0) {
    await db.ref().update(cambios);
    console.info('Se cancelaron reservas que superaron el plazo de pago.');
  }
}

function fechaLimitePago(fecha) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha || '').split('T')[0]);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const fechaEvento = new Date(Date.UTC(year, month - 1, day));
  if (
    fechaEvento.getUTCFullYear() !== year ||
    fechaEvento.getUTCMonth() !== month - 1 ||
    fechaEvento.getUTCDate() !== day
  ) {
    return null;
  }
  fechaEvento.setUTCDate(fechaEvento.getUTCDate() - 3);
  return fechaEvento;
}

function fechaActualUruguay(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Montevideo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ahora);
  const obtener = tipo => Number(partes.find(parte => parte.type === tipo)?.value);
  return new Date(Date.UTC(obtener('year'), obtener('month') - 1, obtener('day')));
}

function diasHastaFechaLimite(fecha, ahora = new Date()) {
  const limite = fechaLimitePago(fecha);
  if (!limite) return null;
  const hoy = fechaActualUruguay(ahora);
  return Math.floor((limite.getTime() - hoy.getTime()) / seniaRecordatorioInterval);
}

async function enviarRecordatorioSaldo(email, reserva, saldo, diasRestantes) {
  const brevoApiKey = process.env.BREVO_API_KEY?.trim();
  const emailFrom = process.env.EMAIL_FROM?.trim();
  if (!brevoApiKey || !emailFrom || !validEmail(emailFrom) || !validEmail(email)) {
    throw new Error('La configuración de email para recordatorios de saldo no es válida.');
  }

  const fechaEvento = String(reserva.fecha).split('T')[0];
  const fechaLimite = fechaLimitePago(fechaEvento);
  if (!fechaLimite) throw new Error('La fecha de la reserva no es válida para enviar el recordatorio.');
  const fechaLimiteTexto = fechaLimite.toLocaleDateString('es-UY', { timeZone: 'UTC' });
  const asunto = `Recordatorio de saldo: quedan ${diasRestantes} días`;
  const texto = [
    'Hola,',
    '',
    `Te recordamos que queda un saldo de ${formatoMonto(saldo)} para completar el pago de tu evento.`,
    `Fecha del evento: ${fechaEvento}`,
    `Días restantes para completar el pago: ${diasRestantes}`,
    `Fecha límite: ${fechaLimiteTexto} (3 días antes del evento).`,
    `Consultas: ${contactPhone}`,
    '',
    'Este recordatorio se enviará cada 24 horas mientras el saldo siga pendiente y no haya vencido el plazo.',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#332927;line-height:1.6">
      <h2 style="color:#722f4d">Recordatorio de saldo pendiente</h2>
      <p>Hola, te recordamos que queda un saldo de <strong>${escaparHtml(formatoMonto(saldo))}</strong> para completar el pago de tu evento.</p>
      <p><strong>Fecha del evento:</strong> ${escaparHtml(fechaEvento)}<br>
      <strong>Días restantes para completar el pago:</strong> ${diasRestantes}<br>
      <strong>Fecha límite:</strong> ${escaparHtml(fechaLimiteTexto)} (3 días antes del evento).</p>
      <p>Si tienes alguna consulta, comunícate al <strong>${escaparHtml(contactPhone)}</strong>.</p>
      <p style="color:#777;font-size:12px">Este aviso se envía cada 24 horas mientras exista saldo pendiente y el plazo no haya vencido.</p>
    </div>
  `;
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': brevoApiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: {
        name: process.env.EMAIL_FROM_NAME?.trim() || 'BSfotografia & Videografia',
        email: emailFrom,
      },
      to: [{ email }],
      subject: asunto,
      textContent: texto,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const providerResponse = await response.text();
    throw new Error(`Brevo respondió ${response.status}: ${providerResponse.slice(0, 300)}`);
  }
}

async function enviarRecordatoriosDeSaldo() {
  const snapshot = await db.ref('reservas').get();
  const reservasPorUsuario = snapshot.val();
  if (!reservasPorUsuario || typeof reservasPorUsuario !== 'object') return;

  const ahora = Date.now();
  for (const [userKey, reservas] of Object.entries(reservasPorUsuario)) {
    if (!reservas || typeof reservas !== 'object') continue;
    for (const [reservationKey, reserva] of Object.entries(reservas)) {
      if (!reserva || typeof reserva !== 'object' || !reserva.fecha) continue;
      const total = Number(reserva.total || 0);
      const pagado = Number(reserva.pagado || 0);
      const saldo = Math.round((total - pagado) * 100) / 100;
      if (
        total <= 0 ||
        pagado <= 0 ||
        saldo <= 0 ||
        reserva.estado === 'caducada'
      ) {
        continue;
      }
      const email = String(reserva.usuario || '').trim().toLowerCase();
      if (!validEmail(email)) {
        console.error('No se pudo enviar el recordatorio: la reserva no tiene un email válido.', {
          reservationId: reservationKey,
          userKey,
        });
        continue;
      }

      const limite = fechaLimitePago(reserva.fecha);
      if (!limite) {
        console.error('No se pudo calcular el vencimiento del recordatorio de saldo:', {
          reservationId: reservationKey,
          fecha: reserva.fecha,
        });
        continue;
      }
      const hoy = fechaActualUruguay();
      if (hoy > limite) continue;

      const reservationRef = db.ref(`reservas/${userKey}/${reservationKey}`);
      if (!reserva.seniaConfirmadaAt) {
        await reservationRef.transaction(current => {
          if (!current || current.seniaConfirmadaAt) return;
          if (
            Number(current.total || 0) <= 0 ||
            Number(current.pagado || 0) <= 0 ||
            Number(current.pagado || 0) >= Number(current.total || 0) ||
            current.estado === 'caducada'
          ) {
            return;
          }
          return { ...current, seniaConfirmadaAt: new Date(ahora).toISOString() };
        });
        continue;
      }

      const seniaConfirmadaAt = Date.parse(reserva.seniaConfirmadaAt);
      if (!Number.isFinite(seniaConfirmadaAt)) {
        console.error('La fecha de confirmación de seña no es válida:', {
          reservationId: reservationKey,
          seniaConfirmadaAt: reserva.seniaConfirmadaAt,
        });
        continue;
      }

      const reminderRef = db.ref(`recordatorios_senia/${userKey}/${reservationKey}`);
      const reminderSnapshot = await reminderRef.get();
      const lastSentAt = Date.parse(reminderSnapshot.child('enviado').val() || '');
      const nextDueAt = Number.isFinite(lastSentAt)
        ? lastSentAt + seniaRecordatorioInterval
        : seniaConfirmadaAt + seniaRecordatorioInterval;
      if (ahora < nextDueAt) continue;

      let sendingRecently = false;
      const claim = await reminderRef.transaction(current => {
        const lastSent = Date.parse(current?.enviado || '');
        const startedAt = Date.parse(current?.iniciado || '');
        sendingRecently =
          current?.estado === 'sending' &&
          Number.isFinite(startedAt) &&
          ahora - startedAt < 2 * 60 * 1000;
        if (
          sendingRecently ||
          (Number.isFinite(lastSent) && ahora - lastSent < seniaRecordatorioInterval)
        ) {
          return;
        }
        return {
          ...(current || {}),
          estado: 'sending',
          iniciado: new Date(ahora).toISOString(),
          destinatario: reserva.usuario,
        };
      });
      if (!claim.committed) continue;

      try {
        const latestSnapshot = await reservationRef.get();
        const latest = latestSnapshot.val();
        if (
          !latest ||
          latest.estado === 'caducada' ||
          Number(latest.total || 0) <= Number(latest.pagado || 0) ||
          diasHastaFechaLimite(latest.fecha, new Date(ahora)) < 0
        ) {
          await reminderRef.update({
            estado: 'stopped',
            actualizado: new Date(ahora).toISOString(),
          });
          continue;
        }

        const latestEmail = String(latest.usuario || '').trim().toLowerCase();
        if (!validEmail(latestEmail)) {
          throw new Error('La reserva no tiene un email de cliente válido.');
        }
        const latestSaldo = Math.round(
          (Number(latest.total) - Number(latest.pagado || 0)) * 100
        ) / 100;
        const diasRestantes = diasHastaFechaLimite(latest.fecha, new Date(ahora));
        if (latestSaldo <= 0 || diasRestantes === null) {
          await reminderRef.update({
            estado: 'stopped',
            actualizado: new Date(ahora).toISOString(),
          });
          continue;
        }

        await enviarRecordatorioSaldo(latestEmail, latest, latestSaldo, diasRestantes);
        await reminderRef.update({
          estado: 'sent',
          enviado: new Date(ahora).toISOString(),
          destinatario: latestEmail,
          monto: latestSaldo,
          diasRestantes,
        });
      } catch (error) {
        await reminderRef.update({
          estado: 'failed',
          error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
          actualizado: new Date().toISOString(),
        });
        console.error('No se pudo enviar el recordatorio de saldo:', {
          reservationId: reservationKey,
          email: reserva.usuario,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

const ejecutarCancelacionReservasVencidas = () => {
  cancelarReservasVencidas().catch((error) => {
    console.error('No se pudieron cancelar las reservas vencidas:', error);
  });
};
const ejecutarRecordatoriosDeSaldo = () => {
  enviarRecordatoriosDeSaldo().catch((error) => {
    console.error('No se pudieron revisar los recordatorios de saldo:', error);
  });
};

ejecutarCancelacionReservasVencidas();
const cancelacionReservasTimer = setInterval(ejecutarCancelacionReservasVencidas, 60 * 60 * 1000);
cancelacionReservasTimer.unref();
ejecutarRecordatoriosDeSaldo();
const recordatoriosDeSaldoTimer = setInterval(ejecutarRecordatoriosDeSaldo, 15 * 60 * 1000);
recordatoriosDeSaldoTimer.unref();

app.listen(PORT, () => {
  console.log(`Backend de BSfotografia & Videografia ejecutándose en el puerto ${PORT}`);
});
