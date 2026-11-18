# Guía para instalar la aplicación para otro cliente

Esta guía resume las cuentas, los datos y los cambios necesarios para preparar una
instalación independiente de la aplicación para otro negocio. Está basada en la
rama `efectivo` y complementa la [guía de producción actual](./guia.md).

> **Importante:** la aplicación todavía tiene datos del negocio y del proyecto
> Firebase actual escritos en el código. No alcanza con cambiar las variables
> de Render: hay que adaptar esos puntos y probar la instalación antes de
> entregarla. No se realizaron esos cambios por crear esta guía.

## 1. Qué hace la aplicación

- Muestra el sitio público del negocio y un formulario de contacto.
- Permite registrarse e iniciar sesión con correo y contraseña o con Google.
- Permite elegir servicios, reservar una fecha y pagar mediante Mercado Pago.
- Ofrece pago de seña y saldo; luego de la seña se puede elegir un plan de
  cuotas en efectivo. El administrador registra los pagos y el cliente puede
  confirmarlos o informar una diferencia.
- Muestra reservas, historial y comprobantes internos en el perfil.
- Permite al administrador compartir fotos y videos privados mediante una
  galería; los archivos se almacenan en Backblaze B2.
- Utiliza Brevo para correos de contacto, reservas, pagos y recordatorios.

El comprobante interno **no reemplaza una factura fiscal**. El pago en efectivo
debe entregarse fuera de la aplicación: esta registra y confirma el acuerdo
entre las partes, pero no verifica físicamente la entrega del dinero.

## 2. Cuentas y servicios

Para un cliente nuevo, lo recomendable es que las cuentas y la facturación sean
del cliente o estén formalmente acordadas con él. Otorgá acceso al desarrollador
sin compartir contraseñas y conservá un mecanismo de recuperación.

