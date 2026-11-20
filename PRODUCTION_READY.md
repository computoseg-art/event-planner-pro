# Estado de producción

## Estado vigente

- Angular publicado en Firebase Hosting.
- API Express desplegada como `api` en Functions v2.
- Tarea `reservationMaintenance` activa en Cloud Scheduler.
- Node.js 24 y TypeScript `NodeNext`.
- Integraciones: Mercado Pago, Brevo y Backblaze B2.
- Webhook: `https://fotos-44002.web.app/api/webhook`.

## Antes de cada despliegue

```powershell
npm run build
npm --prefix functions run build
firebase deploy --only functions,hosting --project fotos-44002
```

## Validación posterior

- Health check de `/api/`.
- Formulario de contacto.
- Reserva y aviso por correo.
- Seña y saldo Mercado Pago.
- Efectivo y confirmación cliente.
- Galería y carga multipart.
- Logs de `api` y `reservationMaintenance`.

Render está descartado. La guía operativa completa es [guia.md](./guia.md).
