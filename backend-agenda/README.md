# Backend de pagos

## Configuración local

1. Copia `.env.example` a `.env`. El archivo `.env` está excluido de Git.
2. Para pruebas, usa credenciales de prueba de Mercado Pago (token `TEST-...`), no el token real.
3. Genera una clave privada nueva de una cuenta de servicio de `fotos-44002` con acceso a la Realtime Database. Convierte el archivo JSON descargado a JSON compacto (por ejemplo, con `Get-Content .\cuenta-servicio.json -Raw | ConvertFrom-Json | ConvertTo-Json -Compress`) y guarda el resultado como valor de `FIREBASE_SERVICE_ACCOUNT_JSON` en `.env`. Debe ser una sola línea, conservar el `project_id` `fotos-44002` y no ser la configuración web del SDK.
4. Instala dependencias y ejecuta:

   ```powershell
   npm ci
   npm start
   ```

El servidor comprueba las variables requeridas al iniciar y no imprime el token de Mercado Pago.

## Despliegue en Render

Configura el servicio con:

- **Root Directory:** `backend-agenda`
- **Build Command:** `npm ci`
- **Start Command:** `npm start`

En **Environment** de Render, configura `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_DATABASE_URL`, `CLIENT_URL` y `BACKEND_PUBLIC_URL`. Render proporciona `PORT`; no hace falta definirlo manualmente.

- `MP_ACCESS_TOKEN`: credencial de producción de Mercado Pago. No la subas a Git ni la compartas por chat.
- `MP_WEBHOOK_SECRET`: clave secreta de firma que muestra la configuración de Webhooks de Mercado Pago.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: contenido JSON de una cuenta de servicio con acceso a la Realtime Database y `project_id` `fotos-44002`. En Render, guarda el contenido JSON como valor de la variable secreta, nunca en el repositorio. No uses la configuración web del SDK.
- `FIREBASE_DATABASE_URL`: URL de Realtime Database del proyecto `fotos-44002` (`https://fotos-44002-default-rtdb.firebaseio.com`).
- `CLIENT_URL`: origen público actual de Hosting (`https://fotos-44002.web.app`), sin `/agenda` ni barra final.
- `BACKEND_PUBLIC_URL`: URL pública actual de Render (`https://event-planner-pro-k978.onrender.com`), sin barra final.

En Mercado Pago, registra `https://<BACKEND_PUBLIC_URL>/webhook` como URL de notificaciones y habilita el evento **Pagos**. Configura allí la firma secreta correspondiente en `MP_WEBHOOK_SECRET`. El backend también consulta el pago directamente cuando el usuario vuelve a la agenda; los parámetros de retorno del navegador no se consideran prueba de pago.

Antes de habilitar cobros reales, completa un pago de prueba de punta a punta con credenciales y cuentas de prueba. El backend toma el importe y las reservas pendientes desde Firebase, comprueba la sesión de Firebase y actualiza los saldos solo después de verificar un pago aprobado con Mercado Pago.

Revisa también las reglas de Realtime Database en Firebase Console: los clientes no deben poder editar `pagado`, `estado` ni los marcadores de pagos de una reserva. Ese permiso debe quedar reservado al backend con Admin SDK; las reglas actuales de la consola no están versionadas en este repositorio.

Si una clave privada se compartió o se subió a un lugar público, revócala desde **Configuración del proyecto → Cuentas de servicio** y genera una nueva. No reutilices la clave expuesta.
