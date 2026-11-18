import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';

// Import routes
import reservationsRouter from './routes/reservations.js';
import paymentsRouter from './routes/payments.js';
import contactRouter from './routes/contact.js';
import galleryRouter from './routes/gallery.js';
import { verifyFirebaseAuth } from './middleware/auth.js';

// Provide defaults for development/emulator mode
const getEnv = (key: string, defaultValue?: string): string => {
  return process.env[key] || defaultValue || '';
};

// Get environment with defaults
const env = {
  MP_ACCESS_TOKEN: getEnv('MP_ACCESS_TOKEN', 'dummy-token'),
  MP_WEBHOOK_SECRET: getEnv('MP_WEBHOOK_SECRET', 'dummy-secret'),
  FIREBASE_DATABASE_URL: getEnv('FIREBASE_DATABASE_URL', 'https://fotos-44002-default-rtdb.firebaseio.com'),
  CLIENT_URL: getEnv('CLIENT_URL', 'http://localhost:4200'),
  BACKEND_PUBLIC_URL: getEnv('BACKEND_PUBLIC_URL', 'http://localhost:5001'),
  ADMIN_EMAILS: getEnv('ADMIN_EMAILS', 'admin@example.com'),
  BREVO_API_KEY: getEnv('BREVO_API_KEY', 'dummy-brevo-key'),
  EMAIL_FROM: getEnv('EMAIL_FROM', 'noreply@example.com'),
  EMAIL_TO: getEnv('EMAIL_TO', 'admin@example.com'),
};

// Initialize Firebase Admin SDK
admin.initializeApp({
  databaseURL: env.FIREBASE_DATABASE_URL,
});

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
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Event Planner Pro - Firebase Cloud Functions',
    timestamp: new Date().toISOString(),
  });
});

// Mount routers
app.use(reservationsRouter);
app.use(paymentsRouter);
app.use(contactRouter);
app.use(galleryRouter);

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  functions.logger.error('Unhandled error:', error);
  res.status(500).json({
    error: error.message || 'Internal server error',
  });
});

// Export as Cloud Function
export const api = functions.https.onRequest(app);
