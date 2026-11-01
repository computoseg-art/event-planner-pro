# Guía de configuración y publicación en producción

Esta aplicación se publica en **Firebase Hosting** y usa un backend Express en **Render**. Firebase administra el acceso y la Realtime Database; Render conecta la aplicación con Mercado Pago, Brevo y Google Photos. En esta guía, “Brave” se interpreta como **Brevo**, el proveedor de correo transaccional usado por el formulario de contacto.

## 1. Arquitectura en producción

```text
Navegador
  ├─ Firebase Hosting: sirve la aplicación Angular
  ├─ Firebase Authentication: registra e identifica al usuario
  ├─ Firebase Realtime Database: reservas, fechas y datos asociados
  └─ Render (API Express)
       ├─ Firebase Admin SDK: valida usuarios y realiza operaciones privilegiadas
       ├─ Mercado Pago: crea preferencias y verifica pagos/webhooks
       ├─ Brevo: envía los mensajes del formulario de contacto
       └─ Google Photos: crea y administra álbumes de galerías
```

El frontend nunca debe contener claves privadas, secretos de webhooks, tokens de Mercado Pago, contraseñas OAuth ni credenciales de cuenta de servicio. Los secretos pertenecen a las variables de entorno de Render (y a `backend-agenda/.env` solo para desarrollo local). La configuración Firebase del frontend sí se distribuye en el JavaScript del navegador: no es una credencial de administrador; el acceso se protege con Authentication y las reglas de Realtime Database.

## 2. Antes de configurar servicios

1. Confirma que tienes acceso a Firebase Console, Render, Mercado Pago, Brevo y Google Cloud.
2. Usa el proyecto Firebase **`fotos-44002`** para Hosting, Authentication y Realtime Database.
3. En este repositorio, `.firebaserc` tiene `calendario-71490` como proyecto predeterminado. Para evitar publicar accidentalmente en otro proyecto, usa siempre `--project fotos-44002` en los comandos de Firebase.
4. Conserva como dominios de producción los que ya están configurados en la aplicación:
   - Frontend: `https://fotos-44002.web.app`
   - Backend: `https://event-planner-pro-k978.onrender.com`
5. Si cambia cualquiera de esos dominios, actualiza también las variables `CLIENT_URL` o `BACKEND_PUBLIC_URL` según corresponda y revisa la lista CORS del backend, las URLs de retorno de pagos y el webhook de Mercado Pago.

## 3. Firebase

### 3.1 Authentication

En Firebase Console, abre el proyecto `fotos-44002`:

1. En **Authentication → Sign-in method**, habilita los proveedores que la aplicación ofrece: correo/contraseña y Google.
2. En **Authentication → Settings → Authorized domains**, comprueba que estén autorizados `fotos-44002.web.app` y `fotos-44002.firebaseapp.com`. Añade otros dominios solo si realmente se usan.
3. Crea o verifica las cuentas administradoras en Authentication. Los administradores actuales están definidos en el frontend y en `database.rules.json`; sus correos deben coincidir también con `ADMIN_EMAILS` en Render. Cambiar solo esta variable no agrega un nuevo administrador en toda la aplicación.

### 3.2 Realtime Database y reglas

1. Verifica que Realtime Database esté creada en el proyecto `fotos-44002`.
2. Revisa `database.rules.json` antes de publicar. Las reglas permiten a cada usuario acceder a sus propios datos y reservan ciertas operaciones a los administradores.
3. Publica las reglas con:

   ```powershell
   firebase deploy --only database --project fotos-44002
   ```

No abras la base de datos con reglas públicas. Las reglas de cliente no sustituyen las validaciones de Render; las operaciones privilegiadas deben pasar por Firebase Admin SDK en el backend. En particular, revisa las reglas de reservas y pagos antes de habilitar cobros reales.

### 3.3 Configuración Firebase del frontend

