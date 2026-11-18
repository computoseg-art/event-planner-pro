# 🌐 GUÍA: Agregar Variables de Entorno en Firebase Console

## ✅ Checklist Pre-Inicio

Antes de empezar, verifica que tengas:

- [ ] Acceso a Gmail/Google (con permisos en fotos-44002)
- [ ] Todos los valores de las claves privadas
- [ ] Esta guía a mano
- [ ] 10-15 minutos de tiempo

---

## 🚀 PASO 1: Abre Firebase Console

**URL:** `https://console.firebase.google.com`

Abre esta URL en tu navegador y espera a que cargue.

**Si no estás logged in:**
1. Haz click en "Sign in"
2. Usa tu cuenta Google
3. Autoriza la aplicación

---

## 2️⃣ PASO 2: Selecciona Proyecto fotos-44002

En la esquina superior izquierda verás:

```
┌────────────────────────────┐
│ Google Firebase    [▼]     │
└────────────────────────────┘
```

**Haz click en el dropdown (▼)** y busca `fotos-44002`

Selecciona ese proyecto.

---

## 3️⃣ PASO 3: Ve a Build → Functions

En el menú izquierdo:

```
Build  ← Click aquí
  └─ Functions  ← Luego click aquí
```

Deberías ver una página con "Cloud Functions" como título.

---

## 4️⃣ PASO 4: Haz Click en tu Función

Verás una tabla/lista de funciones:

```
┌──────────────────────────────────┐
│ Name  │ Region      │ Trigger    │
├──────────────────────────────────┤
│ api   │ us-central1 │ HTTPS      │
└──────────────────────────────────┘
```

**Haz click en la fila de `api`** (cualquier parte de la fila).

---

## 5️⃣ PASO 5: Haz Click en Botón "EDIT"

Una vez abierta la función, verás en la **esquina superior derecha**:

```
┌──────────┐
│  EDIT    │  ← Click aquí
└──────────┘
```

Haz click en el botón EDIT.

---

## 6️⃣ PASO 6: Busca "Runtime environment variables"

La página se abrirá en modo edición. Desplázate hacia abajo hasta encontrar:

```
🔧 Runtime environment variables
```

Verás algo como:

```
Name              Value                      
─────────────────────────────────────────────
                                     + Add variable
```

---

## 7️⃣ PASO 7: Agrega Cada Variable

Para cada clave de la lista abajo, haz lo siguiente:

### PRIMERA VARIABLE (MP_ACCESS_TOKEN)

1. Haz click en **"+ Add variable"**
2. En el campo **Name**, escribe: `MP_ACCESS_TOKEN`
3. En el campo **Value**, pega tu token de Mercado Pago
4. Haz click en el ✓ (checkmark) para confirmar
5. Verás que se agrega a la lista

**Repite estos 5 pasos para cada variable en la lista de abajo.**

---

## 📋 LISTA COMPLETA DE VARIABLES

Copia y pega cada una:

### 🔴 VARIABLES CON TUYOS VALORES

| # | Name | Value | Notas |
|---|------|-------|-------|
| 1 | `MP_ACCESS_TOKEN` | `[TU TOKEN MP]` | ej: APP_USR-1234... |
| 2 | `MP_WEBHOOK_SECRET` | `[TU SECRETO MP]` | ej: tu-secreto-123... |
| 3 | `BREVO_API_KEY` | `[TU BREVO KEY]` | ej: xkeysib-1234... |
| 4 | `EMAIL_FROM` | `[TU EMAIL]` | ej: contacto@tudominio.com |
| 5 | `B2_KEY_ID` | `[TU B2 ID]` | ej: 00123abc... |
| 6 | `B2_APPLICATION_KEY` | `[TU B2 KEY]` | ej: 1234567890abc... |

### 🟢 VARIABLES QUE PUEDES COPIAR TAL CUAL

