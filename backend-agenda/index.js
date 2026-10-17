import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Preference } from 'mercadopago';

import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import axios from 'axios';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------
// INICIALIZACIÓN DE FIREBASE ADMIN SDK
// ---------------------------------------------
let serviceAccount;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    console.log('✅ [Firebase] Configuración cargada desde variable de entorno.');
  } else {
    const serviceAccountPathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json';
    const serviceAccountPath = path.join(__dirname, serviceAccountPathEnv);
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    console.log('✅ [Firebase] Configuración cargada desde archivo local.');
  }
} catch (err) {
  console.error(`❌ Error al cargar la clave de servicio de Firebase:`, err.message);
  process.exit(1);
}

const databaseURL = process.env.FIREBASE_DATABASE_URL
  || `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`;

initializeApp({
  credential: cert(serviceAccount),
  databaseURL
});

const db = getDatabase();
const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de Multer para archivos en memoria
const upload = multer({ storage: multer.memoryStorage() });

// Configuración de Mercado Pago
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// Dominios permitidos (Producción y Desarrollo local)
const allowedOrigins = [
  'https://fotos-44002.web.app',
  'https://fotos-44002.firebaseapp.com',
  'http://localhost:4200',
  'http://localhost:4500'
];

if (process.env.CLIENT_URL) {
  allowedOrigins.push(process.env.CLIENT_URL.trim().replace(/\/$/, ''));
}

app.use(cors({
  origin: function (origin, callback) {
    // Permitir peticiones sin origen (como Postman o llamadas internas)
    // o verificar si el origen está en la lista permitida (ignorando barras al final)
    const match = !origin || allowedOrigins.some(allowed =>
      origin.trim().replace(/\/$/, '') === allowed.trim().replace(/\/$/, '')
    );

    if (match) {
      callback(null, true);
    } else {
      console.warn(`⚠️ Origen bloqueado por CORS: ${origin}`);
      // Pasamos 'false' en lugar de un Error para que no crashee el servidor
      callback(null, false);
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------
// HELPER: SANEAR EMAIL (Puntos a Comas para Realtime DB)
// ---------------------------------------------
function encodeEmail(email) {
  if (!email) return '';
  return email.toLowerCase().trim().replace(/\./g, ',');
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
app.post('/create_preference', async (req, res) => {
  try {
    const { total, descripcion, fecha } = req.body;

    if (!total || isNaN(Number(total)) || Number(total) <= 0) {
      return res.status(400).json({
        error: 'El monto total es requerido y debe ser mayor a 0.'
      });
    }

    if (fecha) {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      const [year, month, day] = fecha.split('T')[0].split('-').map(Number);
      const fechaEvento = new Date(year, month - 1, day);
      fechaEvento.setHours(0, 0, 0, 0);

      const fechaMinimaReserva = new Date(hoy);
      fechaMinimaReserva.setDate(hoy.getDate() + 3);

      if (fechaEvento < fechaMinimaReserva) {
        return res.status(400).json({
          error: 'No se pueden realizar ni pagar reservas con menos de 3 días de anticipación.'
        });
      }

      const fechaLimitePago = new Date(fechaEvento);
      fechaLimitePago.setDate(fechaEvento.getDate() - 2);

      if (hoy > fechaLimitePago) {
        return res.status(400).json({
          error: 'La reserva ha caducado. El plazo límite de pago era hasta 2 días antes del evento.'
        });
      }
    }

    const clientUrl = process.env.CLIENT_URL || 'https://calendario-71490.web.app';

    const body = {
      items: [
        {
          title: descripcion || 'Reserva de Servicio',
          quantity: 1,
          unit_price: Number(total),
          currency_id: 'UYU',
        },
      ],
      back_urls: {
        success: `${clientUrl}/agenda`,
        failure: `${clientUrl}/agenda`,
        pending: `${clientUrl}/agenda`,
      },
      auto_return: 'approved',
      binary_mode: true,
    };

    const preference = new Preference(client);
    const result = await preference.create({ body });

    res.json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
    });

  } catch (error) {
    console.error('Error detallado:', error.api_response?.content || error);
    res.status(500).json({ error: 'Error al crear la preferencia de pago.' });
  }
});

// ---------------------------------------------
// GOOGLE PHOTOS: ASEGURAR / CREAR ÁLBUM
// ---------------------------------------------
app.post('/api/ensure-album', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'El email es obligatorio.' });
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
// GOOGLE PHOTOS: OBTENER FOTOS DE UN USUARIO
// ---------------------------------------------
app.get('/api/gallery/:email', async (req, res) => {
  const rawEmail = req.params.email;
  const cleanEmail = encodeEmail(rawEmail);

  try {
    const snapshot = await db.ref(`albumes/${cleanEmail}`).once('value');
    const albumData = snapshot.val();

    if (!albumData || !albumData.albumId) {
      return res.status(404).json({ error: 'No se encontró un álbum asociado a este usuario.' });
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
      rawBaseUrl: p.baseUrl,
      filename: p.filename,
      mimeType: p.mimeType
    }));

    res.status(200).json(photos);

  } catch (error) {
    console.error('❌ Error al cargar galería:', error.message);
    res.status(500).json({ error: 'Error al recuperar imágenes de la galería.' });
  }
});

// ---------------------------------------------
// GOOGLE PHOTOS: SUBIR FOTOS AL ÁLBUM
// ---------------------------------------------
app.post('/api/upload-photos', upload.array('photos'), async (req, res) => {
  const { targetEmail } = req.body;
  const files = req.files;

  if (!targetEmail || !files || files.length === 0) {
    return res.status(400).json({ error: 'Debes especificar el email del destinatario y adjuntar archivos.' });
  }

  const cleanEmail = encodeEmail(targetEmail);

  try {
    let snapshot = await db.ref(`albumes/${cleanEmail}`).once('value');
    let albumData = snapshot.val();

    let token = await getGooglePhotosToken();

    if (!albumData || !albumData.albumId) {
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
            'X-Goog-Upload-File-Name': file.originalname,
            'X-Goog-Upload-Protocol': 'raw'
          }
        }
      )
    );

    const uploadResponses = await Promise.all(uploadRequests);
    const newMediaItems = uploadResponses.map(r => ({
      simpleMediaItem: { uploadToken: r.data }
    }));

    await axios.post(
      'https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate',
      { albumId: albumData.albumId, newMediaItems },
      { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }
    );

    res.status(200).json({ message: 'Fotos subidas y agregadas al álbum correctamente.' });

  } catch (error) {
    console.error('❌ Error en /api/upload-photos:', error.response?.data?.error || error.message);
    res.status(500).json({ error: 'Error al procesar la subida de fotos.' });
  }
});

// ---------------------------------------------
// GOOGLE PHOTOS: ELIMINAR FOTO
// ---------------------------------------------
app.post('/api/delete-photo/:photoId', async (req, res) => {
  const { photoId } = req.params;
  const { email } = req.body;

  if (!photoId || !email) {
    return res.status(400).json({ error: 'Falta photoId o email del usuario.' });
  }

  const cleanEmail = encodeEmail(email);

  try {
    const snapshot = await db.ref(`albumes/${cleanEmail}`).once('value');
    const albumData = snapshot.val();

    if (!albumData || !albumData.albumId) {
      return res.status(404).json({ error: 'Álbum no encontrado para este usuario.' });
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
    res.status(500).json({ error: 'Error al eliminar la foto.' });
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

app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`);
});
