# Configuración en Firebase Console

La secuencia completa y vigente está en [guia.md](./guia.md).

Revisar en `fotos-44002`:

1. Authentication y dominios autorizados.
2. Realtime Database y reglas.
3. Secret Manager.
4. Functions `api` y `reservationMaintenance`.
5. Hosting y rewrite `/api/**`.
6. Logs y errores.

Los secretos se crean preferentemente desde Firebase CLI:

```powershell
firebase functions:secrets:set MP_ACCESS_TOKEN
firebase functions:secrets:set MP_WEBHOOK_SECRET
firebase functions:secrets:set BREVO_API_KEY
firebase functions:secrets:set B2_KEY_ID
firebase functions:secrets:set B2_APPLICATION_KEY
```