| # | Name | Value |
|---|------|-------|
| 7 | `EMAIL_TO` | `esteban.garriga@gmail.com` |
| 8 | `B2_BUCKET_NAME` | `bsfotografia-galerias-uy-2026` |
| 9 | `B2_ENDPOINT` | `https://s3.us-east-005.backblazeb2.com` |
| 10 | `B2_REGION` | `us-east-005` |
| 11 | `CLIENT_URL` | `https://fotos-44002.web.app` |
| 12 | `BACKEND_PUBLIC_URL` | `https://fotos-44002.firebaseapp.com/api` |
| 13 | `ADMIN_EMAILS` | `estebangarriga@gmail.com` |
| 14 | `FIREBASE_DATABASE_URL` | `https://fotos-44002-default-rtdb.firebaseio.com` |

---

## ✅ PASO 8: Verifica que Todas Estén Agregadas

Después de agregar todas las variables, deberías ver una lista como:

```
Name                      Value
─────────────────────────────────────────────
MP_ACCESS_TOKEN           APP_USR-...
MP_WEBHOOK_SECRET         tu-secreto-...
BREVO_API_KEY             xkeysib-...
EMAIL_FROM                contacto@...
EMAIL_TO                  esteban.garriga@...
B2_KEY_ID                 00123abc...
B2_APPLICATION_KEY        1234567890abc...
B2_BUCKET_NAME            bsfotografia-...
B2_ENDPOINT               https://s3...
B2_REGION                 us-east-005
CLIENT_URL                https://fotos-44002...
BACKEND_PUBLIC_URL        https://fotos-44002...
ADMIN_EMAILS              estebangarriga@...
FIREBASE_DATABASE_URL     https://fotos-44002...
```

**Cuenta: Deberían ser 14 variables en total.**

---

## 🚀 PASO 9: Haz DEPLOY

Desplázate hasta el **FONDO DE LA PÁGINA**.

Verás dos botones:

```
┌──────────────────────────┐
│  CANCEL        DEPLOY    │
└──────────────────────────┘
```

**Haz click en DEPLOY.**

---

## ⏳ PASO 10: Espera a que Termine

Verás un spinner/loading:

```
⏳ Deploying...
```

Espera a que termine. Puede tomar 1-3 minutos.

Una vez termine, verás:

```
✅ Function updated successfully
```

---

## ✨ ¡LISTO!

Una vez que ves el mensaje de éxito, tu función Cloud Functions está configurada con todas las variables de entorno necesarias para producción.

---

## 🧪 Verificar que Funcionó

**Opción 1: En Firebase Console**

1. Vuelve a la página de la función (anterior a Edit)
2. Desplázate hasta "Runtime settings"
3. Verifica que todas las variables están listadas ✅

**Opción 2: Testeando la función**

1. En la página de la función, busca la tab "Testing"
2. Haz click en "Call function"
3. Deberías ver una respuesta sin errores ✅

---

## 🆘 ¿Qué Pasa Si Algo Sale Mal?

### Error: "Variable invalida"
- Verifica que el Name sea exactamente como está en la lista
- Verifica que el Value no tenga espacios extras

### Error: "Deployment failed"
- Espera unos segundos y vuelve a hacer click Deploy
- Revisa la consola del navegador (F12) para ver errores

### No veo los cambios después de Deploy
- Refresca la página (F5)
- Cierra la pestaña y abre de nuevo

### Una variable está incorrecta
- Haz click en Edit nuevamente
- Busca esa variable
- Haz click en el ✏️ (pencil) para editarla
- Corrige el valor
- Haz click Deploy nuevamente

---

## 📋 Checklist Final

Después de Deploy exitoso:

- [ ] Vi el mensaje "Function updated successfully"
- [ ] Volví a verificar que las 14 variables están presentes
- [ ] Las variables tienen los valores correctos
- [ ] La fecha de "Last updated" es reciente (hace poco)

---

## 🎯 Próximo Paso

Después de esto, tu función está lista para:

1. **Recibir tráfico en producción** desde Firebase Hosting
2. **Acceder a todas las integraciones**:
   - Mercado Pago (pagos)
   - Brevo (emails)
   - Backblaze B2 (storage)
   - Firebase Realtime Database

Puedes ahora:
- Publicar el frontend
- Comenzar a recibir pagos
- Enviar emails de confirmación
- Subir fotos a la galería

---

## 💬 ¿Necesitas Ayuda?

Si algo no funciona:
1. Revisa los "Logs" de la función en Firebase Console
2. Busca mensajes de error
3. Verifica que los valores sean exactos

**¡Listo para producción! 🚀**
