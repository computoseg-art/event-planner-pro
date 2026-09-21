import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// Dominios permitidos (Producción y Desarrollo local)
const allowedOrigins = [
  'https://fotos-44002.web.app',
  'https://fotos-44002.firebaseapp.com',
  'http://localhost:4200',
  'http://localhost:4500'
];

app.use(cors({
  origin: function (origin, callback) {
    // Permitir peticiones sin origen (como Postman o curl) o si están en la lista
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Endpoint de prueba para verificar que el backend está activo
app.get('/', (req, res) => {
  res.send({ status: 'OK', message: 'Backend de EventPlanner Pro activo' });
});

// Endpoint de preferencia de pago
app.post('/create_preference', async (req, res) => {
  try {
    const { total, descripcion } = req.body;

    if (!total || isNaN(Number(total)) || Number(total) <= 0) {
      return res.status(400).json({
        error: 'El monto total es requerido y debe ser mayor a 0.'
      });
    }

    const clientUrl = process.env.CLIENT_URL || 'https://fotos-44002.web.app';

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
        success: `${clientUrl}/agenda`,
        failure: `${clientUrl}/agenda`,
        pending: `${clientUrl}/agenda`,
      },
      auto_return: 'approved',
    };

    const preference = new Preference(client);
    const result = await preference.create({ body });

    res.json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
    });

  } catch (error) {
    console.error('Error detallado:', error.api_response?.content || error);
    res.status(500).json({ error: 'Error al crear la preferencia de pago.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`);
});
