# Guía para entregar y publicar la aplicación a un cliente

Esta guía sirve para crear una instalación independiente para cada cliente.
No reutilices el proyecto Firebase, las credenciales ni el almacenamiento de una
instalación anterior.

## 1. Antes de comenzar

El cliente debe entregar o aprobar:

- Nombre comercial, logo, favicon, fotografías y colores.
- Dominio definitivo, por ejemplo `https://eventos.cliente.com`.
- Correo electrónico administrativo principal.
- Correos adicionales que tendrán permisos de administrador.
- Teléfono y WhatsApp públicos.
- Dirección remitente para los correos transaccionales.
- Buzón que recibirá reservas, contactos y avisos de pagos.
- Cuenta de Mercado Pago propia.
- País, moneda, zona horaria y reglas de reserva.
- Servicios, precios, descuentos, porcentaje de seña y plazos.
- Plan o presupuesto mensual de Firebase, Brevo y Backblaze.

Por seguridad:

- Cada servicio debe pertenecer al cliente o a una organización administrada
  por él.
- Entrega acceso como propietario o administrador únicamente a quien lo necesite.
- Activa 2FA en Firebase, Google Cloud, Brevo, Mercado Pago y Backblaze.
- Guarda secretos en un administrador de contraseñas corporativo.
- No envíes secretos por chat, correo ni los copies al repositorio.
- La configuración web de Firebase no es un secreto; los tokens de pago,
  API keys de Brevo y Application Keys de B2 sí lo son.
- No se necesita `serviceAccountKey.json`: Firebase Functions usa la identidad
  administrada de Google Cloud en producción.

## 2. Matriz de credenciales y configuración

| Servicio | Dato | Dónde se guarda | ¿Es secreto? |
|---|---|---|---|
| Firebase Web App | `apiKey`, `authDomain`, `databaseURL`, `projectId`, `storageBucket`, `messagingSenderId`, `appId` | `src/environments/environment.ts` y `environment.prod.ts` | No |
| Firebase CLI | Proyecto y Hosting site | `.firebaserc` y `firebase.json` | No |
| Mercado Pago | `MP_ACCESS_TOKEN` | Firebase Secret Manager | Sí |
| Mercado Pago | `MP_WEBHOOK_SECRET` | Firebase Secret Manager | Sí |
| Brevo | `BREVO_API_KEY` | Firebase Secret Manager | Sí |
| Backblaze B2 | `B2_KEY_ID` | Firebase Secret Manager | Sí |
| Backblaze B2 | `B2_APPLICATION_KEY` | Firebase Secret Manager | Sí |
| Backblaze B2 | Bucket, endpoint y región | `functions/.env.<PROJECT_ID>` | No |
| Aplicación | URLs, administradores, remitente y teléfono | `functions/.env.<PROJECT_ID>` | Normalmente no |

Las variables públicas de Functions deben partir de:

```text
functions/.env.example
```

La copia real se llama, por ejemplo:

```text
functions/.env.mi-cliente-prod
```

Ese archivo está ignorado por Git y nunca debe publicarse.

## 3. Crear y preparar Firebase

### 3.1 Crear el proyecto

1. En Firebase Console crea un proyecto nuevo y exclusivo para el cliente.
2. Vincula una cuenta de facturación y selecciona el plan Blaze. Functions v2,
   Secret Manager y Cloud Scheduler requieren facturación aunque el uso sea bajo.
3. Define el identificador del proyecto sin espacios.
4. Añade al cliente como propietario del proyecto.
5. Activa 2FA y revisa los administradores de IAM.

### 3.2 Registrar la aplicación web

1. En Firebase Console, entra en **Configuración del proyecto**.
2. Registra una aplicación web.
3. Copia el objeto `firebaseConfig`.
4. Reemplaza el bloque `firebase` de:
   - `src/environments/environment.ts`
   - `src/environments/environment.prod.ts`
5. En producción, configura:

```ts
production: true,
apiUrl: 'https://dominio-del-cliente.com',
```

Para desarrollo local, `apiUrl` debe apuntar al emulador y usar el nuevo
`PROJECT_ID`:

```ts
apiUrl: 'http://localhost:5001/PROJECT_ID/us-central1',
```

### 3.3 Habilitar Authentication

1. Abre **Authentication > Sign-in method**.
2. Habilita **Correo/contraseña**.
3. Habilita **Google** si el cliente ofrecerá este inicio de sesión.
4. Configura nombre de proyecto, correo de soporte y consentimiento de OAuth.
5. En **Authentication > Settings > Authorized domains**, agrega:
   - `<PROJECT_ID>.web.app`
   - `<PROJECT_ID>.firebaseapp.com`
   - dominio personalizado del cliente
   - cualquier subdominio usado para previews
