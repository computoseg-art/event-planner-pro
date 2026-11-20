/**
 * Reservations routes - CRUD operations
 */

import { Router, Request, Response } from 'express';
import { getDatabase, Database } from 'firebase-admin/database';
import * as functions from 'firebase-functions';
import { verifyFirebaseAuth, requireAdmin } from '../middleware/auth.js';
import { createInstallmentPlan, PlanCuotas } from '../services/installment-plan.js';
import { validateReservationInput } from '../services/catalogo-servicios.js';

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

function daysUntilReservationDate(dateStr: string): number {
  const eventDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  eventDate.setHours(0, 0, 0, 0);
  return Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function validReservationId(id: string): boolean {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

function validReservationDate(date: string): boolean {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(date);
  return !isNaN(d.getTime());
}

async function setReservationDateLock(
  reservationId: string,
  date: string,
  oldDate = '',
): Promise<void> {
  let occupied = false;
  const result = await getDb().ref('fechas_ocupadas').transaction((current: any) => {
    occupied = false;
    const locks = current && typeof current === 'object' ? current : {};
    if (Object.entries(locks).some(([otherId, otherDate]) =>
      otherId !== reservationId && String(otherDate).split('T')[0] === date
    )) {
      occupied = true;
      return;
    }
    const updated = { ...locks };
    if (oldDate && String(updated[reservationId] || '').split('T')[0] === oldDate) {
      delete updated[reservationId];
    }
    updated[reservationId] = date;
    return updated;
  });
  if (!result.committed) {
    throw new Error(occupied
      ? 'La fecha seleccionada ya está reservada.'
      : 'No se pudo reservar la fecha seleccionada.');
  }
}

function escapeHtml(value: unknown): string {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(value).replace(/[&<>"']/g, (character) => replacements[character]);
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toMinorUnits(amount: number): number {
  return Math.round(Number(amount) * 100);
}

function isAdmin(req: Request): boolean {
  const email = req.user?.email?.trim().toLowerCase();
  return Boolean(
    email &&
      (process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map((adminEmail) => adminEmail.trim().toLowerCase())
        .filter(Boolean)
        .includes(email)
  );
}

function reservationOwnerForRequest(req: Request): string | null {
  const authenticatedEmail = req.user?.email?.trim().toLowerCase() ?? '';
  if (!validEmail(authenticatedEmail)) return null;

  const requestedOwner =
    typeof req.body?.usuario === 'string' ? req.body.usuario.trim().toLowerCase() : '';
  if (requestedOwner && !validEmail(requestedOwner)) return null;
  if (!isAdmin(req)) return requestedOwner && requestedOwner !== authenticatedEmail
    ? null
    : authenticatedEmail;
  return requestedOwner || authenticatedEmail;
}

async function findReservationForOwner(owner: string, reservationId: string, admin: boolean) {
  const ownerKey = userDatabaseKey(owner);
  let reservationRef = getDb().ref(`reservas/${ownerKey}/${reservationId}`);
  let snapshot = await reservationRef.get();
  if (snapshot.exists()) {
    return { owner, ownerKey, reservationRef, reservation: snapshot.val() };
  }

  const ownersSnapshot = admin
    ? await getDb().ref('reservas').get()
    : await getDb().ref(`reservas/${ownerKey}`).get();
  const owners = admin ? ownersSnapshot.val() || {} : { [ownerKey]: ownersSnapshot.val() || {} };
  for (const [candidateOwnerKey, reservations] of Object.entries(owners)) {
    if (!reservations || typeof reservations !== 'object') continue;
    const match = Object.entries(reservations as Record<string, any>).find(
      ([key, reservation]) =>
        reservation &&
        typeof reservation === 'object' &&
        (key === reservationId || String(reservation.id || '') === reservationId)
    );
    if (!match) continue;
    const [reservationKey, reservation] = match;
    reservationRef = getDb().ref(`reservas/${candidateOwnerKey}/${reservationKey}`);
    snapshot = await reservationRef.get();
    return {
      owner: String(reservation.usuario || candidateOwnerKey.replace(/,/g, '.')),
      ownerKey: candidateOwnerKey,
      reservationRef,
      reservation,
    };
  }
  return null;
}

async function runReservationTransaction(
  reservationRef: ReturnType<Database['ref']>,
  update: (current: any) => any
) {
  let listener: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      listener = () => resolve();
      reservationRef.on('value', listener, reject);
    });
    return await reservationRef.transaction(update);
  } finally {
    if (listener) reservationRef.off('value', listener);
  }
}

/**
 * GET /reservations - List reservations for authenticated user
 */
router.get('/reservations', verifyFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const userKey = userDatabaseKey(req.user!.email!);
    const snapshot = await getDb().ref(`reservas/${userKey}`).get();
    const reservations = snapshot.val() || {};
    
    return res.json(reservations);
  } catch (error) {
    functions.logger.error('Error listing reservations:', error);
    return res.status(500).json({ error: 'No se pudieron listar las reservas.' });
  }
});

/**
 * POST /reservations - Create new reservation
 */
router.post('/reservations', verifyFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const reservation = validateReservationInput(req.body);
    if (!reservation || reservation.total <= 0 || !reservation.servicios.length) {
      return res.status(400).json({ error: 'Datos de reserva incompletos.' });
    }

    if (daysUntilReservationDate(reservation.fecha) < 3) {
      return res.status(400).json({
        error: 'La reserva debe realizarse con al menos 3 días de anticipación.',
      });
    }

    const reservationId = crypto.randomUUID();
    const userKey = userDatabaseKey(req.user!.email!);
    const reservationData = {
      id: reservationId,
      ...reservation,
      pagado: 0,
      usuario: req.user!.email!,
      estado: 'pendiente',
      createdAt: new Date().toISOString(),
    };

    await setReservationDateLock(reservationId, reservation.fecha);
    try {
      await getDb().ref(`reservas/${userKey}/${reservationId}`).set(reservationData);
    } catch (error) {
      await getDb().ref(`fechas_ocupadas/${reservationId}`).remove().catch(() => undefined);
      throw error;
    }

    return res.status(201).json(reservationData);
  } catch (error) {
    functions.logger.error('Error creating reservation:', error);
    return res.status(error instanceof Error && error.message.includes('reservada') ? 409 : 500).json({
      error: error instanceof Error && error.message.includes('reservada')
        ? error.message
        : 'No se pudo crear la reserva.',
    });
  }
});

