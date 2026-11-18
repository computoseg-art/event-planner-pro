# 🌐 ¿DÓNDE PONGO LAS CLAVES .env EN PRODUCCIÓN?

## Respuesta Corta

**En Firebase Console (web)** → Proyecto → Cloud Functions → Edit Environment Variables

---

## 🎯 OPCIÓN RECOMENDADA: Firebase Console (Interfaz Gráfica)

### Paso 1: Abre Firebase Console
```
URL: https://console.firebase.google.com
```

### Paso 2: Selecciona tu Proyecto
```
Console → Dropdown (arriba izquierda) → Selecciona: fotos-44002
```

### Paso 3: Ve a Cloud Functions
```
Menú izquierdo:
  Build
    └─ Functions (click)
```

### Paso 4: Haz Click en tu Función
```
Funciones listadas:
  us-central1-api (esta es la tuya)
      ↓
      Click
```

### Paso 5: Haz Click en "Edit"
```
Arriba a la derecha verás un botón: "Edit"
      ↓
      Click
```

### Paso 6: Desplázate a "Runtime Settings"
```
En la página que se abre, desplázate hasta encontrar:

🔧 Runtime settings
  ├─ Memory
  ├─ Timeout
  ├─ Environment variables ← AQUÍ AGREGAS LAS CLAVES
```

### Paso 7: Agrega las Claves

En **Environment variables**, haz click en campo y agrega:

```
Key                      Value
─────────────────────────────────────────────────
MP_ACCESS_TOKEN          APP_USR-tutoken123456
MP_WEBHOOK_SECRET        tu-secreto-webhook-mp
BREVO_API_KEY            xkeysib-tukey123456789
EMAIL_FROM               contacto@tudominio.com
EMAIL_TO                 admin@tudominio.com
B2_KEY_ID                tu-b2-key-id
B2_APPLICATION_KEY       tu-b2-app-key
B2_BUCKET_NAME           bsfotografia-galerias-uy-2026
B2_ENDPOINT              https://s3.us-east-005.backblazeb2.com
B2_REGION                us-east-005
CLIENT_URL               https://fotos-44002.web.app
BACKEND_PUBLIC_URL       https://fotos-44002.firebaseapp.com/api
ADMIN_EMAILS             estebangarriga@gmail.com
FIREBASE_DATABASE_URL    https://fotos-44002-default-rtdb.firebaseio.com
```

**Para agregar cada variable:**
1. Click en "Add variable"
2. Rellena Key (ej: MP_ACCESS_TOKEN)
3. Rellena Value (ej: APP_USR-...)
4. Click en ✅ para confirmar
5. Repite para la siguiente

### Paso 8: Haz Click en "Deploy"
```
Abajo de la página verás:

┌──────────────────────────┐
│   Cancelar    Deploy     │
│                          │
│       Click Deploy ✓     │
└──────────────────────────┘
```

**Espera a que termine la actualización...**
```
⏳ Deploying...
✅ Done!
```

---

## 🔄 Alternativa 2: Google Cloud Secret Manager (Más Seguro)

Si prefieres separar los secretos:

### Paso 1: Abre Google Cloud Console
```
URL: https://console.cloud.google.com
```

### Paso 2: Selecciona Proyecto
```
Dropdown (arriba centro): fotos-44002
```

### Paso 3: Busca Secret Manager
```
Barra de búsqueda (arriba): "Secret Manager"
      ↓
      Click en resultado
```

### Paso 4: Crea Secretos
```
Click: "Create Secret"

Para cada clave:
  Name: mp-access-token
  Secret value: APP_USR-tutoken
  Click: Create
  
  Name: mp-webhook-secret
  Secret value: tu-secreto
  Click: Create
  
  (Repite para todas)
```

---

## ⚡ Alternativa 3: Línea de Comandos (Terminal)

Ejecuta en PowerShell:

