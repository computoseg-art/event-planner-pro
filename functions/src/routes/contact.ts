/**
 * Contact routes - Form submissions via Brevo
 */

import { Router, Request, Response } from 'express';
import * as functions from 'firebase-functions';

const router = Router();

interface ContactFormData {
  nombre: string;
  email: string;
  telefono?: string;
  asunto: string;
  mensaje: string;
}

/**
 * POST /api/contact - Send contact form via Brevo
 */
router.post('/api/contact', async (req: Request, res: Response) => {
  try {
    const { nombre, email, telefono, asunto, mensaje } = req.body as ContactFormData;

    // Validation
    if (!nombre || !email || !asunto || !mensaje) {
      return res.status(400).json({ error: 'Faltan campos requeridos.' });
    }

    if (!email.includes('@')) {
      return res.status(400).json({ error: 'Email inválido.' });
    }

    const brevoApiKey = process.env.BREVO_API_KEY?.trim();
    const emailFrom = process.env.EMAIL_FROM?.trim();
    const emailTo = process.env.EMAIL_TO?.trim();

    if (!brevoApiKey || !emailFrom || !emailTo) {
      functions.logger.warn('Brevo configuration incomplete');
      return res.status(503).json({ error: 'Email service not configured.' });
    }

    // Send email via Brevo
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: emailFrom, name: 'BSfotografia & Videografia' },
        to: [{ email: emailTo, name: 'Contacto' }],
        replyTo: { email, name: nombre },
        subject: `Nuevo contacto: ${asunto}`,
        htmlContent: `
          <h2>Nuevo mensaje de contacto</h2>
          <p><strong>Nombre:</strong> ${nombre}</p>
          <p><strong>Email:</strong> ${email}</p>
          ${telefono ? `<p><strong>Teléfono:</strong> ${telefono}</p>` : ''}
          <p><strong>Asunto:</strong> ${asunto}</p>
          <hr/>
          <p><strong>Mensaje:</strong></p>
          <p>${mensaje.replace(/\n/g, '<br>')}</p>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      functions.logger.error('Brevo API error:', error);
      return res.status(502).json({ error: 'No se pudo enviar el mensaje.' });
    }

    return res.status(200).json({ success: true, message: 'Mensaje enviado correctamente.' });
  } catch (error) {
    functions.logger.error('Error sending contact form:', error);
    return res.status(500).json({ error: 'Error al enviar el mensaje.' });
  }
});

export default router;