router.post('/reservation-notification', verifyFirebaseAuth, async (req: Request, res: Response) => {
  const reservationId =
    typeof req.body?.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(req.body.id)
      ? req.body.id
      : '';
  if (!reservationId) {
    return res.status(400).json({ error: 'Falta un identificador de reserva válido.' });
  }

  const email = req.user!.email!.trim().toLowerCase();
  const userKey = userDatabaseKey(email);

  try {
    const snapshot = await getDb().ref(`reservas/${userKey}/${reservationId}`).get();
    const reservation = snapshot.val();
    if (!reservation || typeof reservation !== 'object') {
      return res.status(404).json({ error: 'No se encontró la reserva de esta cuenta.' });
    }

    const date = String(reservation.fecha || '');
    const description = String(reservation.descripcion || '').trim();
    const eventType = reservation.tipoEvento;
    const total = Number(reservation.total);
    const discount = Math.max(0, Number(reservation.descuento || 0));
    const subtotal = total + discount;
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

    const notificationRef = getDb().ref(`notificaciones_reservas/${userKey}/${reservationId}`);
    let alreadySent = false;
    let alreadySending = false;
    const claim = await notificationRef.transaction((current: any) => {
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
      return res.status(202).json({ message: 'El aviso de esta reserva ya se está enviando.' });
    }

    const brevoApiKey = process.env.BREVO_API_KEY?.trim();
    const emailFrom = process.env.EMAIL_FROM?.trim();
    const emailTo = process.env.EMAIL_TO?.trim() || 'esteban.garriga@gmail.com';
    if (!brevoApiKey || !emailFrom || !validEmail(emailFrom) || !validEmail(emailTo)) {
      await notificationRef.update({ estado: 'failed' });
      functions.logger.error('Reservation email configuration is incomplete');
      return res.status(503).json({ error: 'El aviso por correo no está disponible temporalmente.' });
    }

    const eventName = eventType === '15_años' ? '15 años' : 'Boda';
    const serviceLines = services.map(
      (service: any) => `${String(service?.nombre || 'Servicio')} — $${Number(service?.precio || 0).toFixed(2)}`
    );
    const textContent = [
      'Nueva reserva de evento',
      `Cliente: ${email}`,
      `Fecha: ${date}`,
      `Tipo de evento: ${eventName}`,
      `Descripción: ${description}`,
      ...(discount > 0
        ? [
            `Subtotal: $${subtotal.toFixed(2)}`,
            `Descuento por categoría completa (10%): -$${discount.toFixed(2)}`,
          ]
        : []),
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
        ${discount > 0 ? `<p><strong>Subtotal:</strong> $${subtotal.toFixed(2)}<br><strong>Descuento por categoría completa (10%):</strong> -$${discount.toFixed(2)}</p>` : ''}
        <p><strong>Total:</strong> $${total.toFixed(2)}</p>
        <p><strong>Servicios:</strong></p>
        <ul>${serviceLines.map((line: string) => `<li>${escapeHtml(line)}</li>`).join('') || '<li>Sin detalle de servicios</li>'}</ul>
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
      functions.logger.error('Brevo rejected reservation notification', {
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
    await getDb()
      .ref(`notificaciones_reservas/${userKey}/${reservationId}`)
      .update({ estado: 'failed' })
      .catch((notificationError) =>
        functions.logger.error('Could not mark reservation notification as failed', notificationError)
      );
    functions.logger.error('Error sending reservation notification', { reservationId, error });
    return res.status(500).json({ error: 'No se pudo enviar el aviso de la reserva.' });
  }
});

/**
 * PUT /reservations/:reservationId - Update reservation
 */
router.put('/reservations/:reservationId', verifyFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const { reservationId } = req.params;
    const owner = reservationOwnerForRequest(req);
    
    if (!validReservationId(reservationId) || !owner) {
      return res.status(400).json({ error: 'ID de reserva inválido.' });
    }

    const reservation = validateReservationInput(req.body);
    if (!reservation || reservation.total <= 0 || !reservation.servicios.length) {
      return res.status(400).json({ error: 'Los datos de la reserva no son válidos.' });
    }
    const userKey = userDatabaseKey(owner);
    const reservationRef = getDb().ref(`reservas/${userKey}/${reservationId}`);
    const snapshot = await reservationRef.get();

    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    const existing = snapshot.val();
    const oldDate = String(existing.fecha || '').split('T')[0];
    const paid = Number(existing.pagado || 0);
    if (!isAdmin(req) && (existing.estado !== 'pendiente' || paid > 0)) {
      return res.status(403).json({ error: 'Esta reserva ya no se puede modificar.' });
    }
    if (reservation.total < paid) {
      return res.status(400).json({
        error: 'El total no puede quedar por debajo de los pagos ya confirmados.',
      });
    }
    if (oldDate !== reservation.fecha) {
      await setReservationDateLock(reservationId, reservation.fecha, oldDate);
    }
    const updates = {
      ...reservation,
      pagado: paid,
      estado: reservation.total > 0 && paid >= reservation.total ? 'pagado' : 'pendiente',
      updatedAt: new Date().toISOString(),
    };
    await reservationRef.update(updates);

    const updated = (await reservationRef.get()).val();
    return res.json(updated);
  } catch (error) {
    functions.logger.error('Error updating reservation:', error);
    return res.status(500).json({ error: 'No se pudo actualizar la reserva.' });
  }
});

router.post(
  '/reservations/:reservationId/installment-plan',
  verifyFirebaseAuth,
  async (req: Request, res: Response) => {
    const { reservationId } = req.params;
    const owner = reservationOwnerForRequest(req);
    if (!validReservationId(reservationId) || !owner) {
      return res.status(400).json({ error: 'El identificador o propietario de la reserva no es válido.' });
    }

    try {
      const located = await findReservationForOwner(owner, reservationId, isAdmin(req));
      if (!located) return res.status(404).json({ error: 'No se encontró la reserva.' });

      let rejection = '';
      let plan: PlanCuotas | null = null;
      const transaction = await runReservationTransaction(located.reservationRef, (current: any) => {
        rejection = '';
        plan = null;
        if (!current || typeof current !== 'object') {
          rejection = 'missing';
          return;
        }
        if (current.planCuotas) {
          plan = current.planCuotas;
          return current;
        }
        const total = Number(current.total);
        const paid = Number(current.pagado || 0);
        if (!current.seniaConfirmadaAt || !Number.isFinite(total) || !Number.isFinite(paid) || paid <= 0) {
          rejection = 'deposit';
          return;
        }
        if (paid >= total) {
          rejection = 'settled';
          return;
        }
        plan = createInstallmentPlan(total - paid, String(current.fecha || '').split('T')[0]);
        if (!plan) {
          rejection = 'no-months';
          return;
        }
        return { ...current, planCuotas: plan };
      });

      if (!transaction.committed) {
        if (rejection === 'missing') {
          return res.status(404).json({ error: 'La reserva ya no está disponible. Actualiza la página.' });
        }
        if (rejection === 'deposit') {
          return res.status(400).json({
            error: 'El plan de cuotas está disponible después de confirmar la seña.',
          });
        }
        if (rejection === 'settled') {
          return res.status(400).json({ error: 'La reserva ya está totalmente pagada.' });
        }
        if (rejection === 'no-months') {
          return res.status(400).json({
            error: 'No se puede crear el plan: debe haber cuotas mensuales y un importe mínimo de $0,01 por cuota.',
          });
        }
        throw new Error('Firebase no confirmó la creación del plan de cuotas.');
      }
      return res.status(200).json(plan);
    } catch (error) {
      functions.logger.error('Could not create installment plan', error);
      return res.status(500).json({ error: 'No se pudo crear el plan de cuotas.' });
    }
  }
);

router.post(
  '/reservations/:reservationId/cash-payments',
  verifyFirebaseAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    const { reservationId } = req.params;
    const owner = reservationOwnerForRequest(req);
    const amount = Number(req.body?.monto);
    const cuotaId = typeof req.body?.cuotaId === 'string' ? req.body.cuotaId : '';
    if (
      !validReservationId(reservationId) ||
      !owner ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.abs(toMinorUnits(amount) - amount * 100) > 0.000001
    ) {
      return res.status(400).json({ error: 'Los datos del pago en efectivo no son válidos.' });
    }

    try {
      const located = await findReservationForOwner(owner, reservationId, true);
      if (!located) return res.status(404).json({ error: 'No se encontró la reserva.' });
      const paymentId = located.reservationRef.child('pagosEfectivo').push().key;
      if (!paymentId) throw new Error('No se pudo generar el identificador del comprobante.');

      let rejection = '';
      let payment: any = null;
      const transaction = await runReservationTransaction(located.reservationRef, (current: any) => {
        rejection = '';
        payment = null;
        if (!current || typeof current !== 'object') {
          rejection = 'missing';
          return;
        }
        const total = Number(current.total);
        const paid = Number(current.pagado || 0);
        if (!Number.isFinite(total) || !Number.isFinite(paid) || paid < 0 || paid >= total) {
          rejection = 'balance';
          return;
        }
        if (!current.seniaConfirmadaAt || paid <= 0) {
          rejection = 'deposit';
          return;
        }
        if (daysUntilReservationDate(String(current.fecha || '').split('T')[0]) < 3) {
          rejection = 'deadline';
          return;
        }
        const cashPayments =
          current.pagosEfectivo && typeof current.pagosEfectivo === 'object'
            ? current.pagosEfectivo
            : {};
        const paymentValues = Object.values(cashPayments) as any[];
        const pendingAmount = paymentValues
          .filter((item) => item && ['pendiente_confirmacion', 'en_revision'].includes(item.estado))
          .reduce((sum, item) => sum + toMinorUnits(item.monto || 0), 0);
        if (toMinorUnits(amount) > toMinorUnits(total - paid) - pendingAmount) {
          rejection = 'amount';
          return;
        }

        if (cuotaId) {
          const cuota = current.planCuotas?.cuotas?.find((item: any) => item.id === cuotaId);
          if (!cuota) {
            rejection = 'installment';
            return;
          }
          const cuotaPaid = paymentValues
            .filter((item) => item && item.cuotaId === cuotaId && item.estado === 'confirmado')
            .reduce((sum, item) => sum + toMinorUnits(item.monto || 0), 0);
          const cuotaPending = paymentValues
            .filter(
              (item) =>
                item &&
                item.cuotaId === cuotaId &&
                ['pendiente_confirmacion', 'en_revision'].includes(item.estado)
            )
            .reduce((sum, item) => sum + toMinorUnits(item.monto || 0), 0);
          if (toMinorUnits(amount) > toMinorUnits(cuota.monto) - cuotaPaid - cuotaPending) {
            rejection = 'installment-amount';
            return;
          }
        }

        payment = {
          id: paymentId,
          monto: amount,
          moneda: 'UYU',
          metodoPago: 'efectivo',
          estado: 'pendiente_confirmacion',
          fecha: new Date().toISOString(),
          registradoPor: req.user!.email,
          usuario: located.owner,
          reservaId: reservationId,
          cuotaId: cuotaId || null,
          descripcion: cuotaId ? `Cuota ${cuotaId.replace('cuota-', '')}` : 'Pago en efectivo',
        };
        return { ...current, pagosEfectivo: { ...cashPayments, [paymentId]: payment } };
      });

      if (!transaction.committed) {
        const messages: Record<string, [number, string]> = {
          missing: [404, 'La reserva ya no está disponible. Actualiza la página.'],
          balance: [400, 'La reserva no tiene saldo pendiente.'],
          deposit: [400, 'El pago en efectivo está disponible después de confirmar la seña.'],
          deadline: [400, 'No se pueden registrar pagos a menos de 3 días del evento.'],
          amount: [400, 'El importe supera el saldo disponible, incluidos pagos pendientes de confirmación.'],
          installment: [400, 'La cuota indicada no existe en el plan.'],
          'installment-amount': [400, 'El importe supera el saldo disponible de esa cuota.'],
        };
        const response = messages[rejection];
        if (response) return res.status(response[0]).json({ error: response[1] });
        throw new Error('Firebase no confirmó el registro del pago en efectivo.');
      }
      const persistedPayment = (
        await located.reservationRef.child(`pagosEfectivo/${paymentId}`).get()
      ).val();
      if (!persistedPayment) {
        throw new Error('Firebase no persistió el pago en efectivo registrado.');
      }
      return res.status(201).json(persistedPayment);
    } catch (error) {
      functions.logger.error('Could not register cash payment', error);
      return res.status(500).json({ error: 'No se pudo registrar el pago en efectivo.' });
    }
  }
);

router.post(
  '/reservations/:reservationId/cash-payments/:paymentId/:action',
  verifyFirebaseAuth,
  async (req: Request, res: Response) => {
    const { reservationId, paymentId, action } = req.params;
    const owner = reservationOwnerForRequest(req);
    if (
      !validReservationId(reservationId) ||
      !validReservationId(paymentId) ||
      !owner ||
      !['confirm', 'dispute', 'resolve'].includes(action)
    ) {
      return res.status(400).json({ error: 'La acción o los datos del pago en efectivo no son válidos.' });
    }

    const admin = isAdmin(req);
    if ((action === 'resolve') !== admin) {
      return res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
    }
    const motivo =
      typeof req.body?.motivo === 'string' ? req.body.motivo.trim().slice(0, 500) : '';
    if (action === 'dispute' && !motivo) {
      return res.status(400).json({ error: 'Describe la diferencia antes de reportarla.' });
    }

    try {
      const located = await findReservationForOwner(owner, reservationId, admin);
      if (!located) return res.status(404).json({ error: 'No se encontró la reserva.' });
      const decision = req.body?.decision;
      if (action === 'resolve' && !['confirm', 'reject'].includes(decision)) {
        return res.status(400).json({ error: 'La resolución del pago no es válida.' });
      }

      let rejection = '';
      let updatedPayment: any = null;
      const transaction = await runReservationTransaction(located.reservationRef, (current: any) => {
        rejection = '';
        updatedPayment = null;
        const payments =
          current?.pagosEfectivo && typeof current.pagosEfectivo === 'object'
            ? current.pagosEfectivo
            : {};
        const existingPayment = payments[paymentId];
        if (!current || !existingPayment) {
          rejection = 'missing';
          return;
        }
        if (action === 'dispute') {
          if (existingPayment.usuario !== req.user!.email) {
            rejection = 'owner';
            return;
          }
          if (existingPayment.estado !== 'pendiente_confirmacion') {
            rejection = 'status';
            return;
          }
          updatedPayment = {
            ...existingPayment,
            estado: 'en_revision',
            reportadoAt: new Date().toISOString(),
            motivo,
          };
          return { ...current, pagosEfectivo: { ...payments, [paymentId]: updatedPayment } };
        }

        const isAdminResolution = action === 'resolve';
        if (isAdminResolution && existingPayment.estado !== 'en_revision') {
          rejection = 'status';
          return;
        }
        if (!isAdminResolution && existingPayment.usuario !== req.user!.email) {
          rejection = 'owner';
          return;
        }
        if (!isAdminResolution && existingPayment.estado === 'confirmado') {
          updatedPayment = existingPayment;
          return current;
        }
        if (!isAdminResolution && existingPayment.estado !== 'pendiente_confirmacion') {
          rejection = 'status';
          return;
        }
        if (isAdminResolution && decision === 'reject') {
          updatedPayment = {
            ...existingPayment,
            estado: 'rechazado',
            resueltoAt: new Date().toISOString(),
            resueltoPor: req.user!.email,
          };
          return { ...current, pagosEfectivo: { ...payments, [paymentId]: updatedPayment } };
        }

        const paymentAmount = Number(existingPayment.monto);
        const total = Number(current.total);
        const paid = Number(current.pagado || 0);
        if (
          !Number.isFinite(paymentAmount) ||
          !Number.isFinite(total) ||
          !Number.isFinite(paid) ||
          paymentAmount <= 0 ||
          paid + paymentAmount > total + 0.005
        ) {
          rejection = 'balance';
          return;
        }
        const confirmedAt = new Date().toISOString();
        updatedPayment = {
          ...existingPayment,
          estado: 'confirmado',
          confirmadoAt: confirmedAt,
          confirmadoPor: req.user!.email,
          pagadoAntes: paid,
          saldoDespues: Math.max(0, Math.round((total - paid - paymentAmount) * 100) / 100),
          ...(isAdminResolution ? { resueltoAt: confirmedAt, resueltoPor: req.user!.email } : {}),
        };
        const newPaid = Math.round((paid + paymentAmount) * 100) / 100;
        return {
          ...current,
          pagado: newPaid,
          estado:
            newPaid >= total
              ? 'pagado'
              : current.estado === 'caducada'
                ? 'caducada'
                : 'pendiente',
          pagosEfectivo: { ...payments, [paymentId]: updatedPayment },
        };
      });

      if (!transaction.committed) {
        if (rejection === 'missing') {
          return res.status(404).json({ error: 'No se encontró el pago en efectivo.' });
        }
        if (rejection === 'owner') {
          return res.status(403).json({ error: 'Este pago no pertenece a tu cuenta.' });
        }
        if (rejection === 'status') {
          return res.status(409).json({ error: 'El pago ya cambió de estado y no admite esta acción.' });
        }
        if (rejection === 'balance') {
          return res.status(409).json({ error: 'El pago excede el saldo pendiente de la reserva.' });
        }
        throw new Error('Firebase no confirmó la actualización del pago en efectivo.');
      }
      const persistedPayment = (
        await located.reservationRef.child(`pagosEfectivo/${paymentId}`).get()
      ).val();
      if (!persistedPayment) {
        throw new Error('Firebase no persistió la actualización del pago en efectivo.');
      }
      return res.status(200).json(persistedPayment);
    } catch (error) {
      functions.logger.error('Could not update cash payment', error);
      return res.status(500).json({ error: 'No se pudo actualizar el pago en efectivo.' });
    }
  }
);

/**
 * DELETE /reservations/:reservationId - Delete reservation
 */
router.delete('/reservations/:reservationId', verifyFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const { reservationId } = req.params;
    const owner = reservationOwnerForRequest(req);

    if (!validReservationId(reservationId) || !owner) {
      return res.status(400).json({ error: 'ID o propietario de reserva inválido.' });
    }

    const userKey = userDatabaseKey(owner);
    const reservationRef = getDb().ref(`reservas/${userKey}/${reservationId}`);
    const snapshot = await reservationRef.get();
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'No se encontró la reserva.' });
    }

    const reservation = snapshot.val();
    const paid = Number(reservation?.pagado || 0);
    if (!Number.isFinite(paid) || paid < 0) {
      return res.status(409).json({ error: 'Los datos de pago de la reserva no son válidos.' });
    }
    if (!isAdmin(req) && (reservation?.estado !== 'pendiente' || paid > 0)) {
      return res.status(403).json({ error: 'Esta reserva ya no se puede eliminar.' });
    }

    let transactionAttempts = 0;
    const transaction = await reservationRef.transaction((current: any) => {
      transactionAttempts += 1;
      const currentReservation =
        current && typeof current === 'object'
          ? current
          : transactionAttempts === 1
            ? reservation
            : null;
      return currentReservation ? null : undefined;
    });
    if (!transaction.committed) {
      functions.logger.warn('Reservation deletion transaction did not commit', {
        reservationId,
        transactionAttempts,
      });
      return res.status(409).json({
        error: 'La reserva cambió mientras se intentaba eliminar. Recarga la agenda e inténtalo nuevamente.',
      });
    }
    await getDb().ref(`fechas_ocupadas/${reservationId}`).remove();

    return res.status(200).json({ id: reservationId });
  } catch (error) {
    functions.logger.error('Error deleting reservation:', error);
    return res.status(500).json({ error: 'No se pudo eliminar la reserva.' });
  }
});