| Servicio | Página | Para qué se utiliza | Datos que hay que obtener |
|---|---|---|---|
| GitHub | [github.com](https://github.com/) | Repositorio y conexión del código con Render. | Repositorio, rama a desplegar y permisos de acceso. |
| Firebase / Google | [Firebase Console](https://console.firebase.google.com/) | Hosting del frontend, cuentas de usuarios y Realtime Database. | ID del proyecto, configuración web, URL de base de datos, sitio de Hosting y cuenta de servicio. |
| Google Cloud | [Google Cloud Console](https://console.cloud.google.com/) | Proyecto asociado a Firebase y cuenta de servicio del backend. | Acceso al mismo proyecto de Firebase y permisos apropiados para administrar la cuenta de servicio. |
| Render | [dashboard.render.com](https://dashboard.render.com/) | Ejecuta el backend Node.js/Express. | URL del servicio, conexión al repositorio, rama, comandos y variables de entorno. |
| Mercado Pago | [Mercado Pago Developers](https://www.mercadopago.com.uy/developers/) | Checkout, confirmación de pagos y notificaciones webhook. | Cuenta del negocio, aplicación, access token y secreto de firma del webhook; credenciales de prueba y de producción. |
| Brevo | [app.brevo.com](https://app.brevo.com/) | Envío de correos transaccionales. | Clave API, remitente verificado y correo receptor del negocio. |
| Backblaze B2 | [backblaze.com/cloud-storage](https://www.backblaze.com/cloud-storage) | Almacenamiento privado de fotos y videos. | Bucket, región, endpoint S3 y Application Key limitada al bucket. |
| Dominio propio, opcional | Proveedor de dominios elegido por el cliente | Dirección web propia en lugar del dominio proporcionado por Firebase. | Dominio y acceso a sus registros DNS. |

Firebase y Google Cloud están relacionados: **no hace falta crear dos proyectos
distintos**. El proyecto de Google Cloud asociado al proyecto Firebase debe ser
el mismo usado por la cuenta de servicio. Las condiciones, límites, costos y
disponibilidad de cada plataforma pueden cambiar; revisalos con el cliente.

## 3. Datos a pedirle al cliente

- Nombre comercial, logo, textos, fotos y permisos necesarios para usarlas.
- Correo de contacto, teléfono/WhatsApp y, si corresponde, redes sociales.
- Correos de las personas que administrarán reservas y galería.
- Dominio deseado y quién administrará DNS, si se usará uno propio.
- Servicios, precios reales, descuentos, condiciones de seña y saldo.
- País, moneda, datos y cuenta comercial de Mercado Pago.
- Correo o dominio verificado para enviar mensajes, y correo donde recibirlos.
- Quién será dueño de cada cuenta y quién pagará los servicios.
- Política para archivos privados: acceso, tiempo de conservación, copias de
  seguridad, eliminación y tratamiento de datos personales.

No pidas contraseñas ni claves por chat. Las credenciales se generan en cada
proveedor y se cargan directamente como secretos en el servicio correspondiente.

## 4. Crear y configurar Firebase

1. En Firebase Console, creá un **proyecto nuevo** para el cliente.
2. Registrá una aplicación web y copiá su configuración desde **Configuración
   del proyecto → General → Tus aplicaciones**.
3. En **Authentication**, habilitá correo/contraseña y Google. Configurá los
   dominios autorizados que realmente usará el frontend y el correo de soporte
   solicitado por Firebase. Creá las cuentas administradoras acordadas.
4. Creá **Realtime Database**, elegí su ubicación con cuidado y copiá su URL.
   Revisá y adaptá las reglas antes de publicarlas: no uses reglas públicas.
5. Configurá **Hosting** y, si aplica, el dominio personalizado y DNS.
6. Desde **Configuración del proyecto → Cuentas de servicio** o Google Cloud,
   generá una credencial de cuenta de servicio para el backend con los permisos
   necesarios. Guardá el JSON de forma segura: es un secreto y debe pertenecer
   al proyecto nuevo.
7. Actualizá la configuración web en
   [`environment.prod.ts`](./src/environments/environment.prod.ts); para un
   entorno local separado revisá también
   [`environment.ts`](./src/environments/environment.ts). `apiUrl` debe apuntar
   al backend correspondiente, sin `/api` agregado.
8. Revisá [`.firebaserc`](./.firebaserc),
   [`firebase.json`](./firebase.json) y
   [`database.rules.json`](./database.rules.json), especialmente proyecto,
   sitio de Hosting y correos administradores.

La configuración web de Firebase se distribuye al navegador y **no equivale a
la cuenta de servicio privada**. La seguridad depende de Authentication, las
reglas y las validaciones del backend; el JSON privado nunca va en Angular.

### Cambio obligatorio antes de usar otro proyecto

En [`backend-agenda/index.js`](./backend-agenda/index.js), el arranque verifica
que el `project_id` de la cuenta de servicio sea el del proyecto actual. Esa
verificación debe adaptarse al nuevo proyecto; de lo contrario, el backend no
arrancará aunque el JSON sea correcto. En el mismo archivo también hay un
origen Firebase fijo en la configuración CORS que debe revisarse.

## 5. Crear el servicio de Render

1. Conectá Render al repositorio y elegí explícitamente la **rama** que contiene
   la versión que se entregará. Crear una rama o hacer `push` no cambia
   automáticamente la rama configurada para el servicio.
2. Creá un Web Service Node.js con:

   | Ajuste | Valor del proyecto |
   |---|---|
   | Root Directory | `backend-agenda` |
   | Build Command | `npm ci` |
   | Start Command | `npm start` |
   | Runtime | Node.js; el backend declara Node 20 o superior |

3. Copiá la URL pública HTTPS del servicio y configurá las variables de la
   siguiente sección en **Environment**.
4. Desplegá y comprobá en los logs y en el detalle del deploy que el commit
   esperado arrancó correctamente.

### Variables de entorno de Render

Los valores reales se introducen en Render; los ejemplos son marcadores, no
credenciales. El backend comprueba las primeras seis al arrancar.

| Variable | Necesidad | Valor o procedencia |
|---|---|---|
| `MP_ACCESS_TOKEN` | Obligatoria para iniciar y cobrar | Access token de la aplicación de Mercado Pago del cliente. El código acepta `TEST-...` o `APP_USR-...`; usá los valores reales correspondientes al entorno. **Secreto.** |
| `MP_WEBHOOK_SECRET` | Obligatoria para iniciar y verificar notificaciones | Secreto de firma del webhook de la misma aplicación de Mercado Pago. **Secreto.** |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Obligatoria para iniciar | JSON completo de la cuenta de servicio del proyecto nuevo, en una sola variable. No es la configuración web. **Secreto.** |
| `FIREBASE_DATABASE_URL` | Obligatoria para iniciar | URL de Realtime Database del proyecto nuevo. |
| `CLIENT_URL` | Obligatoria para iniciar | Origen público del frontend, por ejemplo `https://sitio-del-cliente.web.app`, sin ruta ni barra final. |
| `BACKEND_PUBLIC_URL` | Obligatoria para iniciar | URL HTTPS del servicio Render, sin ruta ni barra final. Se usa, entre otras cosas, para el webhook. |
| `BREVO_API_KEY` | Necesaria para enviar correos | Clave API transaccional de Brevo. **Secreto.** |
| `EMAIL_FROM` | Necesaria para enviar correos | Remitente verificado en Brevo. |
| `EMAIL_FROM_NAME` | Recomendable | Nombre visible del negocio. Si se omite, el código usa el nombre del negocio actual. |
| `EMAIL_TO` | Recomendable para avisos y contacto | Correo receptor del negocio. Si se omite, hay un destinatario del negocio actual como valor predeterminado; además algunos avisos al administrador dependen de esta variable. |
| `CONTACT_PHONE` | Recomendable | Teléfono del negocio para recordatorios de saldo; si se omite se usa el actual. |
| `ADMIN_EMAILS` | Necesaria para configurar los administradores generales del backend | Correos separados por coma. También hay que adaptar frontend, reglas y acceso a galería; esta variable por sí sola no cambia todos los permisos. |
| `B2_KEY_ID` | Necesaria para galería | ID de la Application Key de Backblaze B2 restringida al bucket. |
| `B2_APPLICATION_KEY` | Necesaria para galería | Secreto de esa Application Key. **Secreto.** |
| `B2_BUCKET_NAME` | Necesaria para galería | Nombre del bucket privado del cliente. |
| `B2_ENDPOINT` | Necesaria para galería | Endpoint S3 HTTPS de la región del bucket, por ejemplo `https://s3.us-east-005.backblazeb2.com`. |
| `B2_REGION` | Necesaria para galería | Región correspondiente al endpoint y al bucket, por ejemplo `us-east-005`. |
| `PORT` | Automática en Render | Render normalmente la proporciona; el backend usa `3000` si no está definida. No fijarla manualmente salvo necesidad. |

Sin las seis obligatorias el backend no inicia. Sin Brevo pueden fallar los
correos; sin las cinco variables B2 la galería no podrá funcionar correctamente.
[`backend-agenda/.env.example`](./backend-agenda/.env.example) muestra los
nombres para desarrollo local, pero contiene referencias al proyecto actual:
adaptalas y no subas el `.env` con secretos.

El backend actual no usa `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`,
`EMAIL_PASS`, `FRONTEND_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI` ni `REFRESH_TOKEN` como variables propias. No son parte
de esta configuración nueva. Antes de borrar variables de una instalación
existente hay que comprobar también qué versión está desplegada y si sus
comandos o herramientas externas las utilizan.

## 6. Configurar Mercado Pago

1. Creá o utilizá una cuenta del país y del negocio correspondiente, y una
   aplicación en [Mercado Pago Developers](https://www.mercadopago.com.uy/developers/).
2. Para pruebas, obtené credenciales y cuentas de prueba de esa aplicación.
   Cargá el token de prueba y el secreto de firma correspondiente en el backend
   de pruebas, separado de los datos de producción.
3. Configurá la URL de notificaciones como
   `https://backend-del-cliente.onrender.com/webhook`, habilitá las
   notificaciones de pagos y cargá la clave secreta en `MP_WEBHOOK_SECRET`.
4. Probá seña, saldo, retorno y webhook. Una redirección del navegador no es por
   sí sola confirmación: el backend consulta y verifica el pago.
5. Solo tras validar el flujo y los precios, configurá credenciales de
   producción de la cuenta correcta. No uses datos de producción para simular
   cobros.

Para recibir webhooks en una computadora local se necesita una URL HTTPS
pública que llegue a ese backend o un entorno de prueba publicado; `localhost`
no es accesible para Mercado Pago.

## 7. Configurar Brevo

1. Creá una cuenta del cliente y verificá el remitente o dominio desde el que
   se enviarán los mensajes.
2. Generá una clave API transaccional y cargá `BREVO_API_KEY`, `EMAIL_FROM`,
   `EMAIL_FROM_NAME` y `EMAIL_TO` en Render.
3. Probá el formulario de contacto y los avisos de reserva y pago. Confirmá que
   el correo llegue efectivamente a la bandeja y revisá los logs ante errores.

La aplicación usa la API HTTPS de Brevo, no requiere configurar los antiguos
datos SMTP. Los recordatorios de saldo se programan dentro del proceso del
backend; dependen de que el servicio esté en funcionamiento y no constituyen
por sí solos una garantía de entrega a horario.

## 8. Configurar Backblaze B2

1. Creá un bucket **privado** para el cliente, preferiblemente exclusivo para
   esta aplicación.
2. Creá una Application Key restringida a ese bucket, con los permisos de
   lectura, escritura y borrado requeridos por la galería. Usá esa clave, no
   la Master Application Key.
3. Copiá ID, secreto, nombre del bucket, región y endpoint S3 compatible a las
   cinco variables `B2_*` de Render.
4. Configurá el CORS del bucket para los orígenes HTTPS reales del frontend y
   las operaciones S3 que utilice la galería; el navegador debe poder leer la
   cabecera `ETag` para completar cargas multipartes.
5. Como administrador, verificá conexión y probá subir, visualizar,
   descargar y borrar archivos de prueba. Como cliente, verificá que no pueda
   acceder a galerías ajenas ni administrar archivos.

El código impone un límite global de **9 GB** y un máximo de **100 GB por
archivo**; el límite global puede impedir alcanzar el máximo individual.
El contador supone que el bucket empieza vacío y se usa solo desde esta app.
Las versiones antiguas de objetos pueden seguir ocupando espacio: revisá las
políticas del bucket y los costos. Las URLs firmadas son acceso temporal y no
deben compartirse públicamente.

## 9. Adaptaciones obligatorias en el código

Antes de usar la aplicación con otro cliente:

1. **Proyecto y URLs:** adaptá Firebase y Hosting como se indica en la sección 4.
   Revisá el control de `project_id` y los orígenes CORS en
   [`backend-agenda/index.js`](./backend-agenda/index.js). Ajustá
   `CLIENT_URL`, `BACKEND_PUBLIC_URL`, `apiUrl`, dominios autorizados y el
   webhook para que todos apunten a la instalación nueva.
2. **Administradores:** revisá
   [`auth.service.ts`](./src/app/services/auth.service.ts),
   [`reserva.service.ts`](./src/app/services/reserva.service.ts),
   [`database.rules.json`](./database.rules.json) y
   [`backend-agenda/index.js`](./backend-agenda/index.js).
   Los correos actuales están escritos en varios lugares. La administración de
   galería tiene además comprobaciones específicas de un correo fijo; buscá y
   adaptá **todas** esas comprobaciones. `ADMIN_EMAILS` no las reemplaza.
   Probá permisos tanto con administradores como con usuarios comunes.
3. **Marca y contacto:** revisá [`src/index.html`](./src/index.html),
   [`contacto.html`](./src/app/components/contacto/contacto.html),
   [`profile.html`](./src/app/components/profile/profile.html),
   [`backend-agenda/index.js`](./backend-agenda/index.js), componentes visuales
   y recursos de [`public/`](./public/). Hay nombre comercial, correo,
   WhatsApp y textos del cliente actual.
4. **Servicios y cobros:** actualizá
   [`catalogo-servicios.json`](./backend-agenda/catalogo-servicios.json).
   El campo `precio` es el que el backend usa para calcular los cobros; en el
   catálogo actual hay precios de prueba de `$1`. `precioPromocional` es
   informativo y no lo reemplaza. Revisá también los importes y condiciones
   visibles en [`catalogo-servicios.ts`](./src/app/services/catalogo-servicios.ts)
   y en los componentes.
5. **Reglas comerciales:** confirmá con el cliente el porcentaje de seña,
   descuento, anticipación, vencimiento y condiciones de cuotas. Actualmente el
   saldo vence tres días antes del evento. El plan divide por meses desde el
   mes siguiente hasta el mes del evento, pero un evento al comienzo del mes
   puede tener su fecha límite en el mes anterior: revisá ese caso antes de
   ofrecer el plan. La moneda `UYU` y la zona horaria `America/Montevideo`
   también están fijadas en el código.
6. **Contenido externo:** revisá las imágenes cargadas desde Unsplash, los
   enlaces de aliados y los recursos de terceros; verificá derechos de uso y
   disponibilidad para el nuevo sitio. No se requiere una cuenta adicional
   de Unsplash en el código actual, pero las imágenes dependen de ese servicio.

No copies reservas, fotos, cuentas ni credenciales del cliente actual al nuevo
sin autorización. Si corresponde migrar datos, prepará un plan específico,
copias de seguridad y controles de acceso.

## 10. Publicación y controles finales

En PowerShell, desde la raíz del proyecto y luego de adaptar los archivos:

```powershell
npm ci
npm run build -- --configuration production
firebase deploy --only database --project ID_DEL_PROYECTO_NUEVO
firebase deploy --only hosting --project ID_DEL_PROYECTO_NUEVO
```

Los comandos de Firebase requieren Firebase CLI, sesión con permisos para el
proyecto y la configuración correcta del sitio y de las reglas. Revisá los
cambios antes de publicar y verificá siempre el ID del proyecto. Para
actualizar una instalación existente, coordiná backend, frontend y reglas para
no interrumpir versiones antiguas.

Lista de verificación para la entrega:

- [ ] Repositorio, rama y commit desplegados en Render son los previstos.
- [ ] Hosting, Authentication, Realtime Database y cuenta de servicio usan el
      proyecto nuevo; ninguna URL apunta al proyecto o backend del cliente anterior.
- [ ] Administradores correctos en frontend, backend, galería y reglas; usuarios
      comunes no pueden acceder a datos ajenos ni operar como administradores.
- [ ] Registro e inicio de sesión por contraseña y Google funcionan.
- [ ] Reserva, disponibilidad, precios, seña y saldo se prueban con datos y
      credenciales de prueba.
- [ ] Webhook y retorno de Mercado Pago actualizan el estado correctamente;
      solo después se habilitan cobros reales.
- [ ] Se crea un plan de cuotas, se registra efectivo, el cliente confirma o
      reporta una diferencia y se comprueba el historial y comprobante.
- [ ] Contacto, correos, galería y permisos de archivos funcionan.
- [ ] Branding, precios, descuentos, moneda, zona horaria, teléfono y políticas
      corresponden al cliente nuevo.
- [ ] Costos, límites, respaldo, recuperación de cuentas y acceso del cliente
      están acordados; los secretos no figuran en Git ni en el frontend.

La [guía de producción actual](./guia.md) y el
[README del backend](./backend-agenda/README.md) contienen más detalles
operativos, pero incluyen valores del proyecto original: no los copies sin
adaptarlos.
