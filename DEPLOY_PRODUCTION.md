# 🚀 Guía de Despliegue a Producción

## Estado: LISTO PARA DESPLEGAR

**Proyecto:** fotos-44002  
**Rama:** functions  
**Runtime:** Node.js 24  
**Fecha:** 2026-11-18

---

## ⚠️ IMPORTANTE: Configuración de Secretos para Producción

**En Firebase Cloud Functions NO usamos archivos `.env`.**

### Flujo de Configuración:

```
🏠 Local (dev)
   └─ .env file → Desarrollo con emulador

☁️  Producción (Cloud)
   └─ Cloud Secret Manager → Encriptado en Google Cloud
       ↓
       └─ Cloud Functions accede via functions.config() o Secret Manager Client
```

---

## 📋 Checklist de Secretos para Producción

Tienes todas las claves necesarias:

| Clave | Estado | Próximo Paso |
|-------|--------|------------|
| **MP_ACCESS_TOKEN** | ✅ Listo | Configurar en Cloud Secret Manager |
| **MP_WEBHOOK_SECRET** | ✅ Listo | Configurar en Cloud Secret Manager |
| **BREVO_API_KEY** | ✅ Listo | Configurar en Cloud Secret Manager |
| **EMAIL_FROM** | ✅ Listo | Configurar en Cloud Secret Manager |
| **B2_KEY_ID** | ✅ Listo | Configurar en Cloud Secret Manager |
| **B2_APPLICATION_KEY** | ✅ Listo | Configurar en Cloud Secret Manager |
| **Service Account** | ✅ Actualizado | Ya configurado automáticamente |

---

## 🔐 PASO 1: Configurar Secretos en Google Cloud

### Opción A: Usar Firebase CLI (Más Simple)

```bash
firebase functions:config:set \
  mercadopago.access_token="APP_USR-xxxxxxxx" \
  mercadopago.webhook_secret="tu-secreto-webhook" \
  brevo.api_key="xkeysib-xxxxxxxx" \
  brevo.email_from="remitente@tudominio.com" \
  brevo.email_to="admin@tudominio.com" \
  b2.key_id="tu-b2-key-id" \
  b2.app_key="tu-b2-app-key" \
  b2.bucket_name="bsfotografia-galerias-uy-2026" \
  b2.endpoint="https://s3.us-east-005.backblazeb2.com" \
  b2.region="us-east-005" \
  client.url="https://fotos-44002.web.app" \
  backend.url="https://fotos-44002.firebaseapp.com/api"
```

**Esto crea un archivo `.runtimeconfig.json` en la nube.**

### Opción B: Usar Google Cloud Secret Manager (Más Seguro)

```bash
# Crear secretos individuales
gcloud secrets create mp-access-token --data-file=- <<< "APP_USR-xxxxxxxx"
gcloud secrets create mp-webhook-secret --data-file=- <<< "tu-secreto-webhook"
gcloud secrets create brevo-api-key --data-file=- <<< "xkeysib-xxxxxxxx"
gcloud secrets create brevo-email-from --data-file=- <<< "remitente@tudominio.com"
gcloud secrets create b2-key-id --data-file=- <<< "tu-b2-key-id"
gcloud secrets create b2-app-key --data-file=- <<< "tu-b2-app-key"
```

**Luego en el código accedes así:**

```typescript
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();
const [version] = await client.accessSecretVersion({
  name: `projects/fotos-44002/secrets/mp-access-token/versions/latest`,
});
const secret = version.payload.data.toString();
```

---

## 🔧 PASO 2: Configurar en Cloud Console (Interfaz Gráfica)