/**
 * POST /reservations/maintenance - Admin: Check and update expired reservations
 */
router.post('/reservations/maintenance', verifyFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const admin = isAdmin(req);
    const authenticatedEmail = req.user!.email!.trim().toLowerCase();
    const reservationsRoot = admin
      ? getDb().ref('reservas')
      : getDb().ref(`reservas/${userDatabaseKey(authenticatedEmail)}`);
    const snapshot = await reservationsRoot.get();
    const allReservations = snapshot.val() || {};
    let updated = 0;

    const reservationsByUser = admin
      ? allReservations
      : { [userDatabaseKey(authenticatedEmail)]: allReservations };
    for (const [userKey, userReservations] of Object.entries(reservationsByUser)) {
      if (!userReservations || typeof userReservations !== 'object') continue;

      for (const [reservationId, reservation] of Object.entries(userReservations)) {
        if (!validReservationId(reservationId) || !reservation || typeof reservation !== 'object') continue;

        const res = reservation as any;
        const date = String(res.fecha || '').split('T')[0];
        
        if (!validReservationDate(date)) continue;

        const daysUntil = daysUntilReservationDate(date);
        const total = Number(res.total || 0);
        const paid = Number(res.pagado || 0);

        if (total > 0 && paid < total && daysUntil < 3 && res.estado !== 'caducada') {
          const reservationRef = getDb().ref(`reservas/${userKey}/${reservationId}`);
          const transaction = await reservationRef.transaction((current: any) => {
            if (!current || typeof current !== 'object') return;

            const currentTotal = Number(current.total || 0);
            const currentPaid = Number(current.pagado || 0);
            const currentDate = String(current.fecha || '').split('T')[0];

            if (
              !Number.isFinite(currentTotal) ||
              !Number.isFinite(currentPaid) ||
              currentTotal <= 0 ||
              currentPaid < 0 ||
              currentPaid >= currentTotal ||
              !validReservationDate(currentDate) ||
              daysUntilReservationDate(currentDate) >= 3 ||
              current.estado === 'caducada'
            ) {
              return;
            }

            return { ...current, estado: 'caducada' };
          });

          if (transaction.committed && transaction.snapshot.val()?.estado === 'caducada') {
            updated += 1;
          }
        }
      }
    }

    return res.status(200).json({ updated });
  } catch (error) {
    functions.logger.error('Error in reservation maintenance:', error);
    return res.status(500).json({ error: 'No se pudieron actualizar las reservas vencidas.' });
  }
});

export default router;
