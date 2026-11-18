# 📑 Índice de Referencia Rápida - Rama `functions`

## 🎯 Por Dónde Empezar

**→ Lee primero:** [QUICK_START.md](./QUICK_START.md) (5 min)

---

## 📚 Documentación por Propósito

### Si necesitas...

| Necesidad | Documento | Sección |
|-----------|-----------|---------|
| **Entender la arquitectura** | [ARCHITECTURE.md](./ARCHITECTURE.md) | Diagrama general |
| **Ver qué se creó** | [QUICK_START.md](./QUICK_START.md) | "Qué se Creó" |
| **Configurar secretos** | [PRODUCTION_GUIDE.md](./PRODUCTION_GUIDE.md) | Fase 1 |
| **Setup local** | [functions/README.md](./functions/README.md) | Inicio rápido |
| **Desplegar a staging** | [PRODUCTION_GUIDE.md](./PRODUCTION_GUIDE.md) | Fase 4 |
| **Monitorear logs** | [functions/README.md](./functions/README.md) | Logs y monitoreo |
| **Rollback en caso de problema** | [ARCHITECTURE.md](./ARCHITECTURE.md) | Rollback |

---

## 🗂️ Estructura de Directorios

```
event-planner-pro/
├── functions/                         👈 NUEVA: Cloud Functions
│   ├── src/
│   │   ├── index.ts                 → Punto de entrada (Express)
│   │   ├── middleware/auth.ts       → Autenticación Firebase
│   │   ├── routes/                  → Endpoints (crear aquí)
│   │   │   ├── reservations.ts      🟡 POR CREAR
│   │   │   ├── payments.ts          🟡 POR CREAR
│   │   │   ├── gallery.ts           🟡 POR CREAR
│   │   │   └── contact.ts           🟡 POR CREAR
│   │   └── services/
│   │       ├── catalogo-servicios.ts → Precios & descuentos
│   │       └── installment-plan.ts  → Planes de cuotas
│   ├── package.json                 → Dependencias
│   ├── tsconfig.json                → TypeScript config
│   ├── .env.example                 → Variables template
│   ├── README.md                    → Setup instructions
│   ├── setup-dev.bat                → Automatización (Windows)
│   └── setup-dev.sh                 → Automatización (macOS/Linux)
│
├── backend-agenda/                    (Mantener por referencia, eliminar después)
├── firebase.json                      ✅ Actualizado
├── database.rules.json                ✅ Validado
│
├── 📖 QUICK_START.md                👈 LEE PRIMERO
├── 📖 PRODUCTION_GUIDE.md            (Checklist 5 fases)
├── 📖 ARCHITECTURE.md                (Diagramas)
├── 📖 FUNCTIONS_STATUS.md            (Estado actual)
└── 📖 INDEX.md                       👈 ESTÁS AQUÍ
```

---

## 🚀 Flujo de Desarrollo

```
HOY
├─ ✅ Leer QUICK_START.md
├─ ✅ Verificar estructura
└─ 🟡 Preparar nuevo código

DÍA 1-2: MIGRACIÓN
├─ 🟡 Copiar lógica backend-agenda/ → functions/src/routes/
├─ 🟡 Adaptar middleware
├─ 🟡 Validar dependencias
└─ 🟡 Compilar TypeScript

DÍA 2: TESTING LOCAL
├─ 🟡 npm ci --prefix functions
├─ 🟡 firebase emulators:start
├─ 🟡 Probar endpoints
└─ 🟡 Validar webhook Mercado Pago

DÍA 3: STAGING
├─ 🟡 Configurar secretos en Cloud Secret Manager
├─ 🟡 firebase deploy --only functions
├─ 🟡 Validar flujos críticos
└─ 🟡 Monitorear logs

DÍA 3-4: PRODUCCIÓN
├─ 🟡 firebase deploy --only functions
├─ 🟡 Validar métricas
├─ 🟡 Monitorear 24h
└─ ✅ Eliminar Render (opcional)
```

---

## 🔧 Comandos Útiles

```bash
# Setup inicial
cd functions
./setup-dev.sh                    # macOS/Linux
# O
.\setup-dev.bat                   # Windows

# Desarrollo local
firebase emulators:start --only functions

# Testing
npm test

# Compilación
npm run build

# Deploy
firebase deploy --only functions --project fotos-44002

# Logs en tiempo real
firebase functions:log --follow

# Linting
npm run lint
```

---

## 🔐 Checklist de Seguridad Inmediato

- [ ] ✅ Verificar que el archivo `fotos-44002-firebase-adminsdk-*.json` NO está en el repo
- [ ] ✅ Revocar clave privada antigua en Google Cloud Console
- [ ] ⏳ Configurar secretos en Cloud Secret Manager
- [ ] ⏳ Validar CORS en firebase.json
- [ ] ⏳ Revisar database.rules.json
- [ ] ⏳ Configurar alerts en Firebase Console

---

## 📊 Comparativa: Versiones Key

| Componente | Versión | Notas |
|-----------|---------|-------|
| Node.js | 20 | Required para Functions v2 |
| firebase-functions | 6.6.0+ | Cloud Functions runtime |
| firebase-admin | 14.5.0+ | Backend + DB |
| Express | 5.2.1+ | HTTP routing |
| TypeScript | 5.9.2+ | Type safety |
| Mercado Pago SDK | 2.5.0+ | Payment provider |

---

## 🆘 Troubleshooting Rápido

| Problema | Solución |
|----------|----------|
| "PERMISSION_DENIED" al desplegar | Verificar IAM en Google Cloud |
| "Database ref permission denied" | Revisar database.rules.json |
| "Missing env variable" | Crear .env con .env.example |
| "Cannot find module" | npm ci en functions/ |
| "TypeScript errors" | npm run build para ver errores |

---

## 📞 Contacto & Referencia

| Pregunta | Dónde buscar |
|----------|--------------|
| "¿Cómo hago setup?" | functions/README.md → Inicio rápido |
| "¿Cuál es el plan?" | QUICK_START.md → Timeline |
| "¿Cómo funciona?" | ARCHITECTURE.md → Diagramas |
| "¿Qué hay que hacer?" | PRODUCTION_GUIDE.md → Checklist |
| "¿Código de ejemplo?" | functions/src/index.ts |
| "¿Secretos en prod?" | Cloud Secret Manager (gcloud CLI) |

---

## 🎓 Recursos Externos

- 📖 [Firebase Cloud Functions docs](https://firebase.google.com/docs/functions)
- 🔧 [Firebase CLI reference](https://firebase.google.com/docs/cli)
- 🛡️ [Security best practices](https://firebase.google.com/docs/functions/security)
- 📊 [Cloud Functions pricing](https://firebase.google.com/pricing#functions)
- 🚀 [Express.js guide](https://expressjs.com/)

---

**Estado:** 🟡 Pre-producción  
**Última actualización:** 2026-11-18  
**Por:** Copilot SDK  
**Para:** Migración de Event Planner Pro a Firebase Functions v2
