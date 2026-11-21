import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import express from 'express';
import cors from 'cors';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getDatabase } from 'firebase-admin/database';

// Import routes
import reservationsRouter from './routes/reservations.js';
import paymentsRouter from './routes/payments.js';
import contactRouter from './routes/contact.js';
import galleryRouter from './routes/gallery.js';
import { verifyFirebaseAuth } from './middleware/auth.js';

const mpAccessToken = defineSecret('MP_ACCESS_TOKEN');
const mpWebhookSecret = defineSecret('MP_WEBHOOK_SECRET');
const brevoApiKey = defineSecret('BREVO_API_KEY');
const b2KeyId = defineSecret('B2_KEY_ID');
const b2ApplicationKey = defineSecret('B2_APPLICATION_KEY');

// Provide defaults for development/emulator mode
const getEnv = (key: string, defaultValue?: string): string => {
  return process.env[key] || defaultValue || '';
};

// Get environment with defaults
const env = {
  MP_ACCESS_TOKEN: getEnv('MP_ACCESS_TOKEN', 'dummy-token'),
  MP_WEBHOOK_SECRET: getEnv('MP_WEBHOOK_SECRET', 'dummy-secret'),
  CLIENT_URL: getEnv('CLIENT_URL', 'http://localhost:4200'),
  BACKEND_PUBLIC_URL: getEnv('BACKEND_PUBLIC_URL', 'http://localhost:5001'),
  ADMIN_EMAILS: getEnv('ADMIN_EMAILS', 'admin@example.com'),
  BREVO_API_KEY: getEnv('BREVO_API_KEY', 'dummy-brevo-key'),
  EMAIL_FROM: getEnv('EMAIL_FROM', 'noreply@example.com'),
  EMAIL_TO: getEnv('EMAIL_TO', 'admin@example.com'),
};

// Firebase supplies the project and Realtime Database configuration at runtime.
admin.initializeApp();

// Create Express app
const app = express();

// CORS configuration
const allowedOrigins = new Set([
  env.CLIENT_URL,
  'https://fotos-44002.web.app',
  'https://fotos-44002.firebaseapp.com',
  'http://localhost:4200',
  'http://localhost:4500',
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        functions.logger.warn(`CORS blocked: ${origin}`);
        callback(null, false);
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get(['/', '/api', '/api/'], (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Event Planner Pro - Firebase Cloud Functions',
    timestamp: new Date().toISOString(),
  });
});

// Mount routers under /api prefix
app.use('/api', reservationsRouter);
app.use('/api', paymentsRouter);
app.use('/api', contactRouter);
app.use('/api', galleryRouter);

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  functions.logger.error('Unhandled error:', error);
  res.status(500).json({
    error: error.message || 'Internal server error',
  });
});

// Export as Cloud Function
export const api = functions.https.onRequest(
  {
    secrets: [
      mpAccessToken,
      mpWebhookSecret,
      brevoApiKey,
      b2KeyId,
      b2ApplicationKey,
    ],
  },
  app
);

function paymentDeadline(dateValue: unknown): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || '').split('T')[0]);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) return null;
  date.setUTCDate(date.getUTCDate() - 3);
  return date;
}

function currentUruguayDate(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Montevideo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(value('year'), value('month') - 1, value('day')));
}