Los valores de `firebase` se obtienen en **Configuración del proyecto → General → Tus aplicaciones → aplicación web**. Deben corresponder al proyecto `fotos-44002` y estar en:

- `src/environments/environment.ts`: desarrollo local.
- `src/environments/environment.prod.ts`: compilación de producción.

Propiedades esperadas:

| Propiedad | Valor de Firebase |
|---|---|
| `apiKey` | Clave de la aplicación web Firebase |
| `authDomain` | Dominio de Authentication, normalmente `fotos-44002.firebaseapp.com` |
| `databaseURL` | URL de Realtime Database del proyecto |
| `projectId` | `fotos-44002` |
| `storageBucket` | Bucket indicado para la aplicación web en Firebase |
| `messagingSenderId` | Remitente indicado en la configuración web |
| `appId` | ID de la aplicación web |
| `measurementId` | ID de Analytics, si está configurado |

En producción, `environment.prod.ts` debe tener `production: true` y `apiUrl` debe apuntar a la URL base pública de Render, sin `/api` al final. Angular sustituye automáticamente `environment.ts` por `environment.prod.ts` al compilar con `--configuration production`.

## 4. Variables del backend: Render

En Render, abre el servicio web del backend → **Environment**. La configuración habitual es:

- **Root Directory:** `backend-agenda`
- **Build Command:** `npm ci`
- **Start Command:** `npm start`
- **Runtime:** Node.js

Agrega las variables de la tabla. Los secretos se ingresan directamente en el panel de Render; no los pegues en el repositorio, en `guia.md` ni en el chat. Render proporciona `PORT` al servicio.

### 4.1 Variables necesarias para arrancar el backend

El backend termina el arranque con error si falta cualquiera de estas seis variables:

| Variable | Cómo obtener/configurarla | Uso |
|---|---|---|
| `MP_ACCESS_TOKEN` | En Mercado Pago Developers, crea/consulta las credenciales de la aplicación. Usa `TEST-...` para pruebas; para operar en vivo, usa la credencial de producción `APP_USR-...`. | Autentica las solicitudes del backend a Mercado Pago. El servidor rechaza valores que no empiecen por `TEST-` o `APP_USR-`. |
| `MP_WEBHOOK_SECRET` | En Mercado Pago, abre la configuración de Webhooks de la aplicación y copia la clave secreta de firma. | Verifica que las notificaciones de pago recibidas por Render sean auténticas. No es el access token. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | En Google Cloud/Firebase, crea una cuenta de servicio con acceso administrativo necesario para Firebase Admin SDK en `fotos-44002`. Pega el **JSON completo** como valor secreto de Render, conservando los saltos de línea escapados dentro de `private_key`. Verifica que `project_id` sea `fotos-44002`. | Permite al backend validar tokens de Firebase y administrar datos autorizados. No uses aquí el objeto `firebase` del frontend ni una clave web. |
| `FIREBASE_DATABASE_URL` | Copia la URL de Realtime Database desde Firebase Console. Para este proyecto es `https://fotos-44002-default-rtdb.firebaseio.com`. | Indica al SDK Admin qué base de datos usar. |
| `CLIENT_URL` | Origen de Firebase Hosting: `https://fotos-44002.web.app`. Sin ruta, `/agenda` ni barra final. | Configura el origen permitido para CORS y los destinos de retorno de la experiencia de pagos. |
| `BACKEND_PUBLIC_URL` | URL pública asignada al servicio de Render: `https://event-planner-pro-k978.onrender.com`. Sin barra final. | Se usa para generar enlaces y registrar la URL del webhook de pagos. |

**Cómo introducir `FIREBASE_SERVICE_ACCOUNT_JSON`:** en Render pega el contenido JSON como valor de una sola variable. No publiques el archivo JSON ni lo incluyas en commits. Si una clave privada se compartió accidentalmente, revócala en Google Cloud y genera otra.

### 4.2 Variables de funcionalidad

