/**
 * Contact routes - Form submissions via Brevo
 */

import { Router, Request, Response } from 'express';
import * as functions from 'firebase-functions';
import { createHash } from 'crypto';
import { getDatabase } from 'firebase-admin/database';

const router = Router();

interface ContactFormData {
  name?: string;
  nombre?: string;
  email?: string;
  telefono?: string;
  asunto?: string;
  message?: string;
  mensaje?: string;
}

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => replacements[character]);
}

/**
 * POST /contact - Send contact form via Brevo
 */
router.post('/contact', async (req: Request, res: Response) => {
  try {
    const body = req.body as ContactFormData;
    const nombre =
      typeof body.name === 'string'
        ? body.name.trim()
        : typeof body.nombre === 'string'
          ? body.nombre.trim()
          : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const telefono = typeof body.telefono === 'string' ? body.telefono.trim() : '';
    const asunto =
      typeof body.asunto === 'string' && body.asunto.trim()
        ? body.asunto.trim()
        : `Mensaje de ${nombre.slice(0, 60)}`;
    const mensaje =
      typeof body.message === 'string'
        ? body.message.trim()
        : typeof body.mensaje === 'string'
          ? body.mensaje.trim()
          : '';

    if (
      !nombre ||
      nombre.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      !mensaje ||
      mensaje.length > 5000
    ) {
      return res.status(400).json({
        error: 'Completa nombre, correo válido y mensaje (máximo 5000 caracteres).',
      });
    }

    const clientIp = String(req.ip || req.headers['x-forwarded-for'] || 'unknown');
    const ipKey = createHash('sha256').update(clientIp).digest('hex').slice(0, 32);
    const now = Date.now();
    let tooManyAttempts = false;
    const rateLimitRef = getDatabase().ref(`contact_rate_limits/${ipKey}`);
    const rateLimit = await rateLimitRef.transaction((current: any) => {
      const attempts = (Array.isArray(current?.attempts) ? current.attempts : [])
        .filter((timestamp: unknown) =>
          typeof timestamp === 'number' && now - timestamp < 15 * 60 * 1000
        );
      if (attempts.length >= 5) {
        tooManyAttempts = true;
        return;
      }
      attempts.push(now);
      return { attempts, updatedAt: new Date(now).toISOString() };
    });
    if (!rateLimit.committed && tooManyAttempts) {
      return res.status(429).json({
        error: 'Se alcanzó el límite de mensajes. Inténtalo nuevamente más tarde.',
      });
    }

    const brevoApiKey = process.env.BREVO_API_KEY?.trim();
    const emailFrom = process.env.EMAIL_FROM?.trim();
    const emailTo = process.env.EMAIL_TO?.trim();

    if (
      !brevoApiKey ||
      !emailFrom ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailFrom) ||
      !emailTo ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo)
    ) {
      functions.logger.warn('Brevo configuration incomplete');
      return res.status(503).json({
        error: 'El formulario de contacto no está disponible temporalmente.',
      });
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: emailFrom,
          name: process.env.EMAIL_FROM_NAME?.trim() || 'BSfotografia & Videografia',
        },
        to: [{ email: emailTo }],
        replyTo: { email, name: nombre },
        subject: `Contacto BSfotografia & Videografia: ${asunto.slice(0, 80)}`,
        textContent: [
          `Nombre: ${nombre}`,
          `Correo: ${email}`,
          ...(telefono ? [`Teléfono: ${telefono}`] : []),
          '',
          'Mensaje:',
          mensaje,
        ].join('\n'),
        htmlContent: `
          <div style="font-family:Arial,sans-serif;padding:20px;background:#f4f4f4;color:#333">
            <div style="max-width:600px;margin:auto;background:#fff;padding:20px;border-radius:8px">
              <h2 style="color:#722f4d">Nuevo mensaje de BSfotografia &amp; Videografia</h2>
              <p><strong>Nombre:</strong> ${escapeHtml(nombre)}</p>
              <p><strong>Correo:</strong> ${escapeHtml(email)}</p>
              ${telefono ? `<p><strong>Teléfono:</strong> ${escapeHtml(telefono)}</p>` : ''}
              <div style="border:1px solid #ddd;padding:15px;background:#fafafa;border-radius:5px">
                <p style="white-space:pre-wrap;margin:0">${escapeHtml(mensaje)}</p>
              </div>
            </div>
          </div>
        `,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const providerResponse = await response.text();
      functions.logger.error('Brevo rejected contact email', {
        status: response.status,
        message: providerResponse.slice(0, 300),
      });
      return res.status(502).json({ error: 'No se pudo enviar el mensaje.' });
    }

    return res.status(200).json({
      message: '¡Gracias! Tu mensaje fue enviado. Te responderemos pronto.',
    });
  } catch (error) {
    functions.logger.error('Error sending contact form:', error);
    const timedOut = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    return res.status(timedOut ? 504 : 500).json({
      error: timedOut
        ? 'El servicio de correo tardó demasiado en responder. Inténtalo nuevamente.'
        : 'Error al enviar el mensaje.',
    });
  }
});

export default router;
