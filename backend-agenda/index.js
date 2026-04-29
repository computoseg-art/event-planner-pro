import express from 'express';
import cors from 'cors';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import dotenv from 'dotenv';

dotenv.config();

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/create_preference', async (req, res) => {
  try {
    const body = {
      items: [
        {
          title: req.body.descripcion || 'Reserva de Servicio',
          quantity: 1,
          unit_price: Number(req.body.total),
          currency_id: 'UYU',
        },
      ],
      back_urls: {
        // Volvemos a localhost, pero ahora con la estructura que el SDK v2 sí entiende
        success: 'http://localhost:4200/agenda',
        failure: 'http://localhost:4200/agenda',
        pending: 'http://localhost:4200/agenda',
      },
      //auto_return: 'approved',
    };

    const preference = new Preference(client);
    // IMPORTANTE: Mantenemos la estructura { body } que vimos en tu ejemplo funcional
    const result = await preference.create({ body });

    res.json({
      id: result.id,
      init_point: result.init_point,
    });
  } catch (error) {
    console.error('Error detallado:', error.api_response?.content || error);
    res.status(500).json({ error: 'Error al crear la preferencia' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