Estas variables no bloquean el arranque en todos los casos, pero son necesarias para las funciones indicadas:

| Variable | Configuración | Función / observaciones |
|---|---|---|
| `BREVO_API_KEY` | Crea una clave API transaccional en Brevo y guárdala como secreto. | Autoriza al backend a enviar el correo del formulario mediante la API HTTPS de Brevo. Sin ella, contacto devuelve servicio temporalmente no disponible. |
| `EMAIL_FROM` | Dirección de remitente verificada en Brevo. | Remitente efectivo de los mensajes. Debe estar validado por Brevo. |
| `EMAIL_FROM_NAME` | Por ejemplo, `BSfotografia & Videografia`. | Nombre visible del remitente. Si se omite, el backend usa ese nombre por defecto. |
| `EMAIL_TO` | Buzón que recibirá los formularios; configura explícitamente el destinatario vigente del negocio. | El visitante no puede elegir el destinatario. Si se omite, actualmente hay un destinatario predeterminado en el backend. |
| `ADMIN_EMAILS` | Correos separados por coma, en minúscula o separados por coma normal, por ejemplo `admin@dominio.com,otro@dominio.com`. | Autoriza operaciones administrativas del backend, especialmente la gestión de galerías. Mantén la lista alineada con los administradores codificados en frontend y `database.rules.json`; esta variable por sí sola no crea administradores en esos otros componentes. |
| `GOOGLE_CLIENT_ID` | ID de cliente OAuth 2.0 creado en Google Cloud para Google Photos. | Identifica el cliente OAuth usado por el backend para acceder a los álbumes. |
| `GOOGLE_CLIENT_SECRET` | Secreto del mismo cliente OAuth. | Permite renovar el acceso OAuth. Guárdalo solo en Render y en el `.env` local protegido. |
| `GOOGLE_REDIRECT_URI` | Debe coincidir exactamente con un URI autorizado para ese cliente OAuth. En el flujo de obtención local se usa `http://127.0.0.1:3000/oauth2callback`. | Parámetro del cliente OAuth que usa el backend al renovar tokens. |
| `REFRESH_TOKEN` | Se obtiene una vez autorizando la cuenta Google que administra las galerías (ver sección 6). | Permite al backend obtener tokens de acceso renovables a Google Photos sin volver a pedir autorización al visitante. |
| `PORT` | No la definas manualmente en Render; Render provee este valor. Para ejecución local se usa normalmente `3000`. | Puerto HTTP en el que escucha Express. |

