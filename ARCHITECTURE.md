# Arquitectura: Event Planner Pro con Firebase Functions v2

## 📐 Diagrama general

```
┌─────────────────────────────────────────────────────────────┐
│                      Angular 20 Frontend                    │
│            (fotos-44002.web.app/dist/novedades)             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    Firebase Auth & ID Token
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
        ▼                                     ▼
  ┌──────────────────┐              ┌─────────────────────────┐
  │  Realtime DB     │              │  Cloud Functions        │
  │  (Firebase)      │◄─────────────┤  Express API v2         │
  │                  │   Admin SDK  │  (Node.js 20)           │
  │  ├─ reservas     │              │                         │
  │  ├─ historiales  │              │  ├─ Reservations       │
  │  ├─ galeria      │              │  ├─ Payments (MP)      │
  │  └─ rules.json   │              │  ├─ Webhooks           │
  └──────────────────┘              │  ├─ Gallery (B2)       │
                                    │  └─ Notifications      │
                                    └────────┬────────────────┘
                                             │
                     ┌───────────────────────┼───────────────────────┐
                     ▼                       ▼                       ▼
            ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
            │  Mercado Pago    │   │  Brevo (Email)   │   │  Backblaze B2    │
            │  (Payments)      │   │  (Notif. Mail)   │   │  (Galería)       │
            │                  │   │                  │   │                  │
            │ ├─ Create pref.  │   │ ├─ Reservations │   │ ├─ Upload media  │
            │ ├─ Confirm pmt.  │   │ ├─ Payments     │   │ ├─ List files    │
            │ └─ Webhooks      │   │ ├─ Reminders    │   │ └─ Signed URLs   │
            └──────────────────┘   │ └─ Confirmations│   │                  │
                                   └──────────────────┘   └──────────────────┘
```

## 🔄 Flujos principales

### 1. Crear reserva

```
Cliente Angular
     │
     ├─ POST /api/reservations (token + datos)
     │
     └─►Cloud Functions
         │
         ├─ Verify token (Firebase Auth)
         ├─ Validate data (catalog, dates)
         ├─ Write to DB (Realtime)
         ├─ Send email (Brevo)
         │
         └─ Return reservation data
```

### 2. Pago con Mercado Pago

```
Cliente Angular
     │
     ├─ POST /create_preference (token + monto)
     │
     └─►Cloud Functions
         │
         ├─ Verify token
         ├─ Create MP preference
         └─ Return preferenceId + init_point
            │
            └─►Cliente → Mercado Pago (checkout)
                       │
                       └─►Webhook /webhook (MP notifications)
                            │
                            ├─ Verify signature
                            ├─ Confirm payment in DB
                            ├─ Send receipt (Brevo)
                            └─ Update reservation status
```

### 3. Galería (B2 + Gallery)

```
Admin Angular
     │
     ├─ POST /api/gallery/sessions (crea evento)
     │
     └─►Cloud Functions
         │
         ├─ Verify admin token
         ├─ Create session in DB
         └─ Return sessionId
            │
            └─ Admin → POST /api/gallery/uploads/:uploadToken/part-urls
                       │
                       └─►Cloud Functions
                           │
                           ├─ Sign B2 upload URL
                           └─ Return S3 presigned URLs
                              │
                              └─ Browser (multipart upload → B2)
                                 │
                                 └─ POST /api/gallery/uploads/:uploadToken/complete
                                    │
                                    └─►Cloud Functions
                                        │
                                        ├─ Verify upload
                                        ├─ Update DB
                                        └─ Return media metadata
```

## 🔐 Seguridad

### Autenticación

```
Request
├─ Authorization: Bearer <FIREBASE_ID_TOKEN>
│
└─►Cloud Functions
   │
   ├─ Extract token
   ├─ Call admin.auth().verifyIdToken()
   ├─ Decode uid + email
   └─ Attach to request.user

Endpoints protegidos
├─ verifyFirebaseAuth (todos)
├─ requireAdmin (admin-only)
└─ requireGalleryAdmin (gallery-only)
```

### Almacenamiento

- **Secretos MP, Brevo, B2** → Cloud Secret Manager (no en código)
- **Service Account** → Google Cloud IAM (identidad automática)
- **Realtime DB Rules** → `database.rules.json` (granular)

## 📊 Comparativa: Render vs Cloud Functions

| Aspecto | Render | Cloud Functions v2 |
|---|---|---|
| **Despliegue** | `git push` | `firebase deploy` |
| **Escalado** | Manual/Auto | Automático |
| **Cold start** | 20-30s | 1-2s |
| **Secretos** | Env vars | Cloud Secret Mgr |
| **Logs** | Dashboard Render | Firebase Console |
| **Precio** | Desde $7/mes | Per-invocation |
| **Límite** | Conexiones simultaneas | 540s timeout |
| **Recomendado** | Dev/staging | Producción |

## 🚀 Despliegue

### Local (emulador)

```bash
cd functions
npm ci
firebase emulators:start --only functions
# http://localhost:5001/fotos-44002/us-central1/api
```

### Staging

```bash
firebase deploy --only functions --project fotos-44002
# https://fotos-44002.cloudfunctions.net/api (URL temporal)
```

### Producción

```bash
# 1. Configurar secretos en Cloud Secret Manager
# 2. Verificar reglas de Realtime DB
# 3. Deploy
firebase deploy --only functions --project fotos-44002

# 4. Actualizar frontend para usar /api (via firebase.json rewrites)
# 5. Monitorear logs
firebase functions:log --project fotos-44002 --follow
```

## 🔍 Monitoreo

### Métricas en Firebase Console

- Número de invocaciones
- Latencia (p50, p95, p99)
- Tasa de errores
- Uso de memoria
- Duración de ejecución

### Logs

```bash
# Tail en tiempo real
firebase functions:log --follow

# Grep de errores
firebase functions:log | grep -i error

# Formato JSON
firebase functions:log --json
```

## 🔄 CI/CD

Sugerencia: usar GitHub Actions

```yaml
# .github/workflows/deploy-functions.yml
on:
  push:
    branches: [main]
    paths: ['functions/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci --prefix functions
      - run: npm run build --prefix functions
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          projectId: fotos-44002
          channelId: live
```

## 📋 Checklist de producción

- [ ] Secretos configurados en Cloud Secret Manager
- [ ] Reglas de Realtime DB validadas
- [ ] Webhook Mercado Pago configurado
- [ ] CORS correcto en frontend URL
- [ ] Logging y monitoreo activados
- [ ] Backup de datos validado
- [ ] Testing de flujos críticos (pago, galería)
- [ ] Capacidad de rollback verificada
- [ ] Documentación actualizada
- [ ] On-call rotation si corresponde

---

**Versión:** 1.0  
**Última actualización:** 2026-11-18  
**Estado:** 🟡 Pre-producción
