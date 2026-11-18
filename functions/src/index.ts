import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import express from 'express';
import cors from 'cors';
import { createHmac } from 'crypto';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnv = [
  'MP_ACCESS_TOKEN',
  'MP_WEBHOOK_SECRET',
  'FIREBASE_DATABASE_URL',
  'CLIENT_URL',
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

const auth = admin.auth();
const database = admin.database();

// Initialize Mercado Pago
const mercadopagoConfig = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// Create Express app
const app = express();
app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

// Middleware: Verify Firebase ID Token
async function verifyFirebaseToken(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token', message: error.message });
  }
}

// Middleware: Check admin role
function requireAdmin(req, res, next) {
  const adminEmails = process.env.ADMIN_EMAILS.split(',');
  if (!adminEmails.includes(req.user.email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook signature verification
function verifyWebhookSignature(dataId, requestId, signatureHeader) {
  const data = `id:${dataId};request-id:${requestId};`;
  const expected = createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
    .update(data)
    .digest('hex');
  return expected === signatureHeader;
}

// Create Mercado Pago preference
app.post('/create_preference', verifyFirebaseToken, (req, res, next) => {
  const { reservationId, amount, description, metadata } = req.body;
  
  const preferenceClient = new Preference(mercadopagoConfig);
  preferenceClient.create({
    body: {
      items: [
        {
          id: reservationId,
          title: description,
          quantity: 1,
          unit_price: amount,
        },
      ],
      payer: {
        email: req.user.email,
      },
      external_reference: reservationId,
      notification_url: `${process.env.BACKEND_PUBLIC_URL}/webhook`,
      back_urls: {
        success: `${process.env.CLIENT_URL}/agenda?payment=success`,
        failure: `${process.env.CLIENT_URL}/agenda?payment=failed`,
        pending: `${process.env.CLIENT_URL}/agenda?payment=pending`,
      },
      auto_return: 'approved',
    },
  })
    .then((preference) => {
      res.json({
        preferenceId: preference.id,
        initPoint: preference.init_point,
      });
    })
    .catch(next);
});

// Confirm payment
app.post('/confirm_payment', verifyFirebaseToken, async (req, res, next) => {
  try {
    const { paymentId, reservationId } = req.body;
    const paymentClient = new Payment(mercadopagoConfig);
    
    const payment = await paymentClient.get({ id: paymentId });
    
    if (payment.status !== 'approved') {
      return res.status(400).json({ error: 'Payment not approved' });
    }

    // Update reservation with payment info
    const reservationRef = database.ref(`reservas/${req.user.uid}/${reservationId}`);
    await reservationRef.transaction((current) => {
      if (!current) return;
      return {
        ...current,
        pagosMercadoPago: {
          ...(current.pagosMercadoPago || {}),
          [paymentId]: true,
        },
      };
    });

    res.json({ success: true, payment });
  } catch (error) {
    next(error);
  }
});

// Webhook for Mercado Pago notifications
app.post('/webhook', async (req, res) => {
  try {
    const { data, action } = req.body;
    
    if (!data?.id) {
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    const signature = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];

    if (!verifyWebhookSignature(data.id, requestId, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    if (action === 'payment.created' || action === 'payment.updated') {
      const paymentClient = new Payment(mercadopagoConfig);
      const payment = await paymentClient.get({ id: data.id });
      
      functions.logger.info(`Payment ${payment.id} status: ${payment.status}`);
    }

    res.json({ received: true });
  } catch (error) {
    functions.logger.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  functions.logger.error('Error:', error);
  res.status(500).json({
    error: error.message || 'Internal server error',
  });
});

// Export as Cloud Function
export const api = functions.https.onRequest(app);