6. Crea manualmente las cuentas administrativas y exige al cliente cambiar sus
   contraseñas iniciales.

### 3.4 Crear Realtime Database

1. Crea una Realtime Database.
2. Elige la región más cercana al cliente.
3. Comienza con reglas cerradas; no dejes la base en modo abierto.
4. Cambia los correos administrativos en `database.rules.json`.
5. Copia la URL correcta de la instancia al campo `databaseURL`.

La aplicación usa nodos como `reservas`, `historial_pagos`,
`fechas_ocupadas`, `b2_galerias` y contadores de pagos/notificaciones. No migres
datos de otro cliente.

## 4. Configurar correos administradores

Los mismos correos deben coincidir en todos estos lugares:

```text
functions/.env.<PROJECT_ID>                 ADMIN_EMAILS
src/app/services/auth.service.ts            esAdmin y esAdminGaleria
src/app/services/reserva.service.ts         acceso a reservas e historial
database.rules.json                         lectura/escritura administrativa
functions/src/routes/gallery.ts             administrador que gestiona galerías
```

`ADMIN_EMAILS` se escribe separado por comas:

```dotenv
ADMIN_EMAILS=admin@cliente.com,responsable@cliente.com
```

Configura únicamente cuentas reales que ya existan en Firebase Authentication.
Un correo en `ADMIN_EMAILS` no crea la cuenta automáticamente.

## 5. Configurar Hosting y Firebase Functions

### 5.1 Identificador del Hosting site

En Firebase Hosting crea el site definitivo y sustituye el ID en `firebase.json`:

```json
"hosting": {
  "site": "NOMBRE_DEL_SITE"
}
```

Selecciona el proyecto desde la CLI:

```powershell
npx firebase-tools login
npx firebase-tools projects:list
npx firebase-tools use --add
```

Verifica que `.firebaserc` quedó apuntando al `PROJECT_ID` correcto. No despliegues
hasta revisar `npx firebase-tools projects:list` y el proyecto seleccionado.

### 5.2 Variables no secretas de Functions

Crea `functions/.env.<PROJECT_ID>` a partir de `.env.example`:

```dotenv
CLIENT_URL=https://dominio-del-cliente.com
BACKEND_PUBLIC_URL=https://dominio-del-cliente.com/api
ADMIN_EMAILS=admin@cliente.com
EMAIL_FROM=ventas@cliente.com
EMAIL_FROM_NAME=Nombre comercial
EMAIL_TO=administracion@cliente.com
CONTACT_PHONE=+598 00 000 000
B2_BUCKET_NAME=bucket-del-cliente
B2_ENDPOINT=https://s3.<region>.backblazeb2.com
B2_REGION=<region>
```

Si aún no existe el dominio, usa temporalmente la URL `.web.app` para
`CLIENT_URL` y `BACKEND_PUBLIC_URL`; cámbiala cuando el dominio esté verificado.

### 5.3 CORS

En `functions/src/index.ts`, reemplaza y elimina los dominios de la instalación
anterior y autoriza:

- el dominio definitivo;
- `www` si apunta al sitio y se usará;
- la URL `.web.app`;
- la URL `.firebaseapp.com`;
- localhost únicamente para desarrollo.

El nuevo `CLIENT_URL` se agrega automáticamente, pero la lista contiene
también orígenes explícitos que deben coincidir con el nuevo proyecto.

## 6. Configurar Mercado Pago

Usa una aplicación y una cuenta del cliente; no reutilices credenciales de otra
empresa.

1. Crea o selecciona la aplicación de Mercado Pago del cliente.
2. Obtén las credenciales de producción.
3. Guarda el Access Token:

```powershell
npx firebase-tools functions:secrets:set MP_ACCESS_TOKEN --project PROJECT_ID
```

4. Configura en Mercado Pago un webhook de pagos con:

```text
https://dominio-del-cliente.com/api/webhook
```

5. Habilita los eventos de pago necesarios.
6. Guarda el secreto de firma:

```powershell
npx firebase-tools functions:secrets:set MP_WEBHOOK_SECRET --project PROJECT_ID
```

7. Verifica que `BACKEND_PUBLIC_URL` apunte a la misma URL pública.
8. Prueba primero con credenciales de prueba.
9. Al pasar a producción, usa credenciales que no comiencen con `TEST-`.
10. Realiza un pago controlado real de bajo importe, confirma que actualiza saldo
    una sola vez y registra las notificaciones.

El proyecto está configurado para pagos en `UYU`. Cambia la moneda en frontend,
Functions y Mercado Pago si el cliente opera en otro país.

## 7. Configurar Brevo para correos

1. Crea una cuenta Brevo a nombre del cliente.
2. Verifica el remitente o, preferentemente, el dominio del cliente.
3. En el DNS del dominio agrega los registros SPF, DKIM y, si corresponde, DMARC
   que indica Brevo.