El correo usa `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME` y `EMAIL_TO`. Las variables SMTP antiguas (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`) ya no se usan. No es necesario abrir puertos SMTP: el backend llama por HTTPS a Brevo.

### 4.3 Guardar y desplegar en Render

1. Añade las variables de arranque y las necesarias para las funciones que habilitarás.
2. Guarda los cambios. Render reiniciará o volverá a desplegar el servicio; revisa **Events** y **Logs**.
3. Confirma que el servicio quede disponible antes de publicar el frontend.
4. Prueba la raíz del backend en el navegador: `https://event-planner-pro-k978.onrender.com/`. Una respuesta HTTP 200 confirma que el servicio está despierto, pero no verifica por sí sola pagos, correo o galerías.
5. Para problemas de arranque, busca en los logs `Faltan variables de entorno requeridas`. Para errores de correo busca `Brevo rechazó el correo de contacto`; nunca copies tokens o secretos a tickets públicos.

## 5. Integración de Mercado Pago

1. Configura `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` de la misma aplicación/cuenta de Mercado Pago.
2. En el panel de Mercado Pago, registra como URL de notificaciones:

   ```text
   https://event-planner-pro-k978.onrender.com/webhook
   ```

3. Habilita el evento de pagos y configura la firma secreta correspondiente en `MP_WEBHOOK_SECRET`.
4. El frontend solicita la operación al backend. El backend crea la preferencia y devuelve el enlace de pago; el navegador no decide por sí solo que una reserva está pagada.
5. Al recibir una notificación, Render valida la firma y consulta el pago a Mercado Pago. También vuelve a verificarlo al retorno del usuario. Solo una aprobación confirmada por Mercado Pago permite actualizar el estado y el historial en Firebase.
6. Antes de cobrar de verdad, prueba el flujo completo con credenciales y cuentas de prueba. Confirma importes, reservas afectadas, notificaciones y reglas de la base de datos.

Los usuarios autenticados pueden abrir **Mi perfil** desde el navbar para ver sus reservas, el historial de pagos confirmados y el total abonado. Desde cada pago se puede abrir el diálogo de impresión y elegir **Guardar como PDF** para descargar un comprobante interno con el detalle del evento, importe abonado, total y descuento registrado. Este comprobante no reemplaza una factura fiscal. Los pagos anteriores a esta función pueden no tener detalle de reserva, pero conservan su importe, fecha e identificador de operación.

**Precios durante las pruebas:** el catálogo del frontend mantiene el precio de checkout en `$1` mientras se prueba la aplicación. Los importes promocionales que se muestran al público son informativos y no deben confundirse con el valor cobrado. Antes de habilitar cobros reales, revisa el catálogo y el cálculo del backend para reemplazar los importes de prueba; usa primero credenciales de prueba de Mercado Pago. No cambies solo el texto promocional.

## 6. Integración de Brevo (formulario de contacto)

1. En Brevo, completa la verificación del remitente o dominio.
2. Crea una clave API transaccional y ponla en `BREVO_API_KEY` en Render.
3. Define `EMAIL_FROM` con una dirección verificada, `EMAIL_FROM_NAME` con el nombre del negocio y `EMAIL_TO` con el buzón receptor.
4. Guarda las variables y espera a que Render reinicie el backend.
5. Envía un mensaje de prueba desde el sitio publicado solo cuando quieras verificar el envío real. La solicitud puede generar un correo; una respuesta HTTP exitosa indica que Brevo aceptó el envío, no necesariamente que llegó a la bandeja de entrada.

El backend valida nombre, email y mensaje, aplica un límite de solicitudes por IP y envía el contenido a `EMAIL_TO`. El email ingresado por el visitante se usa como `Reply-To`, nunca como destinatario. Si falla, revisa los logs del backend y el estado del remitente/API key en Brevo.

## 7. Integración de Google Photos (galerías)

Esta integración es independiente de Firebase Authentication y de Mercado Pago:

1. En Google Cloud, selecciona el proyecto adecuado y habilita las APIs de Google Photos que el flujo de la aplicación utiliza. La autorización solicita los alcances `photoslibrary.appendonly`, `photoslibrary.readonly.appcreateddata` y `photoslibrary.edit.appcreateddata`.
2. Configura la pantalla de consentimiento OAuth y crea un cliente OAuth. Añade como URI de redirección autorizado el que uses al obtener el token, por ejemplo `http://127.0.0.1:3000/oauth2callback`.
3. Añade `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REDIRECT_URI` en el `.env` local del backend.
4. Desde `backend-agenda`, ejecuta `node getToken.js`. Abre el enlace generado, autoriza la cuenta Google que administrará las galerías y guarda el `REFRESH_TOKEN` que aparece en la consola. No compartas ni registres ese token en Git.
5. Copia las cuatro variables OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `REFRESH_TOKEN`) en Render y reinicia el servicio.
6. Mantén `ADMIN_EMAILS` sincronizada. Render comprueba autorización en el backend; ocultar botones en Angular no es un control de acceso.

El backend usa Google Photos para aprovisionar álbumes y leer/subir/eliminar fotos permitidas por la API y los alcances autorizados. Firebase guarda la relación entre usuarios y álbumes; las imágenes permanecen en Google Photos. La API de Google Photos usada por este proyecto solo permite trabajar con el contenido creado por la aplicación; no importa automáticamente fotos subidas manualmente o creadas fuera de este flujo. Si Google Cloud mantiene la aplicación OAuth en modo de prueba, revisa las restricciones vigentes de usuarios de prueba y duración del refresh token.

