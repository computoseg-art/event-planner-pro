# Firebase Cloud Functions

Código backend vigente de Event Planner Pro. Se compila con TypeScript, Node.js
24, ESM y resolución `NodeNext`.

## Exports

- `api`: Firebase Functions v2 HTTPS + Express
- `reservationMaintenance`: Cloud Scheduler cada 15 minutos

## Instalar y compilar

```powershell
cd functions
npm ci
npm run build
```

## Estructura

```text
src/
  index.ts
  middleware/auth.ts
  routes/contact.ts
  routes/gallery.ts
  routes/payments.ts
  routes/reservations.ts
  services/catalogo-servicios.ts
  services/installment-plan.ts
```

## Rutas

Todas se publican detrás de `/api` salvo la ruta raíz de la función.

| Método | Ruta | Acceso |
|---|---|---|
| POST | `/api/contact` | Público con rate limit |
| GET/POST | `/api/reservations` | Autenticado |
| PUT/DELETE | `/api/reservations/:id` | Autenticado, con control de propietario/admin |
| POST | `/api/reservations/:id/installment-plan` | Autenticado |
| POST | `/api/reservations/:id/cash-payments` | Administrador |
| POST | `/api/reservations/:id/cash-payments/:paymentId/:action` | Propietario/admin según acción |
| POST | `/api/create_preference` | Autenticado |
| POST | `/api/confirm_payment` | Autenticado |
| POST | `/api/webhook` | Firma de Mercado Pago |
| GET/POST | `/api/gallery/*` | Autenticado; operaciones admin protegidas |

## Secretos

```powershell
firebase functions:secrets:set MP_ACCESS_TOKEN
firebase functions:secrets:set MP_WEBHOOK_SECRET
firebase functions:secrets:set BREVO_API_KEY
firebase functions:secrets:set B2_KEY_ID
firebase functions:secrets:set B2_APPLICATION_KEY
```

Las variables públicas están documentadas en `../guia.md` y en `.env.example`.

## Emulador

```powershell
npx firebase-tools emulators:start --only functions
```

URL local aproximada:

```text
http://localhost:5001/fotos-44002/us-central1/api
```

## Despliegue

```powershell
npm run build
npx firebase-tools deploy --only functions --project fotos-44002
```

Para una ruta concreta:

```powershell
npx firebase-tools deploy --only functions:api --project fotos-44002
npx firebase-tools deploy --only functions:reservationMaintenance --project fotos-44002
```

## Logs

```powershell
npx firebase-tools functions:log --project fotos-44002
```

## Notas

- No use `firebase functions:config:set`; esta aplicación usa secretos definidos
  con `defineSecret` y variables de entorno.
- `lib/` es generado y no se versiona.
- `index.js` reexporta `api` y `reservationMaintenance` desde `lib/index.js`.
