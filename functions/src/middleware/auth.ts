/**
 * Authentication middleware for Cloud Functions.
 */

import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

declare global {
  namespace Express {
    interface Request {
      user?: admin.auth.DecodedIdToken;
      uid?: string;
    }
  }
}

/**
 * Middleware: Verify Firebase ID Token
 */
export async function verifyFirebaseAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.headers.authorization?.split('Bearer ')[1];
  
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    req.uid = decodedToken.uid;
    next();
  } catch (error) {
    functions.logger.error('Token verification failed:', error);
    res.status(401).json({
      error: 'Invalid token',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Middleware: Require admin role
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminEmails = process.env.ADMIN_EMAILS?.split(',') ?? [];
  
  if (!req.user?.email || !adminEmails.includes(req.user.email)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}

/**
 * Middleware: Require gallery admin
 */
export function requireGalleryAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const galleryAdminEmails = process.env.ADMIN_EMAILS?.split(',') ?? [];
  
  if (!req.user?.email || !galleryAdminEmails.includes(req.user.email)) {
    res.status(403).json({ error: 'Gallery admin access required' });
    return;
  }

  next();
}
