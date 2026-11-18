# Firebase Cloud Functions - Producción

## Resumen

La rama `functions` ha sido preparada para ejecutar la API completa en **Firebase Cloud Functions v2** (Node.js 20).

## Cambios realizados

### 1. Estructura de Functions
- ✅ Configuración TypeScript/ESNext en `functions/tsconfig.json`
- ✅ `package.json` con dependencias de Firebase Functions v2
- ✅ Archivo base `functions/src/index.ts` con Express + Cloud Functions
- ✅ `.env.example` con todas las variables requeridas
- ✅ `firebase.json` actualizado con configuración de Functions

### 2. Ruta de migración desde Render → Functions
La API Express actualmente en `backend-agenda` se trasladará a `functions/src/`:
- Autenticación con Firebase ID tokens
- Endpoints de reservas
- Integración Mercado Pago con webhook
- Galería con Backblaze B2
- Notificaciones por Brevo

### 3. Seguridad

#### Credenciales
- **Service Account:** Usa la identidad de Google Cloud automática en Functions (sin JSON en el código)
- **Secretos:** Almacena en Cloud Secret Manager de Firebase/GCP
- **Variables:** Use `firebase functions:config:set` o Firebase Console

#### Revisiones completadas
- ✅ Archivo de cuenta de servicio rastreado por Git fue eliminado
- ✅ `.gitignore` actualizado para excluir credenciales
- ✅ `serviceAccountKey.json` local está en `.gitignore`

## Checklist pre-producción

### Fase 1: Preparación & Secretos
- [ ] Revoca la clave privada del archivo que fue eliminado (en Google Cloud IAM)
- [ ] Genera una nueva clave de servicio en la consola de Google Cloud
- [ ] Configura secretos en Firebase:
  ```bash
  firebase functions:config:set \
    mp.access_token="APP_USR-..." \
    mp.webhook_secret="tu-secreto" \
    brevo.api_key="xkeysib-..." \
    email.from="remitente@tudominio" \
    b2.key_id="..." \
    b2.app_key="..."
  ```

### Fase 2: Migración de código
- [ ] Copiar lógica de `backend-agenda/index.js` → `functions/src/index.ts`
- [ ] Incluir módulos auxiliares:
  - `installment-plan.js` → `functions/src/services/`
  - `reservation-lookup.js` → `functions/src/services/`
  - `reservation-transaction.js` → `functions/src/services/`
  - `catalogo-servicios.json` → `functions/src/data/`
- [ ] Adaptar middleware de autenticación para Cloud Functions
- [ ] Reemplazar variables de entorno: `process.env.VAR` → `functions.config().path.var`

### Fase 3: Testing local
- [ ] Instalar Firebase CLI: `npm install -g firebase-tools`
- [ ] Crear `.env` en `functions/` con credenciales de prueba
- [ ] Ejecutar emulador: `npm run start` en la carpeta functions
- [ ] Probar endpoints:
  - Crear preferencia de pago
  - Confirmar pago con Mercado Pago
  - Webhook de notificaciones
  - Listar/crear reservas
  - Galería y uploads

### Fase 4: Despliegue staging
- [ ] Deploy a versión experimental en GCP:
  ```bash
  firebase deploy --only functions --project fotos-44002
  ```
- [ ] Validar logs en Firebase Console
- [ ] Probar flujo de pago completo contra producción de BD

### Fase 5: Despliegue producción
- [ ] Actualizar `CLIENT_URL` y `BACKEND_PUBLIC_URL` en Cloud Secret Manager
- [ ] Deploy final:
  ```bash
  firebase deploy --only functions --project fotos-44002
  ```
- [ ] Monitorear métricas (latencia, errores, quota)
- [ ] Desactivar/remover backend Render (una vez validado)

## Cambios en Angular (frontend)

No es necesario modificar mucho, pero actualiza las URLs:

**Antes (Render):**
```typescript
const response = await fetch('https://event-planner-pro-k978.onrender.com/api/...');
```

**Después (Functions):**
```typescript
const response = await fetch('https://fotos-44002.web.app/api/...');
```

Los rewrite en `firebase.json` redirigen `/api/**` a Cloud Functions automáticamente.

## Configuración Cloud Secret Manager

Una vez en GCP, Mercado Pago y otros tokens se guardan así:

```bash
gcloud secrets create mp-access-token --data-file=- <<< "APP_USR-..."
gcloud secrets create mp-webhook-secret --data-file=- <<< "tu-secreto"
gcloud secrets create brevo-api-key --data-file=- <<< "xkeysib-..."
# ... más secretos
```

Luego, en `functions/src/index.ts`, accede a ellos:

```typescript
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
const client = new SecretManagerServiceClient();
const [version] = await client.accessSecretVersion({
  name: `projects/fotos-44002/secrets/mp-access-token/versions/latest`,
});
const secret = version.payload.data.toString();
```

O configúralos en `firebase.functions.config()`.

## Rollback

Si algo falla en Functions:
1. Vuelve a desplegar Render desde `backend-agenda/`
2. Actualiza `firebase.json` para redirigir a Render (URL externa)
3. Desactiva Functions

## Siguientes pasos

1. ⏭️ Continúa con la migración de código en `functions/src/`
2. ⏭️ Configura secretos en Cloud Secret Manager
3. ⏭️ Prueba local con emulador
4. ⏭️ Despliegue staging y validación completa
5. ⏭️ Despliegue producción

---

**Rama actual:** `functions`  
**Estado:** 🟡 Pre-producción  
**Próximo paso:** Migrar código de `backend-agenda/index.js`
