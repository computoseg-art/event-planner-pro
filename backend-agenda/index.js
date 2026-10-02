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
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// Endpoint de prueba
app.get('/', (req, res) => {
  res.send({ status: 'OK', message: 'Backend de EventPlanner Pro activo' });
});

// Endpoint de preferencia de pago con VALIDACIÓN DE FECHAS SEGURA
app.post('/create_preference', async (req, res) => {
  try {
    const { total, descripcion, fecha } = req.body;

    // 1. Validación básica de monto
    if (!total || isNaN(Number(total)) || Number(total) <= 0) {
      return res.status(400).json({
        error: 'El monto total es requerido y debe ser mayor a 0.'
      });
    }

    // 2. VALIDACIONES DE FECHA (ANTI-F12 / CONTROL DE VENCIMIENTO)
    if (fecha) {
      // Obtener fecha actual del servidor (sin horas)
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      // Parsear la fecha del evento (Formato esperado: "YYYY-MM-DD")
      const [year, month, day] = fecha.split('T')[0].split('-').map(Number);
      const fechaEvento = new Date(year, month - 1, day);
      fechaEvento.setHours(0, 0, 0, 0);

      // REGLA 1: La reserva debe realizarse con al menos 3 días de anticipación
      const fechaMinimaReserva = new Date(hoy);
      fechaMinimaReserva.setDate(hoy.getDate() + 3);

      if (fechaEvento < fechaMinimaReserva) {
        return res.status(400).json({
          error: 'No se pueden realizar ni pagar reservas con menos de 3 días de anticipación.'
        });
      }

      // REGLA 2: Vencimiento por falta de pago (Máximo hasta 2 días antes del evento)
      const fechaLimitePago = new Date(fechaEvento);
      fechaLimitePago.setDate(fechaEvento.getDate() - 2);

      // Si hoy es posterior a la fecha límite de pago, la reserva caducó
      if (hoy > fechaLimitePago) {
        return res.status(400).json({
          error: 'La reserva ha caducado. El plazo límite de pago era hasta 2 días antes del evento.'
        });
      }
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
      binary_mode: true, // Fuerza respuesta inmediata
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