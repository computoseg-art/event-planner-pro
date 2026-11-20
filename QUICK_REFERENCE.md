# 🚀 Referencia Rápida: Configurar Producción

## 1️⃣ Abre Firebase Console
```
https://console.firebase.google.com
```

## 2️⃣ Proyecto: fotos-44002

Selecciona en el dropdown

## 3️⃣ Ve a Build → Functions

Busca la función: **us-central1-api**

## 4️⃣ Click en Edit

Arriba a la derecha

## 5️⃣ Agrega Variables

En **Runtime environment variables**, agrega estas 14:

| # | Name | Value |
|---|------|-------|
| 1 | MP_ACCESS_TOKEN | [TU TOKEN MP] |
| 2 | MP_WEBHOOK_SECRET | [TU SECRETO MP] |
| 3 | BREVO_API_KEY | [TU BREVO API KEY] |
| 4 | EMAIL_FROM | [TU EMAIL VERIFICADO] |
| 5 | EMAIL_TO | esteban.garriga@gmail.com |
| 6 | B2_KEY_ID | [TU B2 KEY ID] |
| 7 | B2_APPLICATION_KEY | [TU B2 APP KEY] |
| 8 | B2_BUCKET_NAME | bsfotografia-galerias-uy-2026 |
| 9 | B2_ENDPOINT | https://s3.us-east-005.backblazeb2.com |
| 10 | B2_REGION | us-east-005 |
| 11 | CLIENT_URL | https://fotos-44002.web.app |
| 12 | BACKEND_PUBLIC_URL | https://fotos-44002.firebaseapp.com/api |
| 13 | ADMIN_EMAILS | estebangarriga@gmail.com |

## 6️⃣ Click DEPLOY

Espera a que termine (~3 min)

## ✅ ¡Listo!

Tu API está en producción.

---

**Documentación detallada:** `FIREBASE_CONSOLE_STEP_BY_STEP.md`