async function runScheduledMaintenance(): Promise<void> {
  const database = getDatabase();
  const reservationsSnapshot = await database.ref('reservas').get();
  const reservationsByUser = reservationsSnapshot.val();
  if (!reservationsByUser || typeof reservationsByUser !== 'object') return;

  const now = Date.now();
  const today = currentUruguayDate(new Date(now));
  const updates: Record<string, unknown> = {};
  for (const [userKey, reservations] of Object.entries(reservationsByUser)) {
    if (!reservations || typeof reservations !== 'object') continue;
    for (const [reservationKey, reservationValue] of Object.entries(reservations)) {
      const reservation = reservationValue as any;
      if (!reservation || typeof reservation !== 'object' || !reservation.fecha) continue;
      const total = Number(reservation.total || 0);
      const paid = Number(reservation.pagado || 0);
      const deadline = paymentDeadline(reservation.fecha);
      if (
        !Number.isFinite(total) ||
        !Number.isFinite(paid) ||
        total <= 0 ||
        paid >= total ||
        !deadline
      ) continue;

      const reservationId = String(reservation.id || reservationKey);
      if (today > deadline) {
        updates[`reservas/${userKey}/${reservationKey}/estado`] = 'caducada';
        updates[`fechas_ocupadas/${reservationId}`] = null;
        continue;
      }
      if (!reservation.seniaConfirmadaAt && paid > 0) {
        updates[`reservas/${userKey}/${reservationKey}/seniaConfirmadaAt`] =
          new Date(now).toISOString();
        continue;
      }
      if (!reservation.seniaConfirmadaAt) continue;

      const lastReminder = (
        await database.ref(`recordatorios_senia/${userKey}/${reservationKey}`).get()
      ).val();
      const lastSent = Date.parse(lastReminder?.enviado || '');
      const confirmedAt = Date.parse(reservation.seniaConfirmadaAt);
      const nextDueAt = Number.isFinite(lastSent)
        ? lastSent + 24 * 60 * 60 * 1000
        : confirmedAt + 24 * 60 * 60 * 1000;
      if (!Number.isFinite(nextDueAt) || now < nextDueAt) continue;

      const reminderRef = database.ref(`recordatorios_senia/${userKey}/${reservationKey}`);
      const claim = await reminderRef.transaction((current: any) => {
        const started = Date.parse(current?.iniciado || '');
        const sent = Date.parse(current?.enviado || '');
        if (
          current?.estado === 'sending' &&
          Number.isFinite(started) &&
          now - started < 2 * 60 * 1000
        ) return;
        if (Number.isFinite(sent) && now - sent < 24 * 60 * 60 * 1000) return;
        return {
          ...(current || {}),
          estado: 'sending',
          iniciado: new Date(now).toISOString(),
        };
      });
      if (!claim.committed) continue;

      try {
        const currentReservation = (
          await database.ref(`reservas/${userKey}/${reservationKey}`).get()
        ).val();
        const currentTotal = Number(currentReservation?.total || 0);
        const currentPaid = Number(currentReservation?.pagado || 0);
        const balance = Math.round((currentTotal - currentPaid) * 100) / 100;
        const email = String(currentReservation?.usuario || '').trim().toLowerCase();
        if (
          !currentReservation ||
          currentReservation.estado === 'caducada' ||
          balance <= 0 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
          await reminderRef.update({ estado: 'stopped', actualizado: new Date(now).toISOString() });
          continue;
        }
        const daysRemaining = Math.floor((deadline.getTime() - today.getTime()) / 86400000);
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'api-key': process.env.BREVO_API_KEY?.trim() || '',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            sender: {
              name: process.env.EMAIL_FROM_NAME?.trim() || 'BSfotografia & Videografia',
              email: process.env.EMAIL_FROM?.trim(),
            },
            to: [{ email }],
            subject: `Recordatorio de saldo: quedan ${daysRemaining} días`,
            textContent: [
              'Hola,',
              `Te recordamos que queda un saldo de $${balance.toFixed(2)} UYU.`,
              `Fecha del evento: ${String(currentReservation.fecha).split('T')[0]}`,
              `Fecha límite: ${deadline.toISOString().slice(0, 10)}`,
              `Consultas: ${process.env.CONTACT_PHONE?.trim() || '+598 97 403 118'}`,
            ].join('\n\n'),
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error(`Brevo respondió ${response.status}`);
        await reminderRef.update({
          estado: 'sent',
          enviado: new Date(now).toISOString(),
          destinatario: email,
          monto: balance,
          diasRestantes: daysRemaining,
        });
      } catch (error) {
        await reminderRef.update({
          estado: 'failed',
          error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
          actualizado: new Date(now).toISOString(),
        });
      }
    }
  }
  if (Object.keys(updates).length > 0) await database.ref().update(updates);
}

export const reservationMaintenance = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'America/Montevideo',
    secrets: [brevoApiKey],
  },
  async () => {
    try {
      await runScheduledMaintenance();
    } catch (error) {
      functions.logger.error('Scheduled reservation maintenance failed', error);
      throw error;
    }
  }
);
