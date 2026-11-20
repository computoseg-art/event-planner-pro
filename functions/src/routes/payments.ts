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
const expectedLiveMode = !String(process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');

// Helpers
function userDatabaseKey(email: string): string {
  return email.toLowerCase().trim().replace(/\./g, ',');
}

function validateEventDate(value: unknown, minimumDays: number): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!match) throw new Error('La fecha de la reserva no es válida.');

  const eventDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  eventDate.setHours(0, 0, 0, 0);
  const minimumDate = new Date(today);
  minimumDate.setDate(minimumDate.getDate() + minimumDays);

  if (eventDate < minimumDate) {
    throw new Error(
      minimumDays === 5
        ? 'Para pagar una seña deben faltar al menos 5 días para el evento.'
        : 'No se pueden realizar ni pagar reservas con menos de 3 días de anticipación.'
    );
  }
}

function validEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function sendPaymentNotifications(paymentId: string, intent: any, payment: any) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const clientEmail = String(intent.usuario || '').trim().toLowerCase();
  const adminEmail = process.env.EMAIL_TO?.trim().toLowerCase();
  if (!apiKey || !validEmail(from) || !validEmail(clientEmail)) {
    throw new Error('La configuración de email para notificaciones de pago no es válida.');
  }

  const recipients = [
    { email: clientEmail, type: 'cliente' },
    ...(validEmail(adminEmail) && adminEmail !== clientEmail
      ? [{ email: adminEmail, type: 'admin' }]
      : []),
  ];
  const amount = Number(payment.transaction_amount ?? intent.monto);
  const paymentType = intent.tipoPago === 'senia' ? 'Seña del 30 % recibida' : 'Pago recibido';
  for (const recipient of recipients) {
    const notificationRef = getDb().ref(`notificaciones_pagos/${paymentId}/${recipient.type}`);
    let alreadySent = false;
    let sending = false;
    const claim = await notificationRef.transaction((current: any) => {
      alreadySent = current?.estado === 'sent';
      sending =
        current?.estado === 'sending' &&
        Date.now() - Date.parse(current.iniciado || '') < 2 * 60 * 1000;
      if (alreadySent || sending) return;
      return { estado: 'sending', iniciado: new Date().toISOString(), destinatario: recipient.email };
    });
    if (!claim.committed) continue;

    const details = intent.allocations.map((allocation: any) => {
      const reservation = allocation.reservaSnapshot || {};
      const total = Number(reservation.total || 0);
      const paidBefore = Number(reservation.pagado || 0);
      const allocationAmount = Number(allocation.amount || 0);
      const balance = Math.max(0, total - paidBefore - allocationAmount);
      return `${reservation.descripcion || allocation.description || 'Evento'} — ${
        String(reservation.fecha || allocation.fecha || '').split('T')[0]
      }\nImporte recibido: $${allocationAmount.toFixed(2)}\nSaldo pendiente: $${balance.toFixed(2)}`;
    }).join('\n\n');
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: process.env.EMAIL_FROM_NAME?.trim() || 'BSfotografia & Videografia',
            email: from,
          },
          to: [{ email: recipient.email }],
          subject: `${paymentType} - BSfotografia & Videografia`,
          textContent: [
            recipient.type === 'cliente' ? `Hola ${clientEmail},` : 'Se confirmó un pago de Mercado Pago.',
            `${paymentType}. Importe total: $${amount.toFixed(2)} UYU.`,
            details,
            `Identificador de pago: ${paymentId}`,
          ].join('\n\n'),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Brevo respondió ${response.status}`);
      await notificationRef.update({ estado: 'sent', enviado: new Date().toISOString() });
    } catch (error) {
      await notificationRef.update({
        estado: 'failed',
        error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      });
      throw error;
    }
  }
}

async function applyApprovedPayment(paymentId: string, payment: any) {
  if (payment.status !== 'approved') {
    return { status: payment.status || 'pending' };
  }
  if (payment.live_mode !== expectedLiveMode) {
    throw new Error('El modo del pago no coincide con las credenciales configuradas.');
  }

  const externalReference = String(payment.external_reference || '');
  if (!externalReference) {
    throw new Error('El pago no está asociado a una intención registrada.');
  }

  const intentRef = getDb().ref(`pagos_pendientes/${externalReference}`);
  const intent = (await intentRef.get()).val();
  if (!intent?.usuario || !Array.isArray(intent.allocations)) {
    throw new Error('No se encontró la intención de pago asociada.');
  }
  if (payment.currency_id !== 'UYU') {
    throw new Error('La moneda del pago no coincide con la reserva.');
  }
  if (Math.round(Number(payment.transaction_amount) * 100) !== Math.round(Number(intent.monto) * 100)) {
    throw new Error('El monto del pago no coincide con la reserva.');
  }

  const userKey = userDatabaseKey(intent.usuario);
  for (const allocation of intent.allocations) {
    const reservationsSnapshot = await getDb().ref(`reservas/${userKey}`).get();
    const reservations = reservationsSnapshot.val() || {};
    const match = Object.entries(reservations).find(
      ([key, reservation]: [string, any]) =>
        reservation &&
        typeof reservation === 'object' &&
        (
          key === allocation.id ||
          String(reservation.id || '') === String(allocation.reservaId || allocation.id)
        )
    );
    if (!match) {
      throw new Error('No se encontró la reserva asociada al pago aprobado.');
    }
    const [reservationKey] = match;
    const reservationRef = getDb().ref(`reservas/${userKey}/${reservationKey}`);
    let listener: (() => void) | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        listener = () => resolve();
        reservationRef.on('value', listener, reject);
      });
      const transaction = await reservationRef.transaction((current: any) => {
        if (!current) return;
        if (current.pagosMercadoPago?.[paymentId]) return current;

        const alreadyPaidDeposit =
          (intent.tipoPago === 'senia' || allocation.tipoPago === 'senia') &&
          (
            Number(current.pagado || 0) > 0 ||
            Boolean(current.seniaConfirmadaAt)
          );
        const amountToApply = alreadyPaidDeposit ? 0 : Number(allocation.amount);
        const paid = Math.round((Number(current.pagado || 0) + amountToApply) * 100) / 100;
        return {
          ...current,
          pagado: paid,
          estado: paid >= Number(current.total) ? 'pagado' : 'pendiente',
          seniaConfirmadaAt:
            intent.tipoPago === 'senia' && !current.seniaConfirmadaAt
              ? payment.date_approved || new Date().toISOString()
              : current.seniaConfirmadaAt,
          pagosMercadoPago: {
            ...(current.pagosMercadoPago || {}),
            [paymentId]: true,
          },
        };
      });
      if (!transaction.committed) {
        throw new Error('Firebase no confirmó la aplicación del pago aprobado.');
      }
    } finally {
      if (listener) reservationRef.off('value', listener);
    }

    const persisted = (
      await reservationRef.child(`pagosMercadoPago/${paymentId}`).get()
    ).val();
    if (persisted !== true) {
      throw new Error('Firebase no persistió el identificador del pago aprobado.');
    }
  }

  await Promise.all([
    getDb().ref(`historial_pagos/${userKey}/${paymentId}`).set({
      fecha: payment.date_approved || new Date().toISOString(),
      monto: Number(payment.transaction_amount),
      paymentId,
      externalReference,
      descripcion: intent.tipoPago === 'senia' ? 'Seña del 30 % de Mercado Pago' : 'Pago de Mercado Pago',
      usuario: intent.usuario,
      tipoPago: intent.tipoPago,
      metodoPago: 'mercado_pago',
      moneda: payment.currency_id,
      estado: 'approved',
      reservas: intent.allocations,
    }),
    getDb().ref(`pagos_aprovados/${paymentId}`).set({
      paymentId,
      externalReference,
      estado: 'approved',
      monto: Number(payment.transaction_amount),
      fecha: payment.date_approved || new Date().toISOString(),
    }),
    intentRef.update({
      estado: 'approved',
      paymentId,
      aprobado: payment.date_approved || new Date().toISOString(),
    }),
  ]);
  try {
    await sendPaymentNotifications(paymentId, intent, payment);
  } catch (error) {
    functions.logger.error('Could not send payment notification', { paymentId, error });
  }

  return { status: 'approved' };
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
    const requestedId = String(req.body?.id || '');
    const tipoPago = String(req.body?.tipo_pago || 'total');
    const email = req.user!.email!;

    if (!['senia', 'total'].includes(tipoPago)) {
      return res.status(400).json({ error: 'El tipo de pago solicitado no es válido.' });
    }
    if (requestedId !== 'pago-general' && !/^[A-Za-z0-9_-]{1,128}$/.test(requestedId)) {
      return res.status(400).json({ error: 'Falta identificar la reserva a pagar.' });
    }
    if (tipoPago === 'senia' && requestedId === 'pago-general') {
      return res.status(400).json({ error: 'La seña debe pagarse para una reserva individual.' });
    }

    const reservations = (
      await getDb().ref(`reservas/${userDatabaseKey(email)}`).get()
    ).val();
    if (!reservations || typeof reservations !== 'object') {
      return res.status(404).json({ error: 'No se encontraron reservas para esta cuenta.' });
    }

    const selected = requestedId === 'pago-general'
      ? Object.entries(reservations)
      : [[requestedId, reservations[requestedId]]];
    const allocations = [];

    for (const [id, reservation] of selected as Array<[string, any]>) {
      if (!reservation || typeof reservation !== 'object') {
        if (requestedId !== 'pago-general') {
          return res.status(404).json({ error: 'No se encontró la reserva solicitada.' });
        }
        continue;
      }
      if (reservation.estado === 'caducada') continue;
      if (reservation.planCuotas) continue;

      const total = Number(reservation.total);
      const paid = Number(reservation.pagado || 0);
      const pendingCash = Object.values(reservation.pagosEfectivo || {})
        .filter((item: any) => item && ['pendiente_confirmacion', 'en_revision'].includes(item.estado))
        .reduce((sum: number, item: any) => sum + Number(item.monto || 0), 0);
      const outstanding = total - paid - pendingCash;
      if (!Number.isFinite(total) || !Number.isFinite(paid) || total <= 0 || outstanding <= 0) continue;

      validateEventDate(reservation.fecha, tipoPago === 'senia' ? 5 : 3);
      if (tipoPago === 'senia' && paid > 0) {
        return res.status(400).json({ error: 'La seña solo está disponible antes de realizar el primer pago.' });
      }

      allocations.push({
        id,
        reservaId: reservation.id || id,
        amount: tipoPago === 'senia'
          ? Math.round(total * 30) / 100
          : Math.round(outstanding * 100) / 100,
        tipoPago,
        fecha: reservation.fecha,
        tipoEvento: reservation.tipoEvento,
        reservaSnapshot: {
          ...reservation,
          id: reservation.id || id,
          usuario: email,
        },
        description: `${reservation.tipoEvento === '15_años' ? '15 Años' : 'Boda'} - ${reservation.fecha}`,
      });
    }

    if (!allocations.length) {
      return res.status(400).json({ error: 'No hay saldo pendiente para pagar.' });
    }

    const amount = Math.round(allocations.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
    const externalReference = crypto.randomUUID();
    const intentRef = getDb().ref(`pagos_pendientes/${externalReference}`);
    await intentRef.set({
      usuario: email,
      tipoPago,
      allocations,
      monto: amount,
      moneda: 'UYU',
      estado: 'pending',
      creado: new Date().toISOString(),
    });

    const mercadopagoConfig = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN!,
    });

    const preferenceClient = new Preference(mercadopagoConfig);
    const preference = await preferenceClient.create({
      body: {
        items: [
          {
            id: externalReference,
            title: requestedId === 'pago-general'
              ? 'Pago de deuda - Agenda'
              : tipoPago === 'senia'
                ? `Seña del 30% - ${allocations[0].description}`
                : allocations[0].description,
            quantity: 1,
            unit_price: amount,
            currency_id: 'UYU',
          },
        ],
        payer: {
          email,
        },
        external_reference: externalReference,
        notification_url: `${process.env.BACKEND_PUBLIC_URL}/webhook`,
        back_urls: {
          success: `${process.env.CLIENT_URL}/agenda`,
          failure: `${process.env.CLIENT_URL}/agenda`,
          pending: `${process.env.CLIENT_URL}/agenda`,
        },
        auto_return: 'approved',
        binary_mode: true,
      },
    });

    await intentRef.update({ preferenceId: preference.id });

    return res.json({
      id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
    });
  } catch (error) {
    functions.logger.error('Error creating preference:', error);
    return res.status(error instanceof Error && error.message.includes('días') ? 400 : 500).json({
      error: error instanceof Error ? error.message : 'No se pudo crear la preferencia de pago.',
    });
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

    if (!/^\d+$/.test(paymentId)) {
      return res.status(400).json({ error: 'Faltan los datos para verificar el pago.' });
    }

    const mercadopagoConfig = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN!,
    });

    const paymentClient = new Payment(mercadopagoConfig);
    const payment = await paymentClient.get({ id: paymentId });
    const paymentExternalReference = String(payment.external_reference || '');

    if (
      !/^[0-9a-f-]{36}$/i.test(paymentExternalReference) ||
      (externalReference && paymentExternalReference !== externalReference)
    ) {
      return res.status(400).json({ error: 'El pago no corresponde a esta operación.' });
    }
    externalReference = paymentExternalReference;

    // Verify payment belongs to user
    const intentSnapshot = await getDb().ref(`pagos_pendientes/${externalReference}`).get();
    const intent = intentSnapshot.val();

    if (
      !intent ||
      userDatabaseKey(intent.usuario) !== userDatabaseKey(req.user!.email!)
    ) {
      return res.status(403).json({ error: 'El pago no corresponde a esta cuenta.' });
    }

    const result = await applyApprovedPayment(paymentId, payment);
    return res.status(result.status === 'approved' ? 200 : 202).json(result);
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

    await applyApprovedPayment(paymentId, payment);
    functions.logger.info(`Payment webhook processed: ${paymentId}`);

    return res.sendStatus(200);
  } catch (error) {
    functions.logger.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
