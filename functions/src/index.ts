import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Import routes
import reservationsRouter from './routes/reservations.js';
import paymentsRouter from './routes/payments.js';
import contactRouter from './routes/contact.js';
import galleryRouter from './routes/gallery.js';
import { verifyFirebaseAuth } from './middleware/auth.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnv = [
  'MP_ACCESS_TOKEN',
  'MP_WEBHOOK_SECRET',
  'FIREBASE_DATABASE_URL',
  'CLIENT_URL',
  'BACKEND_PUBLIC_URL',
  'ADMIN_EMAILS',
  'BREVO_API_KEY',
  'EMAIL_FROM',
  'EMAIL_TO',
];

for (const env of requiredEnv) {
  if (!process.env[env]) {
    throw new Error(`Missing required environment variable: ${env}`);
  }
}

// Initialize Firebase Admin SDK
admin.initializeApp({
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

// Create Express app
const app = express();

// CORS configuration
const allowedOrigins = new Set([
  process.env.CLIENT_URL,
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