4. Crea una API key para envío SMTP/transaccional.
5. Guarda la clave:

```powershell
npx firebase-tools functions:secrets:set BREVO_API_KEY --project PROJECT_ID
```

6. Configura:
   - `EMAIL_FROM`: remitente verificado.
   - `EMAIL_FROM_NAME`: nombre comercial.
   - `EMAIL_TO`: buzón administrativo.
   - `CONTACT_PHONE`: teléfono en avisos.
7. Revisa las políticas de IP autorizadas. Cloud Functions no garantiza una IP
   saliente fija; evita restringir la API key a IPs o configura una solución de
   IP estática acordada.
8. Envía pruebas del formulario, reserva, pago y recordatorio.
9. Revisa en Brevo la aceptación, entrega, rebote y bloqueo del destinatario.

## 8. Configurar Backblaze B2

### 8.1 Bucket

1. Crea un bucket privado exclusivo para el cliente.
2. Elige una región cercana y anota:
   - nombre del bucket;
   - región;
   - endpoint S3.
3. No habilites acceso público general.
4. Configura lifecycle, retención y copias de seguridad según el contrato.
5. Crea una Application Key limitada al bucket, con las capacidades necesarias
   para listar, leer, escribir y borrar archivos.

Guarda las credenciales:

```powershell
npx firebase-tools functions:secrets:set B2_KEY_ID --project PROJECT_ID
npx firebase-tools functions:secrets:set B2_APPLICATION_KEY --project PROJECT_ID
```

Coloca el resto en `functions/.env.<PROJECT_ID>`:

```dotenv
B2_BUCKET_NAME=nombre-del-bucket
B2_ENDPOINT=https://s3.<region>.backblazeb2.com
B2_REGION=<region>
```

### 8.2 CORS del bucket

Agrega como orígenes:

- `https://dominio-del-cliente.com`
- `https://www.dominio-del-cliente.com`, si se usa
- la URL `.web.app` durante pruebas
- `http://localhost:4200` para desarrollo

La regla debe permitir las operaciones S3 usadas por la carga multipart, los
headers necesarios para URLs firmadas y exposición de `ETag`. Una referencia de
los campos en Backblaze es:

```json
[
  {
    "corsRuleName": "event-planner-pro",
    "allowedOrigins": [
      "https://dominio-del-cliente.com",
      "https://PROJECT_ID.web.app",
      "http://localhost:4200"
    ],
    "allowedOperations": [
      "s3_get",
      "s3_put",
      "s3_head",
      "s3_delete"
    ],
    "allowedHeaders": ["*"],
    "exposeHeaders": ["ETag"],
    "maxAgeSeconds": 3600
  }
]
```

Adapta los nombres de operaciones a la interfaz CORS disponible en tu cuenta B2.

### 8.3 Límites y prueba

El código configura actualmente:

- límite global: 9 GB;
- tamaño máximo por archivo: 100 GB;
- partes de carga: 64 MB;
- vigencia de URLs: 4 horas.

Si el cliente necesita más de 9 GB, cambia el límite en
`functions/src/routes/gallery.ts` y en los límites/calificaciones del frontend.
Verifica además el plan contratado de B2.

## 9. Agregar un dominio personalizado

1. Confirma que el dominio pertenece al cliente.
2. En Firebase Hosting selecciona **Agregar dominio personalizado**.
3. Ingresa el dominio y completa la verificación de propiedad con el registro
   TXT indicado por Firebase.
4. Configura exactamente los registros DNS que muestra Firebase; no copies
   direcciones IP de otra instalación.
5. Elimina registros A, AAAA o CNAME contradictorios del mismo nombre.
6. Espera la propagación y el certificado TLS.
7. Agrega dominio y `www` a Authentication.
8. Actualiza:
   - `environment.prod.ts` (`apiUrl`);
   - `CLIENT_URL`;
   - `BACKEND_PUBLIC_URL`;
   - CORS de Functions;
   - CORS de Backblaze;
   - webhook de Mercado Pago.
9. Vuelve a compilar y desplegar después de cambiar estas URLs.

## 10. Personalizar contenido y marca

Revisa como mínimo:

```text
src/index.html
src/styles.css
public/favicon.ico
public/brand-logo.png
public/images/
src/app/components/home/
src/app/components/eventos/
src/app/components/contacto/
src/app/components/profile/
src/app/components/aliados/
src/app/components/agenda/
src/app/data/catalogo-servicios.json
functions/src/index.ts
functions/src/routes/contact.ts
functions/src/routes/payments.ts
functions/src/routes/reservations.ts
```

Cambia:

- nombre comercial;
- logo y favicon;
- email y WhatsApp;
- textos, imágenes y aliados;
- servicios, precios y promociones;
- asuntos y plantillas de correo;
- teléfono usado en recordatorios;
- moneda;
- país/zona horaria;
- porcentaje de seña;
- anticipación mínima de reserva;
- plazo para pagar la seña y el saldo;
- límites de archivos y almacenamiento.

No elimines enlaces de ejemplo (`example.com`) sin reemplazarlos por los enlaces
reales o sin ocultar la sección correspondiente.

## 11. Validar localmente antes de publicar

Desde la raíz:

```powershell
npm ci
npm --prefix functions ci
npm run build
npm --prefix functions run build
npm --prefix functions run lint
npm test -- --watch=false
```

Prueba con el emulador si se necesita:

```powershell
npx firebase-tools emulators:start --only functions
```

Antes del despliegue revisa:

```powershell
npx firebase-tools projects:list
git status
```

Busca restos de otra instalación:

```powershell
rg "fotos-44002|esteban|admin@gmail|BSfotografia|59897403118" src functions firebase.json database.rules.json
```

Si `rg` no está disponible, usa la búsqueda global de VS Code con esos términos.

## 12. Desplegar la nueva instalación

Solo después de los checks anteriores:

```powershell
npm run build
npm --prefix functions run build
npx firebase-tools deploy --only functions,hosting,database --project PROJECT_ID
```

El primer despliegue puede solicitar:

- activar APIs de Google Cloud;
- conceder acceso entre servicios;
- autorizar Secret Manager;
- crear el service agent de Cloud Scheduler.

No aceptes referencias al proyecto de otra instalación.

## 13. Pruebas de aceptación

### Firebase y frontend

- [ ] `/` abre sin errores.
- [ ] Login, registro, recuperación y Google funcionan.
- [ ] Un cliente no ve datos de otros clientes.
- [ ] Cada administrador ve el panel correspondiente.
- [ ] Reglas de Database están publicadas.
- [ ] El dominio personalizado tiene HTTPS válido.
- [ ] No aparecen nombre, correo, teléfono ni logo de otra empresa.

### API

- [ ] La URL directa de la Function `api` responde `status: ok`.
- [ ] `/api/reservations` responde `401` sin sesión.
- [ ] El preflight CORS responde correctamente desde el dominio final.
- [ ] Los logs no muestran errores de autenticación o secretos faltantes.

### Brevo

- [ ] Formulario de contacto llega.
- [ ] Aviso de reserva llega.
- [ ] Aviso de pago llega al cliente y al administrador.
- [ ] El remitente aparece con nombre y dominio verificados.

### Mercado Pago

- [ ] Se crea una preferencia.
- [ ] Redirecciones regresan a la agenda.
- [ ] Webhook firma correctamente.
- [ ] Pago aprobado se acredita una sola vez.
- [ ] Pago fallido o pendiente no modifica el saldo.
- [ ] Moneda y datos del cliente son correctos.

### Backblaze B2

- [ ] “Verificar almacenamiento” responde configurado y conectado.
- [ ] Se crea una sesión de galería para un cliente existente.
- [ ] Sube una imagen pequeña y un video pequeño.
- [ ] Favoritos, ocultos y borrado funcionan.
- [ ] El archivo no se descarga desde una URL pública del bucket.
- [ ] Las URLs firmadas caducan.
- [ ] El contador de almacenamiento vuelve correctamente al abortar.

### Mantenimiento

- [ ] `reservationMaintenance` aparece desplegada.
- [ ] La ejecución programada usa la zona horaria correcta.
- [ ] Reservas vencidas cambian de estado.
- [ ] Recordatorios no se duplican.

## 14. Entrega final al cliente

Entrega:

- propietario del proyecto Firebase/Google Cloud;
- propietario o acceso delegado a Brevo, Mercado Pago y Backblaze;
- repositorio o paquete del código acordado;
- dominio y acceso DNS;
- credenciales guardadas en su administrador de contraseñas;
- procedimiento de despliegue;
- presupuesto mensual y alertas;
- lista de usuarios administradores;
- copia del checklist de aceptación firmado;
- procedimiento de soporte, backup y recuperación.

Configura alertas de facturación en Google Cloud, Brevo y Mercado Pago cuando el
proveedor lo permita. Conserva una copia de respaldo de la configuración y reglas,
pero nunca exportes secretos al repositorio.

## 15. Rollback

Si una publicación falla:

1. No borres ni recrees la base de datos.
2. Revisa los logs de Functions y Hosting.
3. Usa la versión anterior de Hosting desde Firebase Console si el frontend falló.
4. Revierte el commit en Git.
5. Recompila y redepliega el último estado estable.
6. Restaura una versión compatible de reglas solo si el cambio de reglas causó
   el problema.
7. Documenta los datos, pagos o cargas afectados antes de corregirlos.

No compartas ni migres datos de clientes entre proyectos Firebase o buckets B2.
