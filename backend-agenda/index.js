import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import dotenv from 'dotenv';

dotenv.config();

// Servidor y cliente MP
const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:4200';

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// Middlewares
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

// Endpoint de preferencia de pago
app.post('/create_preference', async (req, res) => {
  try {
    const { total, descripcion } = req.body;

    if (!total || isNaN(Number(total)) || Number(total) <= 0) {
      return res.status(400).json({
        error: 'El monto total es requerido y debe ser mayor a 0.'
      });
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
        success: `${CLIENT_URL}/agenda`,
        failure: `${CLIENT_URL}/agenda`,
        pending: `${CLIENT_URL}/agenda`,
      },
      auto_return: 'approved',
    };

    const preference = new Preference(client);
    const result = await preference.create({ body });

    res.json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point, // Útil en entornos de prueba
    });

  } catch (error) {
    console.error('Error detallado:', error.api_response?.content || error);
    res.status(500).json({ error: 'Error al crear la preferencia de pago.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`);
});
