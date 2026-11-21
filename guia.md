# Guía de configuración y publicación

Esta guía describe la arquitectura vigente de **Firebase Functions v2**.

## Arquitectura

```text
Firebase Hosting
  └─ Angular
      └─ /api/* rewrite
          └─ Firebase Function "api" (Express)
              ├─ Firebase Authentication/Admin
              ├─ Realtime Database
              ├─ Mercado Pago
              ├─ Brevo
              └─ Backblaze B2

Cloud Scheduler
  └─ reservationMaintenance cada 15 minutos
```

Los secretos nunca deben agregarse al frontend. La configuración web de
Firebase puede distribuirse con Angular porque su acceso está protegido por
Authentication y las reglas de Realtime Database.

## Requisitos de acceso

- Proyecto Firebase `fotos-44002`
- Permisos para desplegar Hosting, Functions, Database y Secrets
- Acceso a Mercado Pago, Brevo y Backblaze B2

El proyecto predeterminado está definido en `.firebaserc`.

## Variables

### Secretos de Firebase

Crear con `firebase functions:secrets:set`:

| Variable | Uso |
|---|---|
| `MP_ACCESS_TOKEN` | Credencial de Mercado Pago |
| `MP_WEBHOOK_SECRET` | Verificación de firma del webhook |
| `BREVO_API_KEY` | Envío transaccional |
| `B2_KEY_ID` | Application Key ID de B2 |
| `B2_APPLICATION_KEY` | Secreto de la Application Key de B2 |

La función `api` debe declarar esos secretos. La función programada declara
`BREVO_API_KEY` para los recordatorios.

### Variables de entorno no secretas

Se cargan desde `functions/.env.fotos-44002` durante el despliegue:

| Variable | Valor esperado |
|---|---|
| `CLIENT_URL` | `https://fotos-44002.web.app` |
| `BACKEND_PUBLIC_URL` | `https://fotos-44002.web.app/api` |
| `ADMIN_EMAILS` | Administradores separados por coma |
| `EMAIL_FROM` | Remitente verificado en Brevo |
| `EMAIL_FROM_NAME` | `BSfotografia & Videografia` |
| `EMAIL_TO` | Buzón receptor |
| `CONTACT_PHONE` | Teléfono incluido en avisos |
| `B2_BUCKET_NAME` | Bucket privado |
| `B2_ENDPOINT` | Endpoint S3 compatible de B2 |
| `B2_REGION` | Región del bucket |

Use `functions/.env.example` como plantilla. No agregue `.env` reales al Git.

## Authentication

1. Habilite correo/contraseña y Google si ambos se ofrecen.
2. Autorice `fotos-44002.web.app` y `fotos-44002.firebaseapp.com`.
3. Cree las cuentas administradoras.
4. Mantenga alineados los correos en:
   - `ADMIN_EMAILS`
   - `src/app/services/auth.service.ts`
   - reglas administrativas de `database.rules.json`

`ADMIN_EMAILS` no crea cuentas ni cambia por sí solo los permisos del frontend.

## Realtime Database

Las operaciones privilegiadas pasan por la API. El cliente puede observar
datos permitidos, pero no debe escribir directamente reservas, pagos,
historial o fechas ocupadas.

Despliegue de reglas:

```powershell
npx firebase-tools deploy --only database --project fotos-44002
```

## Mercado Pago

Configure credenciales de prueba o producción del mismo aplicativo y el secreto
de firma correspondiente.

Webhook vigente:

```text
https://fotos-44002.web.app/api/webhook
```

Habilite los eventos de pagos. El backend:

1. Crea una intención y una preferencia.
2. Verifica que el monto, moneda y usuario correspondan.
3. Valida la firma del webhook.
4. Aplica el pago exactamente una vez.
5. Registra historial y envía notificaciones.

No actualice `pagado` manualmente salvo conciliación documentada de operaciones
reales aprobadas. Para pago de seña se requiere al menos cinco días.

## Brevo

1. Verifique el remitente o dominio.
2. Cree una API key transaccional.
3. Guarde la clave con `firebase functions:secrets:set BREVO_API_KEY`.
4. Configure `EMAIL_FROM` y `EMAIL_TO`.
5. Si activa “Authorized IPs”, desactive el bloqueo para la API o configure IP
   estática de salida; Cloud Functions puede cambiar de IP.
6. Revise que `EMAIL_TO` no esté bloqueado o dado de baja en Brevo.

Una respuesta HTTP exitosa indica que Brevo aceptó el mensaje; revise el log
transaccional para confirmar entrega.

## Backblaze B2

Use una Application Key limitada al bucket, con permisos de lectura, escritura
y borrado.

Configure:

- `B2_KEY_ID`
- `B2_APPLICATION_KEY`
- `B2_BUCKET_NAME`
- `B2_ENDPOINT`
- `B2_REGION`

La carga se realiza en partes de 64 MB directamente del navegador mediante URLs
firmadas. La aplicación limita cada archivo a 100 GB y el contador global
configurado a 9 GB. El bucket debe exponer `ETag` mediante CORS.

## Compilar y publicar

```powershell
npm ci
npm --prefix functions ci
npm run build
npm --prefix functions run build
npx firebase-tools deploy --only functions,hosting --project fotos-44002
```

Firebase crea/actualiza:

- `api`: endpoint HTTPS
- `reservationMaintenance`: tarea cada 15 minutos

Para publicar todo lo versionable:

```powershell
npx firebase-tools deploy --only functions,hosting,database --project fotos-44002
```

## Verificación

- La URL directa de la Function `api` responde con `status: ok`.
- `https://fotos-44002.web.app/api/reservations` responde `401` sin token,
  confirmando que el rewrite llega a la Function y protege la ruta.
- Crear reserva y comprobar correo.
- Confirmar seña y saldo de Mercado Pago.
- Registrar pago en efectivo y confirmarlo desde la cuenta cliente.
- Crear plan de cuotas cuando exista al menos un mes futuro.
- Probar carga, favoritos, ocultos y borrado de galería.
- Revisar `reservationMaintenance` en logs.
- Revisar logs:

```powershell
npx firebase-tools functions:log --project fotos-44002
```

## Diagnóstico

| Síntoma | Revisar |
|---|---|
| 401 en API | Sesión Firebase y token Bearer |
| 403 administrativo | `ADMIN_EMAILS` y correo autenticado |
| `Brevo no envió` | Clave, remitente, destinatario bloqueado e IPs |
| Pago aprobado sin saldo | ID de reserva, intent y `pagosMercadoPago` |
| Webhook rechazado | `MP_WEBHOOK_SECRET` y URL pública |
| B2 no inicia carga | Secrets, CORS, cuota y `ETag` |
| Agenda desactualizada | Logs de `api` y `reservationMaintenance` |
