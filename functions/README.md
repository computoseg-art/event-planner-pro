# Firebase Cloud Functions - Setup & Deployment

## 📋 Descripción

Este directorio contiene las **Firebase Cloud Functions v2** para Event Planner Pro.

La API Express migrada desde `backend-agenda/` se ejecuta como una Cloud Function invocable por HTTP, proporcionando:

- 🔐 Autenticación con Firebase ID tokens
- 💳 Integración Mercado Pago con webhooks
- 📅 Gestión de reservas y disponibilidad
- 🖼️ Galería con Backblaze B2
- 📧 Notificaciones por Brevo

## 🚀 Inicio rápido

### 1. Instalar dependencias

```bash
cd functions
npm ci
```

### 2. Configurar secretos

Crear un archivo `.env` en `functions/` (basado en `.env.example`):

```bash
cp .env.example .env
# Edita .env con credenciales reales (solo prueba local)
```

### 3. Ejecutar emulador local

```bash
firebase emulators:start --only functions
```

Accede a `http://localhost:5001/fotos-44002/us-central1/api`

### 4. Testing

```bash
npm test
```

### 5. Desplegar a producción

```bash
firebase deploy --only functions --project fotos-44002
```

## 📂 Estructura

```
functions/
├── src/
│   ├── index.ts                 # Cloud Function + Express app
│   ├── middleware/
│   │   └── auth.ts              # Autenticación Firebase
│   ├── services/
│   │   ├── installment-plan.ts  # Planes de cuotas
│   │   └── catalogo-servicios.ts # Catálogo de servicios
│   └── routes/
│       ├── reservations.ts      # Endpoints de reservas
│       ├── payments.ts          # Pagos Mercado Pago
│       └── gallery.ts           # Galería y uploads
├── package.json
├── tsconfig.json
├── .env.example                 # Variables de entorno
├── .gitignore
└── README.md
```

## 🔐 Variables de entorno

| Variable | Descripción | Tipo |
|---|---|---|
| `MP_ACCESS_TOKEN` | Token de Mercado Pago | Secret |
| `MP_WEBHOOK_SECRET` | Firma de webhooks MP | Secret |
| `CLIENT_URL` | URL del frontend | Public |
| `ADMIN_EMAILS` | Correos administradores | Public |
| `BREVO_API_KEY` | Clave API Brevo | Secret |
| `EMAIL_FROM` | Remitente de correos | Public |
| `B2_*` | Credenciales Backblaze B2 | Secret |

### Configurar secretos en Cloud Secret Manager

Los secretos sensibles se declaran en `src/index.ts` con `defineSecret` y se
vinculan a la función mediante `secrets`. Después de declararlos, crea cada uno
con Firebase CLI:

```bash
firebase functions:secrets:set MP_ACCESS_TOKEN
firebase functions:secrets:set MP_WEBHOOK_SECRET
firebase functions:secrets:set BREVO_API_KEY
firebase functions:secrets:set B2_KEY_ID
firebase functions:secrets:set B2_APPLICATION_KEY
```

Cada comando solicita el valor de forma interactiva y no lo guarda en el código
ni en la terminal. Selecciona el proyecto `fotos-44002` y vuelve a desplegar la
función:

```bash
firebase deploy --only functions --project fotos-44002
```

Las variables no secretas (`CLIENT_URL`, `BACKEND_PUBLIC_URL`, `ADMIN_EMAILS`,
`EMAIL_FROM`, `EMAIL_TO`, `B2_BUCKET_NAME`,
`B2_ENDPOINT` y `B2_REGION`) pueden configurarse como variables de entorno de
la función. Durante desarrollo local continúan leyendo `functions/.env`, que no
debe versionarse.

## 🧪 Testing local

### Crear preferencia de pago

```bash
curl -X POST http://localhost:5001/fotos-44002/us-central1/api/create_preference \
  -H "Authorization: Bearer <FIREBASE_ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "reservationId": "res-123",
    "amount": 5000,
    "description": "Fotografía de Boda"
  }'
```

### Listar reservas

```bash
curl http://localhost:5001/fotos-44002/us-central1/api/api/reservations \
  -H "Authorization: Bearer <FIREBASE_ID_TOKEN>"
```

## 📊 Logs y monitoreo

### Ver logs en Cloud Functions

```bash
firebase functions:log --project fotos-44002
```

### Tail de logs en tiempo real

```bash
firebase functions:log --project fotos-44002 --follow
```

## 🔄 Migración desde Render

| Paso | Render | Cloud Functions |
|---|---|---|
| Despliegue | `git push heroku main` | `firebase deploy` |
| Secretos | Variables de entorno en Heroku | Cloud Secret Manager |
| Logs | Heroku dashboard | Firebase Console / CLI |
| Escaling | Manual/Auto | Automático |
| Cold start | Visible | Generalmente invisible |

## ⚡ Tipps de rendimiento

- **Cold starts:** Functions v2 son rápidas; primer request puede tardar 1-2s
- **Conexión a BD:** Reutiliza conexión con `admin.database()` globalmente
- **Memoria:** Aumenta si el compilado de TypeScript es grande
- **Timeout:** Functions tienen límite de 540s; acorta operaciones largas

## 🚨 Troubleshooting

### "PERMISSION_DENIED: Permission 'cloudfunctions.functions.create' denied"

Necesitas permisos en Cloud IAM. Verifica:

```bash
gcloud projects get-iam-policy fotos-44002
```

### "Firebase service account not found"

El emulador local puede no tener acceso a credenciales. Usa:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json
firebase emulators:start
```

### "Database ref permission denied"

Revisa `database.rules.json` y asegúrate que `fotos-44002-...` tenga acceso.

## 🔗 Referencias

- [Firebase Cloud Functions docs](https://firebase.google.com/docs/functions)
- [Express.js guide](https://expressjs.com/)
- [Firebase Admin SDK](https://firebase.google.com/docs/database/admin/start)
- [Mercado Pago API](https://www.mercadopago.com.ar/developers/es/reference)

## 📝 Próximos pasos

- [ ] Migrar endpoints de `backend-agenda/index.js` → `routes/*.ts`
- [ ] Configurar Cloud Secret Manager
- [ ] Validar webhook de Mercado Pago
- [ ] Probar flujo de galería completo
- [ ] Deploy staging
- [ ] Deploy producción

---

**Rama:** `functions`  
**Estado:** 🟡 En desarrollo  
**Última actualización:** 2026-11-18
