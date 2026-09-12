import { MercadoPagoConfig, Preference } from 'mercadopago';
import 'dotenv/config';

console.log(process.env.MP_ACCESS_TOKEN);

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN // Tu token APP_USR-...
});

app.post('/create_preference', async (req, res) => {
  try {
    const preference = new Preference(client);

    const body = {
      items: [
        {
          title: req.body.title || 'Reserva de evento',
          unit_price: Number(req.body.price),
          quantity: 1,
          currency_id: 'UYU' // Asegúrate de que coincida con el país de la cuenta
        }
      ],
      payer: {
        email: req.body.email || 'comprador_test@email.com' // Email del pagador
      },
      back_urls: {
        success: 'http://localhost:4200/agenda',
        failure: 'http://localhost:4200/agenda',
        pending: 'http://localhost:4200/agenda'
      },
      auto_return: 'approved'
    };

    const response = await preference.create({ body });
    res.json({ id: response.id, init_point: response.init_point });

  } catch (error) {
    console.error('Error detallado:', error);
    res.status(500).json({ error: error.message });
  }
});
