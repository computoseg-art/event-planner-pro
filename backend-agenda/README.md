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

El formulario de contacto local requiere `BREVO_API_KEY` y `EMAIL_FROM` (remitente verificado en Brevo). El backend también necesita todas sus variables requeridas para arrancar, incluidas `MP_WEBHOOK_SECRET`, `FIREBASE_DATABASE_URL` y `BACKEND_PUBLIC_URL`; consulta `.env.example` y configura `.env` sin compartir ni subir secretos. Las variables SMTP antiguas (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`) ya no se usan. No apuntes el frontend local a producción para probar el formulario, porque podría enviar correos reales.

Para usar la galería, completa también `ADMIN_EMAILS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` y `REFRESH_TOKEN` en `.env`. `MP_ACCESS_TOKEN` solo sirve para Mercado Pago; no autoriza a Google Photos. La integración usa los permisos vigentes de Google Photos Library: `photoslibrary.appendonly` para crear álbumes y subir imágenes, `photoslibrary.readonly.appcreateddata` para listar el contenido creado por la aplicación y `photoslibrary.edit.appcreateddata` para quitar imágenes de los álbumes de la aplicación.

`getToken.js` lee `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REDIRECT_URI` desde `.env`; no requiere `credentials.json`. Para obtener el refresh token, registra en Google Cloud el URI local `http://127.0.0.1:3000/oauth2callback` como URI de redirección autorizada, configura ese mismo valor en `GOOGLE_REDIRECT_URI`, y ejecuta desde `backend-agenda`:

```powershell
node getToken.js
```

Abre el enlace que imprime el script, autoriza la cuenta Google que administrará los álbumes y copia el refresh token que aparece en la consola. Guárdalo como `REFRESH_TOKEN` en `.env` y en las variables de entorno de Render. Si se cambian los permisos solicitados en `getToken.js`, repite la autorización; un refresh token emitido antes de conceder estos permisos puede seguir devolviendo errores `403 PERMISSION_DENIED` o de alcance insuficiente. Las APIs de Google Photos no admiten cuentas de servicio para acceder a fotos; `FIREBASE_SERVICE_ACCOUNT_JSON` es únicamente para Firebase Admin.

La API de Library solo permite enumerar o modificar álbumes y elementos multimedia creados por esta aplicación. Las fotos existentes subidas manualmente a Google Photos o creadas por otra aplicación no se pueden importar con este flujo; para que aparezcan aquí, súbelas desde la galería web.

## Despliegue en Render

Configura el servicio con:

- **Root Directory:** `backend-agenda`
- **Build Command:** `npm ci`
- **Start Command:** `npm start`

En **Environment** de Render, configura `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_DATABASE_URL`, `CLIENT_URL`, `BACKEND_PUBLIC_URL`, `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`, `EMAIL_TO` y las credenciales de Google Photos indicadas abajo. Render proporciona `PORT`; no hace falta definirlo manualmente.

- `MP_ACCESS_TOKEN`: credencial de producción de Mercado Pago. No la subas a Git ni la compartas por chat.
- `MP_WEBHOOK_SECRET`: clave secreta de firma que muestra la configuración de Webhooks de Mercado Pago.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: contenido JSON de una cuenta de servicio con acceso a la Realtime Database y `project_id` `fotos-44002`. En Render, guarda el contenido JSON como valor de la variable secreta, nunca en el repositorio. No uses la configuración web del SDK.
- `FIREBASE_DATABASE_URL`: URL de Realtime Database del proyecto `fotos-44002` (`https://fotos-44002-default-rtdb.firebaseio.com`).
- `CLIENT_URL`: origen público actual de Hosting (`https://fotos-44002.web.app`), sin `/agenda` ni barra final.
- `BACKEND_PUBLIC_URL`: URL pública actual de Render (`https://event-planner-pro-k978.onrender.com`), sin barra final.
- `ADMIN_EMAILS`: lista separada por comas de los correos administradores autorizados para administrar carpetas, subir fotos y borrar fotos de cualquier galería. Debe coincidir con los administradores configurados en el frontend.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` y `REFRESH_TOKEN`: credenciales OAuth de Google Photos usadas por el backend para crear álbumes y subir/leer imágenes. Configúralas como variables secretas en Render y no las subas a Git.
- `BREVO_API_KEY`: clave API transaccional creada en Brevo. Guárdala como secreto en Render; no la publiques ni la compartas por chat.
- `EMAIL_FROM`: dirección remitente que hayas verificado en Brevo. Verifica el remitente o dominio en Brevo antes de probar el formulario.
- `EMAIL_FROM_NAME`: nombre que se muestra como remitente; usa `BSfotografia & Videografia`.
- `EMAIL_TO`: destinatario del formulario de contacto; por ahora usa `esteban.garriga@gmail.com`. Para cambiar la cuenta más adelante, actualiza este valor en Render.

El formulario público envía mensajes al destinatario configurado en `EMAIL_TO`; el visitante no puede controlar el destinatario. El correo del visitante se establece como `Reply-To`. El backend usa la API HTTPS de Brevo (`api.brevo.com`) y no necesita conexiones SMTP ni puertos 465/587.

La llamada HTTP a Brevo tiene un límite de espera para evitar que el formulario quede indefinidamente en “Enviando…”. Al cambiar el proveedor, elimina de Render las variables SMTP antiguas `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER` y `EMAIL_PASS`, y agrega `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME` y `EMAIL_TO`. Luego redepliega el backend. Si Brevo rechaza un mensaje, consulta el log `Brevo rechazó el correo de contacto` en Render; los errores de credencial o remitente no verificado se registran con el estado devuelto por Brevo.

Al registrar o iniciar sesión, el backend crea (si aún no existe) una carpeta personal de Google Photos para la cuenta, y también lo intenta al abrir `/galeria` para recuperar cuentas existentes. El título usa el formato `Galería - <nombre de usuario> - <Firebase UID>`; el UID hace único el nombre y el ID real del álbum queda guardado en Realtime Database para reutilizar siempre esa misma carpeta. En `/galeria`, los clientes ven su carpeta personal. El administrador abre la galería de un cliente por correo; la consulta y las subidas usan automáticamente el ID del álbum personal de esa cuenta, sin selección ni creación manual de carpetas. Si una cuenta antigua ya tenía un álbum predeterminado, se conserva y reutiliza para no perder sus fotos. Tanto clientes como administradores pueden eliminar una foto después de confirmar la acción; el backend solo permite a cada cliente eliminar fotos de sus propias carpetas y reserva a los administradores el acceso a otras galerías. Los administradores pueden subir hasta 5 imágenes de 25 MB por lote. Las imágenes permanecen en la biblioteca de Google autorizada por OAuth en el backend. Los permisos se comprueban en el backend con Firebase Auth y `ADMIN_EMAILS`; ocultar controles en la interfaz no es el control de seguridad.

En Mercado Pago, registra `https://<BACKEND_PUBLIC_URL>/webhook` como URL de notificaciones y habilita el evento **Pagos**. Configura allí la firma secreta correspondiente en `MP_WEBHOOK_SECRET`. El backend también consulta el pago directamente cuando el usuario vuelve a la agenda; los parámetros de retorno del navegador no se consideran prueba de pago.

Cuando Mercado Pago confirma un pago, el backend conserva la intención en `pagos_pendientes/<externalReference>` con `estado: "approved"` y además archiva el registro aprobado en `pagos_aprovados/<paymentId>`. El historial visible por cuenta queda en `historial_pagos/<usuario>/<paymentId>`. La escritura de estos tres registros se hace en una única actualización de Realtime Database; los datos de `pagos_pendientes` no se eliminan para preservar la trazabilidad del checkout.

Antes de habilitar cobros reales, completa un pago de prueba de punta a punta con credenciales y cuentas de prueba. El backend toma el importe y las reservas pendientes desde Firebase, comprueba la sesión de Firebase y actualiza los saldos solo después de verificar un pago aprobado con Mercado Pago.

Revisa también las reglas de Realtime Database en Firebase Console: los clientes no deben poder editar `pagado`, `estado` ni los marcadores de pagos de una reserva. Ese permiso debe quedar reservado al backend con Admin SDK; las reglas actuales de la consola no están versionadas en este repositorio.

Si una clave privada se compartió o se subió a un lugar público, revócala desde **Configuración del proyecto → Cuentas de servicio** y genera una nueva. No reutilices la clave expuesta.
