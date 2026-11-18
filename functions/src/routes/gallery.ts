/**
 * Gallery routes - Backblaze B2 integration
 */

import { Router, Request, Response } from 'express';
import { getDatabase, Database } from 'firebase-admin/database';
import * as functions from 'firebase-functions';
import { verifyFirebaseAuth, requireGalleryAdmin } from '../middleware/auth.js';

let db: Database | null = null;

function getDb(): Database {
  if (!db) {
    db = getDatabase();
  }
  return db;
}

const router = Router();

/**
 * GET /gallery/storage-status - Check B2 storage configuration and usage
 */
router.get('/gallery/storage-status', verifyFirebaseAuth, requireGalleryAdmin, async (_req: Request, res: Response) => {
  try {
    // Check if B2 is configured
    const b2Configured =
      process.env.B2_KEY_ID?.trim() &&
      process.env.B2_APPLICATION_KEY?.trim() &&
      process.env.B2_BUCKET_NAME?.trim() &&
      process.env.B2_ENDPOINT?.trim();

    if (!b2Configured) {
      return res.status(503).json({
        error: 'Backblaze B2 no está configurado. Contacta al administrador.',
      });
    }

    // Get storage usage from database
    const usageSnapshot = await getDb().ref('b2_storage_usage').get();
    const usage = usageSnapshot.val() || {};

    return res.json({
      configured: true,
      storedBytes: usage.storedBytes || 0,
      reservedBytes: usage.reservedBytes || 0,
      limitBytes: 9_000_000_000, // 9 GB free tier limit
      updatedAt: usage.updatedAt,
    });
  } catch (error) {
    functions.logger.error('Error checking gallery storage:', error);
    return res.status(500).json({ error: 'No se pudo verificar el almacenamiento.' });
  }
});

/**
 * GET /gallery/sessions - List gallery sessions for authenticated user
 */
router.get('/gallery/sessions', verifyFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid;
    const sessionsSnapshot = await getDb().ref(`b2_galerias/${uid}`).get();
    const sessions = sessionsSnapshot.val() || {};

    return res.json(sessions);
  } catch (error) {
    functions.logger.error('Error listing gallery sessions:', error);
    return res.status(500).json({ error: 'No se pudieron listar las sesiones.' });
  }
});

/**
 * POST /gallery/sessions - Create new gallery session (admin only)
 */
router.post('/gallery/sessions', verifyFirebaseAuth, requireGalleryAdmin, async (req: Request, res: Response) => {
  try {
    const { titulo, fecha, descripcion } = req.body;

    if (!titulo) {
      return res.status(400).json({ error: 'El título de la sesión es requerido.' });
    }

    const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const uid = req.user!.uid;

    const sessionData = {
      id: sessionId,
      titulo,
      fecha: fecha || null,
      descripcion: descripcion || null,
      createdAt: new Date().toISOString(),
      createdBy: req.user!.email,
    };

    await getDb().ref(`b2_galerias/${uid}/${sessionId}`).set(sessionData);

    return res.status(201).json(sessionData);
  } catch (error) {
    functions.logger.error('Error creating gallery session:', error);
    return res.status(500).json({ error: 'No se pudo crear la sesión de galería.' });
  }
});

/**
 * GET /gallery/sessions/:sessionId/media - List media in gallery session
 */
router.get('/gallery/sessions/:sessionId/media', verifyFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const uid = req.user!.uid;

    const mediaSnapshot = await getDb().ref(`b2_galerias/${uid}/${sessionId}/media`).get();
    const media = mediaSnapshot.val() || {};

    return res.json(media);
  } catch (error) {
    functions.logger.error('Error listing gallery media:', error);
    return res.status(500).json({ error: 'No se pudieron listar los archivos.' });
  }
});

/**
 * DELETE /gallery/sessions/:sessionId/media/:mediaId - Delete media from session
 */
router.delete('/gallery/sessions/:sessionId/media/:mediaId', verifyFirebaseAuth, requireGalleryAdmin, async (req: Request, res: Response) => {
  try {
    const { sessionId, mediaId } = req.params;
    const uid = req.user!.uid;

    await getDb().ref(`b2_galerias/${uid}/${sessionId}/media/${mediaId}`).remove();

    return res.status(204).send();
  } catch (error) {
    functions.logger.error('Error deleting gallery media:', error);
    return res.status(500).json({ error: 'No se pudo eliminar el archivo.' });
  }
});

export default router;
