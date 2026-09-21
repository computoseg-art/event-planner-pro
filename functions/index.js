import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Cliente de Mercado Pago (usa la variable configurada en Firebase o el .env local)
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

app.use(cors({ origin: true }));
app.use(express.json());

app.post('/create_preference', async (req, res) => {
  try {
    const { total, descripcion } = req.body;

    if (!total || isNaN(Number(total)) || Number(total) <= 0) {
      return res.status(400).json({ error: 'El monto total es requerido y debe ser mayor a 0.' });
    }

    const body = {
      items: [
        {
          title: descripcion || 'Reserva de Servicio',
          quantity: 1,
          unit_price: Number(total),
          currency_id: 'UYU',
        },
      ],
      back_urls: {
        success: 'https://calendario-71490.web.app/agenda',
        failure: 'https://calendario-71490.web.app/agenda',
        pending: 'https://calendario-71490.web.app/agenda',
      },
      auto_return: 'approved',
    };

    const preference = new Preference(client);
    const result = await preference.create({ body });

    res.json({
      id: result.id,
      init_point: result.init_point,
    });
  } catch (error) {
    console.error('Error detallado:', error.api_response?.content || error);
    res.status(500).json({ error: 'Error al crear la preferencia de pago.' });
  }
});

// Exporta el servidor Express envuelto en una Firebase Cloud Function llamada "api"
export const api = onRequest(app);
