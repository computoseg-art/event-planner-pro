/**
 * Reservations routes - CRUD operations
 */

import { Router, Request, Response } from 'express';
import { getDatabase, Database } from 'firebase-admin/database';
import * as functions from 'firebase-functions';
import { verifyFirebaseAuth, requireAdmin } from '../middleware/auth.js';

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
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id);
}

function validReservationDate(date: string): boolean {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(date);
  return !isNaN(d.getTime());
}

/**
 * GET /api/reservations - List reservations for authenticated user
 */
router.get('/api/reservations', verifyFirebaseAuth, async (req: Request, res: Response) => {
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
 * POST /api/reservations - Create new reservation
 */
router.post('/api/reservations', verifyFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const { fecha, descripcion, tipoEvento, servicios, total, pagado } = req.body;

    // Validation
    if (!fecha || !descripcion || !tipoEvento || !Array.isArray(servicios) || !total) {
      return res.status(400).json({ error: 'Datos de reserva incompletos.' });
    }

    if (daysUntilReservationDate(fecha) < 3) {
      return res.status(400).json({
        error: 'La reserva debe realizarse con al menos 3 días de anticipación.',
      });
    }

    const reservationId = crypto.randomUUID();
    const userKey = userDatabaseKey(req.user!.email!);
    const reservationData = {
      id: reservationId,
      fecha,
      descripcion,
      tipoEvento,
      servicios,
      total,
      pagado: pagado || 0,
      usuario: req.user!.email!,
      estado: 'pendiente',
      createdAt: new Date().toISOString(),
    };

    const userRef = getDb().ref(`reservas/${userKey}/${reservationId}`);
    await userRef.set(reservationData);

    // Update fechas_ocupadas
    await getDb().ref(`fechas_ocupadas/${reservationId}`).set(fecha);

    return res.status(201).json(reservationData);
  } catch (error) {
    functions.logger.error('Error creating reservation:', error);
    return res.status(500).json({ error: 'No se pudo crear la reserva.' });
  }
});

/**
 * PUT /api/reservations/:reservationId - Update reservation
 */
router.put('/api/reservations/:reservationId', verifyFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const { reservationId } = req.params;
    
    if (!validReservationId(reservationId)) {
      return res.status(400).json({ error: 'ID de reserva inválido.' });
    }

    const userKey = userDatabaseKey(req.user!.email!);
    const reservationRef = getDb().ref(`reservas/${userKey}/${reservationId}`);
    const snapshot = await reservationRef.get();

    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    const updates = { ...req.body, updatedAt: new Date().toISOString() };
    await reservationRef.update(updates);

    const updated = (await reservationRef.get()).val();
    return res.json(updated);
  } catch (error) {
    functions.logger.error('Error updating reservation:', error);
    return res.status(500).json({ error: 'No se pudo actualizar la reserva.' });
  }
});

/**
 * DELETE /api/reservations/:reservationId - Delete reservation
 */
router.delete('/api/reservations/:reservationId', verifyFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const { reservationId } = req.params;

    if (!validReservationId(reservationId)) {
      return res.status(400).json({ error: 'ID de reserva inválido.' });
    }

    const userKey = userDatabaseKey(req.user!.email!);
    const reservationRef = getDb().ref(`reservas/${userKey}/${reservationId}`);
    
    await reservationRef.remove();
    await getDb().ref(`fechas_ocupadas/${reservationId}`).remove();

    return res.status(204).send();
  } catch (error) {
    functions.logger.error('Error deleting reservation:', error);
    return res.status(500).json({ error: 'No se pudo eliminar la reserva.' });
  }
});

/**
 * POST /api/reservations/maintenance - Admin: Check and update expired reservations
 */
router.post('/api/reservations/maintenance', verifyFirebaseAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const snapshot = await getDb().ref('reservas').get();
    const allReservations = snapshot.val() || {};
    let updated = 0;

    for (const [userKey, userReservations] of Object.entries(allReservations)) {
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