## 8. Compilar y publicar el frontend en Firebase Hosting

Desde la raíz del repositorio, instala dependencias si hace falta y compila para producción:

```powershell
npm ci
npm run build -- --configuration production
```

El directorio de salida configurado en `firebase.json` es `dist/novedades/browser`. Publica Hosting con el proyecto explícito:

```powershell
firebase deploy --only hosting --project fotos-44002
```

Para publicar reglas y Hosting juntos, primero revisa los cambios y luego ejecuta:

```powershell
firebase deploy --only database,hosting --project fotos-44002
```

El `--project fotos-44002` es importante: no omitirlo evita depender del proyecto predeterminado de `.firebaserc`, que actualmente es distinto.

## 9. Verificación posterior al despliegue

- Abre `https://fotos-44002.web.app` y confirma que carga la página pública.
- Prueba registro e inicio de sesión con una cuenta de prueba y revisa Authentication.
- Comprueba que el usuario solo pueda leer/escribir sus datos permitidos en Realtime Database.
- Abre agenda/reservas y confirma que las solicitudes al backend usan `https://event-planner-pro-k978.onrender.com`, no `localhost`.
- Prueba contacto solo si está permitido generar un email real; revisa respuesta y logs de Brevo/Render.
- Prueba galerías con la cuenta autorizada y confirma que el backend rechaza acciones de usuarios no administradores.
- Prueba pagos con credenciales de prueba y verifica tanto la notificación como el estado final consultado por el backend.
- Revisa la consola del navegador, **Render → Logs** y Firebase Console. No compartas tokens, claves privadas, refresh tokens ni el JSON de la cuenta de servicio al solicitar ayuda.

## 10. Problemas frecuentes

| Síntoma | Qué revisar |
|---|---|
| Render no inicia | Variables obligatorias de la sección 4.1, JSON válido de la cuenta de servicio y `project_id: fotos-44002`. |
| El navegador muestra error CORS | `CLIENT_URL`, origen real del sitio y lista CORS del backend. Deben coincidir exactamente, incluyendo `https` y el dominio. |
| El frontend intenta `localhost:3000` en producción | `environment.prod.ts` y que se haya compilado con `--configuration production`. |
| Login bloqueado | Proveedor habilitado en Authentication, dominio autorizado y proyecto web correcto en `environment.prod.ts`. |
| Firebase devuelve `Permission denied` | Reglas desplegadas, usuario autenticado, correo/clave del usuario y permisos de administrador coherentes en reglas, frontend y `ADMIN_EMAILS`. |
| Mercado Pago no actualiza una reserva | Token y modo correctos, webhook registrado, firma correspondiente en `MP_WEBHOOK_SECRET`, logs y consulta del pago. No marques pagos manualmente como aprobados. |
| Contacto devuelve servicio temporalmente no disponible | `BREVO_API_KEY`, `EMAIL_FROM` válido/verificado y variables guardadas en el servicio Render desplegado. |
| Brevo rechaza el correo | Remitente/dominio verificado, clave API activa y logs de Render; revisa también la bandeja de spam del destinatario. |
| Galería falla al renovar acceso | Los cuatro valores OAuth, refresh token vigente, pantalla de consentimiento, APIs y permisos autorizados. |

## 11. Publicación de cambios

Antes de desplegar, revisa `git status` y no agregues archivos `.env`, JSON de cuentas de servicio, tokens ni credenciales. Después de guardar los cambios en la rama que corresponda, publica primero el backend si cambió su código o sus variables y luego compila/publica Hosting. Las instrucciones exactas de Git dependen de la rama de trabajo activa; evita cambiar o fusionar ramas sin verificar el estado del repositorio.