```powershell
firebase functions:config:set `
  mercadopago.access_token="APP_USR-tutoken" `
  mercadopago.webhook_secret="tu-secreto" `
  brevo.api_key="xkeysib-tukey" `
  brevo.email_from="tu@email.com" `
  brevo.email_to="admin@email.com" `
  b2.key_id="tu-b2-id" `
  b2.app_key="tu-b2-key" `
  b2.bucket_name="bsfotografia-galerias-uy-2026" `
  b2.endpoint="https://s3.us-east-005.backblazeb2.com" `
  b2.region="us-east-005" `
  client.url="https://fotos-44002.web.app" `
  backend.url="https://fotos-44002.firebaseapp.com/api"
```

---

## 🎓 ¿Cuándo Usar Cada Opción?

| Opción | Cuándo | Ventajas | Desventajas |
|--------|--------|----------|------------|
| **Firebase Console (Opción 1)** | Siempre (es más fácil) | GUI simple, visual, intuitiva | Más lento si tienes muchas variables |
| **Secret Manager (Opción 2)** | Máxima seguridad | Mejor encriptación, separado de config | Más pasos, más complejo |
| **CLI (Opción 3)** | Automatización/CI-CD | Rápido, scripteable, reproducible | Necesitas terminal, menos visual |

---

## 🔒 Seguridad: ¿Dónde Están Almacenadas las Claves?

```
❌ NUNCA en .env local
❌ NUNCA en el código fuente
❌ NUNCA en repositorio Git

✅ SIEMPRE en Google Cloud (encriptado)
✅ Accesibles SOLO por Cloud Functions
✅ Logs encriptados
✅ Auditoría automática
```

---

## ✅ Verificar que Funcionó

Después de hacer Deploy, verifica en Firebase Console:

```
1. Ve a Cloud Functions → us-central1-api
2. Click en función
3. Desplázate a "Runtime settings"
4. Deberías ver todas tus variables listadas ✅
```

**Prueba la función:**
```
1. Vuelve a Cloud Functions
2. Click en "Testing" (tab)
3. Verás un formulario para probar
4. Click "Call function"
5. Deberías ver respuesta exitosa ✅
```

---

## 🚀 Próximo Paso: Deploy la Función

Una vez las variables están configuradas:

```bash
firebase deploy --only functions --project fotos-44002
```

---

## 📋 Resumen Rápido

| Paso | Dónde | Qué Haces |
|------|-------|----------|
| 1 | https://console.firebase.google.com | Abre Console |
| 2 | Proyecto fotos-44002 | Selecciona |
| 3 | Build → Functions | Busca funciones |
| 4 | us-central1-api | Haz click |
| 5 | Edit button | Edita |
| 6 | Runtime settings | Desplázate |
| 7 | Environment variables | Agrega claves |
| 8 | Deploy button | Deploya |
| ✅ | Done | ¡Listo! |

---

## 🆘 ¿Qué Pasa Si Me Equivoco?

**No hay problema:**

1. Ve a Cloud Functions → us-central1-api → Edit
2. Corrige la variable
3. Click Deploy nuevamente

Los cambios se aplican automáticamente.

---

## 📞 Soporte

Si algo no funciona:

1. **Ver Logs:**
   - Cloud Functions → us-central1-api → Logs (tab)
   - Busca errores

2. **Revisar Configuración:**
   - Cloud Functions → us-central1-api → Edit
   - Verifica que todas las variables estén presentes

3. **Reset (si falla todo):**
   - Elimina algunas variables
   - Redeploy
   - Agrega nuevamente una a una para identificar el problema

---

## 🎯 Checklist Final

- [ ] Abrí https://console.firebase.google.com
- [ ] Seleccioné proyecto fotos-44002
- [ ] Fui a Build → Functions
- [ ] Hice click en us-central1-api
- [ ] Hice click en Edit
- [ ] Desplacé a Runtime settings
- [ ] Agregué todas las variables en Environment variables
- [ ] Hice click en Deploy
- [ ] Esperé a que termine
- [ ] Verificué que las variables aparecen
- [ ] Testé la función

✅ **¡Listo para Producción!**
