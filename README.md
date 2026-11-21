# BSfotografia & Videografia

Aplicación Angular para gestionar reservas, pagos y galerías privadas de eventos.

## Producción

- **Frontend:** Firebase Hosting, `https://fotos-44002.web.app`
- **API:** Firebase Cloud Functions v2, bajo `/api` en el mismo dominio de Hosting
- **Autenticación:** Firebase Authentication
- **Datos:** Firebase Realtime Database
- **Pagos:** Mercado Pago
- **Correo:** Brevo
- **Galerías:** Backblaze B2 mediante URLs firmadas
- **Tareas:** Cloud Scheduler ejecuta `reservationMaintenance` cada 15 minutos

## Funcionalidades

- Agenda de reservas con control de disponibilidad.
- Catálogo validado en servidor, precios, descuentos y seña.
- Pago de seña o saldo mediante Mercado Pago.
- Registro y confirmación de pagos en efectivo, incluidos planes de cuotas.
- Avisos por correo de reservas y pagos.
- Historial y comprobante de pagos.
- Recordatorios automáticos y vencimiento de reservas.
- Galerías privadas por cliente, favoritos, ocultos y carga multipart.
- Panel administrativo protegido por Firebase Auth y `ADMIN_EMAILS`.

## Requisitos

- Node.js 24
- npm
- Firebase CLI
- Acceso al proyecto Firebase `fotos-44002`

## Desarrollo local

```powershell
npm ci
npm run build
npm start
```

Angular utiliza `src/environments/environment.ts`; su `apiUrl` local debe apuntar
al servidor que se esté usando. Para probar Functions:

```powershell
cd functions
npm ci
npm run build
cd ..
npx firebase-tools emulators:start --only functions
```

## Despliegue

```powershell
npm run build
npm --prefix functions run build
npx firebase-tools deploy --only functions,hosting --project fotos-44002
```

Si cambian reglas de Realtime Database:

```powershell
npx firebase-tools deploy --only database --project fotos-44002
```

## Configuración

Los secretos se administran con Firebase Secret Manager:

```powershell
firebase functions:secrets:set MP_ACCESS_TOKEN
firebase functions:secrets:set MP_WEBHOOK_SECRET
firebase functions:secrets:set BREVO_API_KEY
firebase functions:secrets:set B2_KEY_ID
firebase functions:secrets:set B2_APPLICATION_KEY
```

La guía completa de variables y publicación está en [guia.md](./guia.md).
La arquitectura está en [ARCHITECTURE.md](./ARCHITECTURE.md).
Para entregar una instalación nueva a otro cliente, usa
[GUIA_ENTREGA_CLIENTE.md](./GUIA_ENTREGA_CLIENTE.md).

## Estructura

```text
src/                         Aplicación Angular
functions/src/               Cloud Functions TypeScript
functions/src/routes/        Reservas, pagos, contacto y galería
functions/src/services/      Catálogo y planes de cuotas
database.rules.json          Reglas de Realtime Database
firebase.json                Hosting, Functions y rewrites
src/app/data/                Catálogo consumido por el frontend
```

No publiques `.env`, claves de cuenta de servicio, tokens de Mercado Pago,
credenciales B2 ni claves API de Brevo.