1. Ve a [Google Cloud Console](https://console.cloud.google.com)
2. Selecciona proyecto **fotos-44002**
3. Ve a **Cloud Functions** → **Cloud Functions**
4. Selecciona la función `api`
5. Click en **Edit** → **Runtime settings**
6. En **Runtime environment variables**, agrega:

```
MP_ACCESS_TOKEN           = APP_USR-xxxxxxxx
MP_WEBHOOK_SECRET         = tu-secreto-webhook
BREVO_API_KEY             = xkeysib-xxxxxxxx
EMAIL_FROM                = remitente@tudominio.com
EMAIL_TO                  = admin@tudominio.com
B2_KEY_ID                 = tu-b2-key-id
B2_APPLICATION_KEY        = tu-b2-app-key
B2_BUCKET_NAME            = bsfotografia-galerias-uy-2026
B2_ENDPOINT               = https://s3.us-east-005.backblazeb2.com
B2_REGION                 = us-east-005
CLIENT_URL                = https://fotos-44002.web.app
BACKEND_PUBLIC_URL        = https://fotos-44002.firebaseapp.com/api
ADMIN_EMAILS              = estebangarriga@gmail.com
```

7. Click **Deploy**

---

## 🚀 PASO 3: Desplegar a Producción

### Opción 1: Deploy Staging (RECOMENDADO PRIMERO)

```bash
# Desde la raíz del proyecto
firebase deploy --only functions --project fotos-44002
```

**Monitorea los logs:**
```bash
firebase functions:log --follow
```

**Prueba:**
```bash
# Reemplaza con tu URL de función
curl https://fotos-44002.firebaseapp.com/api/
# Deberías ver:
# {"status":"ok","service":"Event Planner Pro - Firebase Cloud Functions",...}
```

### Opción 2: Deploy con Alias (Avanzado)

```bash
# Deploy a versión experimental
firebase deploy --only functions --project fotos-44002 --message "Pre-prod v1"

# Si todo está bien, promociona a producción
# (Firebase lo hace automáticamente)
```

---

## ✅ PASO 4: Validar en Producción

### 1. Health Check
```bash
curl https://fotos-44002.firebaseapp.com/api/
```
Debe responder: `{"status":"ok",...}`

### 2. Contact Endpoint (con Brevo)
```bash
curl -X POST https://fotos-44002.firebaseapp.com/api/contact \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Test",
    "email": "test@example.com",
    "asunto": "Test",
    "mensaje": "Test message"
  }'
```
Debe responder: `{"success":true,"message":"Mensaje enviado correctamente."}`

### 3. Verificar Logs en Firebase Console

```bash
# Opción 1: CLI
firebase functions:log --limit 50

# Opción 2: Console
# Abre: https://console.firebase.google.com/project/fotos-44002/functions
```

### 4. Validar Flujo Completo
- [ ] Crear reserva desde frontend
- [ ] Confirmar pago con Mercado Pago
- [ ] Recibir webhook de pago
- [ ] Recibir email de confirmación (Brevo)
- [ ] Upload archivo a galería (B2)
- [ ] Ver en Firebase Console que las invocaciones se registran

---

## 🧪 PASO 5: Pruebas Críticas

### Test de Pago (Mercado Pago)
```bash
# Usar cuenta de prueba de MP
# Usuario: testuser123@testuser.com
# ID: 123123

# En frontend, crear preferencia y pagar con tarjeta de prueba
# Debe generar webhook y actualizar estado en BD
```

### Test de Galería (B2)
```bash
# Subir imagen desde admin panel
# Verificar que aparece en B2 (Backblaze B2 Console)
# Verificar que URL es accesible públicamente
```

### Test de Email (Brevo)
```bash
# Enviar form de contacto
# Verificar que llega email a EMAIL_TO
# Verificar que reply-to es el email del cliente
```

---

## 🔄 PASO 6: Desactivar Render (Después de Validar)

Una vez que TODO funciona en Firebase:

```bash
# 1. En Render, ve a Settings → Dangerous Zone
# 2. Click "Suspend service" (o "Delete service")

# 2. Verifica que trafico ya no va a Render (revisando logs)

# 3. En tu DNS/dominio, actualiza si es necesario
#    (Firebase Hosting ya tiene HTTPS automático)
```

---

## 🚨 Si Algo Falla

### Rollback Inmediato

```bash
# 1. Reactiva Render (si lo suspendiste)
# 2. Redirige tráfico de vuelta a Render

# 3. Desactiva Functions temporalmente
firebase deploy --only functions \
  --project fotos-44002 \
  --message "Rollback - revertir a Render"
```

### Revisar Errores

```bash
# Ver logs con más detalle
firebase functions:log --limit 100

# O en Cloud Console:
# https://console.firebase.google.com/project/fotos-44002/logs
```

---

## 📊 Monitoreo Post-Despliegue

### Métricas Importantes

| Métrica | Dónde Verificar | Valor Esperado |
|---------|-----------------|-----------------|
| **Latencia** | Cloud Monitoring | <500ms |
| **Errores** | Firebase Logs | <1% |
| **Cold Starts** | Cloud Monitoring | <2s |
| **Quota Usage** | Cloud Console | <80% |

### Configurar Alertas (Opcional)

```bash
# En Google Cloud Console → Monitoring
# Crear alert para:
# - Error rate > 5%
# - Latency > 1000ms
# - Function execution failures
```

---

## 💰 Monitoreo de Costos

Firebase Cloud Functions cobra por:
- **Invocaciones:** $0.40 por millón
- **Compute time:** $0.0000041 por GB-segundo

**Estimado:** <$5/mes para tu app

Verificar uso:
```bash
# Google Cloud Console → Billing
```

---

## 📋 Checklist Final Antes de Deploy

- [ ] Todas las claves están configuradas en Cloud Secret Manager
- [ ] `.env` local está actualizado para testing local
- [ ] Variables de entorno validadas en Cloud Console
- [ ] `firebase.json` tiene la configuración correcta
- [ ] `functions/lib/` está compilado (run `npm run build`)
- [ ] Emulador local funciona sin errores
- [ ] Dry-run deployment pasa sin errores
- [ ] Webhook URLs de Mercado Pago actualizadas
- [ ] CORS origins incluyen `fotos-44002.web.app`
- [ ] Realtime DB rules están en producción
- [ ] Service Account tiene permisos correctos
- [ ] Render backend sigue en standby (no eliminado)

---

## 🎯 Próximos Pasos (En Orden)

```
1️⃣  AHORA    → Configurar secretos en Cloud Console
2️⃣  5 min    → Deploy a producción
3️⃣  5 min    → Validar health check
4️⃣  15 min   → Probar endpoints clave
5️⃣  30 min   → Validar flujo de pago completo
6️⃣  1 hora   → Monitorear logs
7️⃣  1+ hora  → Si OK, desactivar Render
```

**Total:** ~2 horas de despliegue + validación

---

## 📞 Soporte & Referencia

| Recurso | URL |
|---------|-----|
| Firebase Console | https://console.firebase.google.com/project/fotos-44002 |
| Cloud Logs | https://console.firebase.google.com/project/fotos-44002/logs |
| Cloud Monitoring | https://console.cloud.google.com/monitoring?project=fotos-44002 |
| Firebase CLI Docs | https://firebase.google.com/docs/cli |
| Cloud Functions Docs | https://firebase.google.com/docs/functions |

---

## ✨ Estado Final

```
✅ Infraestructura:     COMPLETA
✅ Código:              COMPLETO
✅ Configuración:       LISTA (falta secretos)
⏳ Secretos:            PRÓXIMO PASO
⏳ Despliegue:          PRÓXIMO PASO
⏳ Validación:          PRÓXIMO PASO
⏳ Producción:          PRÓXIMO PASO
```

---

**Listo para desplegar cuando quieras.** 🚀

Siguiente: Ejecuta el comando de configuración de secretos de arriba.
