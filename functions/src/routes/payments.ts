/**
 * Payments routes - Mercado Pago integration
 */

import { Router, Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { getDatabase, Database } from 'firebase-admin/database';
import * as functions from 'firebase-functions';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { verifyFirebaseAuth } from '../middleware/auth.js';

let db: Database | null = null;

function getDb(): Database {
  if (!db) {
    db = getDatabase();
  }
  return db;
}

const router = Router();

// Helpers
function userDatabaseKey(email: string): string {
  return email.toLowerCase().trim().replace(/\./g, ',');
}

function verifyWebhookSignature(dataId: string, requestId: string, signatureHeader: string): boolean {
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
  const expected = createHmac('sha256', process.env.MP_WEBHOOK_SECRET!)
    .update(manifest)
    .digest();
  const received = Buffer.from(signature, 'hex');

  try {
    return received.length === expected.length && timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

/**
 * POST /create_preference - Create Mercado Pago payment preference
 */
router.post('/create_preference', verifyFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const { reservationId, amount, description } = req.body;

    if (!reservationId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Datos de pago incompletos.' });
    }

    const mercadopagoConfig = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN!,
    });

    const preferenceClient = new Preference(mercadopagoConfig);
    const preference = await preferenceClient.create({
      body: {
        items: [
          {
            id: reservationId,
            title: description || 'Pago de reserva',
            quantity: 1,
            unit_price: amount,
          },
        ],
        payer: {
          email: req.user!.email!,
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
    });

    // Store intent in database
    const userKey = userDatabaseKey(req.user!.email!);
    await getDb().ref(`pagos_pendientes/${reservationId}`).set({
      usuario: req.user!.email!,
      monto: amount,
      estado: 'pending',
      createdAt: new Date().toISOString(),
      preferenceId: preference.id,
    });

    return res.json({
      id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
    });
  } catch (error) {
    functions.logger.error('Error creating preference:', error);
    return res.status(500).json({ error: 'No se pudo crear la preferencia de pago.' });
  }
});

/**
 * POST /confirm_payment - Confirm and apply approved payment
 */
router.post('/confirm_payment', verifyFirebaseAuth, async (req: Request, res: Response) => {
  let paymentId = '';
  let externalReference = '';

  try {
    paymentId = String(req.body?.payment_id || '');
    externalReference = String(req.body?.external_reference || '');

    if (!/^\d+$/.test(paymentId) || !/^[0-9a-f-]{36}$/i.test(externalReference)) {
      return res.status(400).json({ error: 'Faltan los datos para verificar el pago.' });
    }

    const mercadopagoConfig = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN!,
    });

    const paymentClient = new Payment(mercadopagoConfig);
    const payment = await paymentClient.get({ id: paymentId });

    if (payment.external_reference !== externalReference) {
      return res.status(400).json({ error: 'El pago no corresponde a esta operación.' });
    }

    if (payment.status !== 'approved') {
      return res.status(400).json({ error: 'El pago no ha sido aprobado.' });
    }

    // Verify payment belongs to user
    const intentSnapshot = await getDb().ref(`pagos_pendientes/${externalReference}`).get();
    const intent = intentSnapshot.val();

    if (
      !intent ||
      userDatabaseKey(intent.usuario) !== userDatabaseKey(req.user!.email!)
    ) {
      return res.status(403).json({ error: 'El pago no corresponde a esta cuenta.' });
    }

    // Apply payment to reservation
    const userKey = userDatabaseKey(req.user!.email!);
    const reservationRef = getDb().ref(`reservas/${userKey}/${externalReference}`);

    await reservationRef.transaction((current: any) => {
      if (!current) return;

      const paid = Number(current.pagado || 0);
      const amount = Number(payment.transaction_amount || intent.monto || 0);

      return {
        ...current,
        pagado: paid + amount,
        estado: paid + amount >= current.total ? 'pagado' : 'pendiente',
        pagosMercadoPago: {
          ...(current.pagosMercadoPago || {}),
          [paymentId]: true,
        },
      };
    });

    // Record payment history
    const historyData = {
      fecha: new Date().toISOString(),
      monto: payment.transaction_amount || intent.monto,
      paymentId: String(paymentId),
      externalReference,
      usuario: req.user!.email!,
      metodoPago: 'mercado_pago',
      estado: 'approved',
    };

    await getDb().ref(`historial_pagos/${userKey}/${paymentId}`).set(historyData);
    await getDb().ref(`pagos_pendientes/${externalReference}/estado`).set('approved');

    return res.json({ success: true, payment });
  } catch (error) {
    functions.logger.error('Error confirming payment:', { paymentId, externalReference, error });
    return res.status(500).json({ error: 'No se pudo confirmar el pago.' });
  }
});

/**
 * POST /webhook - Mercado Pago webhook notifications
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const paymentId = String(req.body?.data?.id || req.query['data.id'] || req.query.id || '');
    const eventType = req.body?.type || req.query.type || req.query.topic;

    if (eventType !== 'payment') {
      return res.sendStatus(200);
    }

    if (!/^\d+$/.test(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment ID' });
    }

    const signature = req.get('x-signature') || '';
    const requestId = req.get('x-request-id') || '';

    if (!verifyWebhookSignature(paymentId, requestId, signature)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Get payment data
    const mercadopagoConfig = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN!,
    });

    const paymentClient = new Payment(mercadopagoConfig);
    const payment = await paymentClient.get({ id: paymentId });

    if (payment.status === 'approved' && payment.external_reference) {
      // Mark as approved in database
      await getDb().ref(`pagos_pendientes/${payment.external_reference}/estado`).set('approved');
      await getDb().ref(`pagos_aprovados/${paymentId}`).set({
        paymentId,
        estado: 'approved',
        monto: payment.transaction_amount,
        fecha: new Date().toISOString(),
      });

      functions.logger.info(`Payment ${paymentId} approved via webhook`);
    }

    return res.sendStatus(200);
  } catch (error) {
    functions.logger.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
