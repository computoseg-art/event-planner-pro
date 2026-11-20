/**
 * Gallery routes - Backblaze B2 integration
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import path from 'path';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase, Database } from 'firebase-admin/database';
import * as functions from 'firebase-functions';
import { verifyFirebaseAuth, requireGalleryAdmin } from '../middleware/auth.js';

let db: Database | null = null;
let b2Client: S3Client | null = null;

const storageLimitBytes = 9_000_000_000;
const partSizeBytes = 64 * 1024 * 1024;
const maxMediaSizeBytes = 100 * 1024 * 1024 * 1024;
const downloadUrlLifetimeSeconds = 4 * 60 * 60;
const uploadUrlLifetimeSeconds = 4 * 60 * 60;

function getDb(): Database {
  if (!db) {
    db = getDatabase();
  }
  return db;
}

function b2Environment() {
  return {
    bucketName: process.env.B2_BUCKET_NAME?.trim() || '',
    endpoint: process.env.B2_ENDPOINT?.trim() || '',
    region: process.env.B2_REGION?.trim() || '',
    keyId: process.env.B2_KEY_ID?.trim() || '',
    applicationKey: process.env.B2_APPLICATION_KEY?.trim() || '',
  };
}

function getB2Client(): S3Client {
  if (b2Client) return b2Client;

  const config = b2Environment();
  if (Object.values(config).some((value) => !value)) {
    throw new Error('Backblaze B2 no está configurado. Revisa las variables B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT y B2_REGION.');
  }

  b2Client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.keyId,
      secretAccessKey: config.applicationKey,
    },
    maxAttempts: 2,
  });
  return b2Client;
}

function validEmail(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function isGalleryAdmin(req: Request): boolean {
  return req.user?.email?.trim().toLowerCase() === 'admin@gmail.com';
}

async function resolveGalleryOwner(req: Request, requestedEmail?: unknown) {
  const email = typeof requestedEmail === 'string'
    ? requestedEmail.trim().toLowerCase()
    : '';

  if (isGalleryAdmin(req) && email) {
    if (!validEmail(email)) {
      throw new Error('El email del cliente no es válido.');
    }
    const owner = await getAuth().getUserByEmail(email);
    return { uid: owner.uid, email: owner.email?.trim().toLowerCase() || email };
  }

  return {
    uid: req.user!.uid,
    email: req.user!.email?.trim().toLowerCase() || '',
  };
}

async function resolveSession(req: Request, sessionId: string, requestedEmail?: unknown) {
  if (!validId(sessionId)) return null;
  const owner = await resolveGalleryOwner(req, requestedEmail);
  const snapshot = await getDb().ref(`b2_galerias/${owner.uid}/${sessionId}`).get();
  const session = snapshot.val();
  return session?.id === sessionId ? { ...owner, session } : null;
}

function safeFilename(value: unknown): string {
  const filename = String(value || 'archivo')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .trim();
  return filename || 'archivo';
}

function validMediaFile(mimeType: unknown, filename: unknown): boolean {
  const type = String(mimeType || '');
  if (
    type.length <= 128 &&
    (/^image\/[a-z0-9.+-]+$/i.test(type) || /^video\/[a-z0-9.+-]+$/i.test(type))
  ) {
    return true;
  }
  const extension = path.extname(String(filename || '')).toLowerCase();
  return type === 'application/octet-stream' &&
    ['.dng', '.cr2', '.cr3', '.nef', '.arw', '.orf', '.rw2', '.raf'].includes(extension);
}

async function reserveStorage(size: number): Promise<void> {
  let quotaExceeded = false;
  const result = await getDb().ref('b2_storage_usage').transaction((current: any) => {
    quotaExceeded = false;
    const storedBytes = Number(current?.storedBytes || 0);
    const reservedBytes = Number(current?.reservedBytes || 0);
    if (
      !Number.isSafeInteger(storedBytes) ||
      !Number.isSafeInteger(reservedBytes) ||
      storedBytes < 0 ||
      reservedBytes < 0
    ) {
      throw new Error('El contador de almacenamiento B2 no es válido.');
    }
    if (storedBytes + reservedBytes + size > storageLimitBytes) {
      quotaExceeded = true;
      return;
    }
    return { storedBytes, reservedBytes: reservedBytes + size, updatedAt: new Date().toISOString() };
  });
  if (!result.committed) {
    const error = new Error(
      quotaExceeded
        ? 'La galería alcanzó el límite gratuito configurado de 9 GB.'
        : 'No se pudo reservar espacio de almacenamiento en B2.',
    ) as Error & { code?: string };
    if (quotaExceeded) error.code = 'B2_STORAGE_QUOTA';
    throw error;
  }
}

async function settleStorageReservation(size: number, stored: boolean): Promise<void> {
  const result = await getDb().ref('b2_storage_usage').transaction((current: any) => {
    if (current === null) return current;
    const storedBytes = Number(current?.storedBytes || 0);
    const reservedBytes = Number(current?.reservedBytes || 0);
    if (
      !Number.isSafeInteger(storedBytes) ||
      !Number.isSafeInteger(reservedBytes) ||
      storedBytes < 0 ||
      reservedBytes < size
    ) {
      throw new Error('La reserva de almacenamiento B2 no coincide con la carga.');
    }
    return {
      storedBytes: stored ? storedBytes + size : storedBytes,
      reservedBytes: reservedBytes - size,
      updatedAt: new Date().toISOString(),
    };
  });
  if (!result.committed) throw new Error('No se pudo actualizar el espacio reservado en B2.');
}

const router = Router();

router.get(
  '/gallery/storage-status',
  verifyFirebaseAuth,
  requireGalleryAdmin,
  async (_req: Request, res: Response) => {
    try {
      const config = b2Environment();
      const client = getB2Client();
      await client.send(new HeadBucketCommand({ Bucket: config.bucketName }), {
        abortSignal: AbortSignal.timeout(10_000),
      });
      const usage = (await getDb().ref('b2_storage_usage').get()).val() || {};
      return res.status(200).json({
        configured: true,
        connected: true,
        bucketName: config.bucketName,
        region: config.region,
        storedBytes: Number(usage.storedBytes || 0),
        reservedBytes: Number(usage.reservedBytes || 0),
        limitBytes: storageLimitBytes,
      });
    } catch (error) {
      functions.logger.error('Error checking gallery storage:', error);
      return res.status(503).json({
        error: error instanceof Error
          ? error.message
          : 'No se pudo verificar el almacenamiento.',
      });
    }
  },
);

router.get('/gallery/sessions', verifyFirebaseAuth, async (req: Request, res: Response) => {
  res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  try {
    const owner = await resolveGalleryOwner(req, req.query.email);
    const snapshot = await getDb().ref(`b2_galerias/${owner.uid}`).get();
    const sessions = Object.values(snapshot.val() || {})
      .filter((session: any) => session && typeof session.id === 'string')
      .map((session: any) => ({
        id: session.id,
        title: session.title || session.titulo || '',
        eventDate: session.eventDate || session.fecha || '',
        description: session.description || session.descripcion || '',
        createdAt: session.createdAt,
        mediaCount: Object.keys(session.media || {}).length,
      }))
      .sort((a, b) =>
        String(b.eventDate || b.createdAt).localeCompare(String(a.eventDate || a.createdAt)),
      );
    return res.status(200).json(sessions);
  } catch (error) {
    functions.logger.error('Error listing gallery sessions:', error);
    return res.status(error instanceof Error && error.message.includes('email') ? 400 : 500).json({
      error: error instanceof Error ? error.message : 'No se pudieron cargar las sesiones de la galería.',
    });
  }
});

router.post(
  '/gallery/sessions',
  verifyFirebaseAuth,
  requireGalleryAdmin,
  async (req: Request, res: Response) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const eventDate = typeof req.body?.eventDate === 'string' ? req.body.eventDate.trim() : '';
    const description =
      typeof req.body?.description === 'string' ? req.body.description.trim() : '';

    if (
      !validEmail(email) ||
      !title ||
      title.length > 100 ||
      (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) ||
      description.length > 500
    ) {
      return res.status(400).json({
        error: 'Indica un email válido y los datos de la sesión dentro de los límites permitidos.',
      });
    }

    try {
      const owner = await getAuth().getUserByEmail(email);
      const session = {
        id: randomUUID(),
        ownerUid: owner.uid,
        ownerEmail: owner.email?.trim().toLowerCase() || email,
        title,
        eventDate,
        description,
        createdAt: new Date().toISOString(),
      };
      await getDb().ref(`b2_galerias/${owner.uid}/${session.id}`).set(session);
      return res.status(201).json({ ...session, mediaCount: 0 });
    } catch (error: any) {
      functions.logger.error('Error creating gallery session:', error);
      return res.status(error?.code === 'auth/user-not-found' ? 404 : 500).json({
        error: error?.code === 'auth/user-not-found'
          ? 'El cliente debe tener una cuenta registrada para asignarle una galería.'
          : 'No se pudo crear la sesión de galería.',
      });
    }
  },
);

router.post(
  '/gallery/sessions/:sessionId/uploads/initiate',
  verifyFirebaseAuth,
  requireGalleryAdmin,
  async (req: Request, res: Response) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const filename = typeof req.body?.filename === 'string' ? req.body.filename : '';
    const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : '';
    const size = req.body?.size;
    if (
      !validEmail(email) ||
      !filename.trim() ||
      filename.length > 255 ||
      !validMediaFile(mimeType, filename) ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > maxMediaSizeBytes
    ) {
      return res.status(400).json({
        error: 'Indica un cliente, archivo, formato de imagen/video y tamaño válido (máximo 100 GB).',
      });
    }

    let reservationHeld = false;
    let uploadId = '';
    let objectKey = '';
    try {
      const resolved = await resolveSession(req, String(req.params.sessionId), email);
      if (!resolved) return res.status(404).json({ error: 'No se encontró esa sesión para el cliente.' });
      const client = getB2Client();
      const mediaId = randomUUID();
      objectKey = `${resolved.uid}/${resolved.session.id}/${mediaId}`;
      await reserveStorage(size);
      reservationHeld = true;
      const upload = await client.send(new CreateMultipartUploadCommand({
        Bucket: b2Environment().bucketName,
        Key: objectKey,
        ContentType: mimeType,
      }));
      if (!upload.UploadId) throw new Error('B2 no devolvió un identificador de carga multipart.');
      uploadId = upload.UploadId;

      const uploadToken = randomUUID();
      const totalParts = Math.ceil(size / partSizeBytes);
      await getDb().ref(`b2_pending_uploads/${uploadToken}`).set({
        uploadToken,
        createdByUid: req.user!.uid,
        uploadId,
        mediaId,
        objectKey,
        ownerUid: resolved.uid,
        ownerEmail: resolved.email,
        sessionId: resolved.session.id,
        filename: path.basename(safeFilename(filename)),
        mimeType,
        size,
        totalParts,
        createdAt: new Date().toISOString(),
      });
      reservationHeld = false;
      return res.status(201).json({ uploadToken, mediaId, partSize: partSizeBytes, totalParts });
    } catch (error: any) {
      let canRelease = reservationHeld;
      if (uploadId) {
        try {
          await getB2Client().send(new AbortMultipartUploadCommand({
            Bucket: b2Environment().bucketName,
            Key: objectKey,
            UploadId: uploadId,
          }));
        } catch {
          canRelease = false;
        }
      }
      if (canRelease) await settleStorageReservation(size, false).catch(() => undefined);
      functions.logger.error('Error initiating gallery upload:', error);
      return res.status(
        error?.code === 'auth/user-not-found' ? 404 : error?.code === 'B2_STORAGE_QUOTA' ? 507 : 502,
      ).json({
        error: error?.code === 'auth/user-not-found'
          ? 'No existe una cuenta registrada con ese correo.'
          : error?.code === 'B2_STORAGE_QUOTA'
            ? error.message
            : 'No se pudo iniciar la carga a Backblaze B2.',
      });
    }
  },
);

router.post(
  '/gallery/uploads/:uploadToken/part-urls',
  verifyFirebaseAuth,
  requireGalleryAdmin,
  async (req: Request, res: Response) => {
    const uploadToken = String(req.params.uploadToken);
    const partNumbers = req.body?.partNumbers;
    if (
      !validId(uploadToken) ||
      !Array.isArray(partNumbers) ||
      partNumbers.length < 1 ||
      partNumbers.length > 100 ||
      partNumbers.some((part) => !Number.isInteger(part) || part < 1)
    ) {
      return res.status(400).json({ error: 'La lista de partes no es válida.' });
    }
    try {
      const pending = (await getDb().ref(`b2_pending_uploads/${uploadToken}`).get()).val();
      if (!pending || pending.createdByUid !== req.user!.uid) {
        return res.status(404).json({ error: 'No se encontró una carga pendiente.' });
      }
      if (partNumbers.some((part) => part > pending.totalParts)) {
        return res.status(400).json({ error: 'El número de parte excede el total de la carga.' });
      }
      const client = getB2Client();
      const urls = await Promise.all(partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await getSignedUrl(
          client,
          new UploadPartCommand({
            Bucket: b2Environment().bucketName,
            Key: pending.objectKey,
            UploadId: pending.uploadId,
            PartNumber: partNumber,
          }),
          { expiresIn: uploadUrlLifetimeSeconds },
        ),
      })));
      return res.status(200).json({ urls });
    } catch (error) {
      functions.logger.error('Error signing gallery upload parts:', error);
      return res.status(500).json({ error: 'No se pudieron preparar las partes de la carga.' });
    }
  },
);

router.post(
  '/gallery/uploads/:uploadToken/complete',
  verifyFirebaseAuth,
  requireGalleryAdmin,
  async (req: Request, res: Response) => {
    const uploadToken = String(req.params.uploadToken);
    const parts = req.body?.parts;
    if (!validId(uploadToken) || !Array.isArray(parts)) {
      return res.status(400).json({ error: 'La carga multipart no es válida.' });
    }
    const pendingRef = getDb().ref(`b2_pending_uploads/${uploadToken}`);
    try {
      const pending = (await pendingRef.get()).val();
      if (!pending) return res.status(404).json({ error: 'No se encontró una carga pendiente.' });
      if (pending.createdByUid !== req.user!.uid) {
        return res.status(404).json({ error: 'No se encontró una carga pendiente.' });
      }
      if (
        parts.length !== pending.totalParts ||
        parts.some((part, index) =>
          !part ||
          part.partNumber !== index + 1 ||
          typeof part.etag !== 'string' ||
          !/^"?[A-Za-z0-9+/=_-]{1,256}"?$/.test(part.etag)
        )
      ) {
        return res.status(400).json({ error: 'Faltan partes o sus identificadores no son válidos.' });
      }

      const client = getB2Client();
      const bucket = b2Environment().bucketName;
      await client.send(new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: pending.objectKey,
        UploadId: pending.uploadId,
        MultipartUpload: {
          Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
        },
      }));
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: pending.objectKey }));
      if (head.ContentLength !== pending.size) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: pending.objectKey }));
        await pendingRef.remove();
        return res.status(502).json({
          error: 'El tamaño del archivo almacenado no coincide con el original.',
        });
      }
      const media = {
        id: pending.mediaId,
        objectKey: pending.objectKey,
        filename: pending.filename,
        mimeType: pending.mimeType,
        size: pending.size,
        createdAt: new Date().toISOString(),
        uploadedBy: req.user!.uid,
      };
      try {
        await getDb().ref(
          `b2_galerias/${pending.ownerUid}/${pending.sessionId}/media/${pending.mediaId}`,
        ).set(media);
      } catch (error) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: pending.objectKey })).catch(() => undefined);
        throw error;
      }
      await settleStorageReservation(pending.size, true);
      await pendingRef.remove();
      return res.status(201).json({
        id: media.id,
        filename: media.filename,
        mimeType: media.mimeType,
        size: media.size,
        createdAt: media.createdAt,
      });
    } catch (error) {
      functions.logger.error('Error completing gallery upload:', error);
      return res.status(502).json({
        error: 'No se pudo completar la carga del archivo a Backblaze B2.',
      });
    }
  },
);

router.post(
  '/gallery/uploads/:uploadToken/abort',
  verifyFirebaseAuth,
  requireGalleryAdmin,
  async (req: Request, res: Response) => {
    const uploadToken = String(req.params.uploadToken);
    if (!validId(uploadToken)) {
      return res.status(400).json({ error: 'El identificador de carga no es válido.' });
    }
    const pendingRef = getDb().ref(`b2_pending_uploads/${uploadToken}`);
    try {
      const pending = (await pendingRef.get()).val();
      if (!pending) return res.status(200).json({ message: 'No hay una carga pendiente que cancelar.' });
      if (pending.createdByUid !== req.user!.uid) {
        return res.status(404).json({ error: 'No se encontró una carga pendiente.' });
      }
      if (!pending.uploadAborted) {
        await getB2Client().send(new AbortMultipartUploadCommand({
          Bucket: b2Environment().bucketName,
          Key: pending.objectKey,
          UploadId: pending.uploadId,
        }));
        await pendingRef.update({ uploadAborted: true });
      }
      await settleStorageReservation(pending.size, false);
      await pendingRef.remove();
      return res.status(200).json({ message: 'Carga cancelada.' });
    } catch (error) {
      functions.logger.error('Error aborting gallery upload:', error);
      return res.status(502).json({ error: 'No se pudo cancelar la carga pendiente.' });
    }
  },
);

router.get(
  '/gallery/sessions/:sessionId/media',
  verifyFirebaseAuth,
  async (req: Request, res: Response) => {
    res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    try {
      const resolved = await resolveSession(req, String(req.params.sessionId), req.query.email);
      if (!resolved) {
        return res.status(404).json({ error: 'No se encontró esa sesión para esta cuenta.' });
      }

      const config = b2Environment();
      const client = getB2Client();
      const [mediaSnapshot, preferenceSnapshot] = await Promise.all([
        getDb().ref(`b2_galerias/${resolved.uid}/${resolved.session.id}/media`).get(),
        getDb()
          .ref(`gallery_b2_preferences/${resolved.uid}/${resolved.session.id}`)
          .get(),
      ]);
      const preferences = preferenceSnapshot.val() || {};
      const media = await Promise.all(
        Object.values(mediaSnapshot.val() || {})
          .filter(
            (item: any) =>
              item && validId(item.id) && typeof item.objectKey === 'string',
          )
          .map(async (item: any) => {
            const filename = safeFilename(item.filename);
            const [url, downloadUrl] = await Promise.all([
              getSignedUrl(
                client,
                new GetObjectCommand({
                  Bucket: config.bucketName,
                  Key: item.objectKey,
                }),
                { expiresIn: downloadUrlLifetimeSeconds },
              ),
              getSignedUrl(
                client,
                new GetObjectCommand({
                  Bucket: config.bucketName,
                  Key: item.objectKey,
                  ResponseContentDisposition:
                    `attachment; filename="${filename.replace(/["\\]/g, '_')}"; ` +
                    `filename*=UTF-8''${encodeURIComponent(String(item.filename || filename))}`,
                }),
                { expiresIn: downloadUrlLifetimeSeconds },
              ),
            ]);
            const preference = preferences[item.id] || {};
            return {
              id: item.id,
              filename: item.filename,
              mimeType: item.mimeType,
              size: item.size,
              createdAt: item.createdAt,
              url,
              downloadUrl,
              isFavorite: preference.favorite === true,
              isHidden: preference.hidden === true,
            };
          }),
      );

      return res.status(200).json(
        media.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
      );
    } catch (error) {
      functions.logger.error('Error listing gallery media:', error);
      return res.status(503).json({
        error: error instanceof Error
          ? error.message
          : 'No se pudieron cargar las fotos y videos de esta sesión.',
      });
    }
  },
);

router.put(
  '/gallery/sessions/:sessionId/media/:mediaId/preference',
  verifyFirebaseAuth,
  async (req: Request, res: Response) => {
    const { isFavorite, isHidden } = req.body || {};
    const mediaId = String(req.params.mediaId);
    if (
      !validId(mediaId) ||
      typeof isFavorite !== 'boolean' ||
      typeof isHidden !== 'boolean'
    ) {
      return res.status(400).json({ error: 'Las preferencias de la foto no son válidas.' });
    }

    try {
      const resolved = await resolveSession(req, String(req.params.sessionId));
      if (!resolved || resolved.uid !== req.user!.uid) {
        return res.status(404).json({ error: 'No se encontró esa sesión para esta cuenta.' });
      }
      const mediaSnapshot = await getDb()
        .ref(`b2_galerias/${resolved.uid}/${resolved.session.id}/media/${mediaId}`)
        .get();
      if (!mediaSnapshot.exists()) {
        return res.status(404).json({ error: 'No se encontró el archivo de la galería.' });
      }
      const preferenceRef = getDb().ref(
        `gallery_b2_preferences/${resolved.uid}/${resolved.session.id}/${mediaId}`,
      );
      if (!isFavorite && !isHidden) {
        await preferenceRef.remove();
      } else {
        await preferenceRef.set({
          favorite: isFavorite,
          hidden: isHidden,
          updatedAt: new Date().toISOString(),
        });
      }
      return res.status(200).json({ mediaId, isFavorite, isHidden });
    } catch (error) {
      functions.logger.error('Error updating gallery preference:', error);
      return res.status(500).json({ error: 'No se pudieron guardar las preferencias.' });
    }
  },
);

router.delete(
  '/gallery/sessions/:sessionId/media/:mediaId',
  verifyFirebaseAuth,
  requireGalleryAdmin,
  async (req: Request, res: Response) => {
    const mediaId = String(req.params.mediaId);
    if (!validId(mediaId)) {
      return res.status(400).json({ error: 'El identificador del archivo no es válido.' });
    }
    try {
      const resolved = await resolveSession(req, String(req.params.sessionId), req.query.email);
      if (!resolved) {
        return res.status(404).json({ error: 'No se encontró esa sesión para el cliente.' });
      }
      const mediaRef = getDb().ref(
        `b2_galerias/${resolved.uid}/${resolved.session.id}/media/${mediaId}`,
      );
      const media = (await mediaRef.get()).val();
      if (!media?.objectKey) {
        return res.status(404).json({ error: 'No se encontró el archivo de la galería.' });
      }
      await getB2Client().send(
        new DeleteObjectCommand({
          Bucket: b2Environment().bucketName,
          Key: media.objectKey,
        }),
      );
      await Promise.all([
        mediaRef.remove(),
        getDb()
          .ref(`gallery_b2_preferences/${resolved.uid}/${resolved.session.id}/${mediaId}`)
          .remove(),
      ]);
      return res.status(200).json({ message: 'Archivo eliminado de la galería.' });
    } catch (error) {
      functions.logger.error('Error deleting gallery media:', error);
      return res.status(502).json({ error: 'No se pudo eliminar el archivo de Backblaze B2.' });
    }
  },
);

export default router;
