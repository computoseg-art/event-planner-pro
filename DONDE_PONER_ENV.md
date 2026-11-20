# Variables y secretos

Consulte [guia.md](./guia.md).

- Secretos: Firebase Secret Manager mediante
  `firebase functions:secrets:set <NOMBRE>`.
- Variables no secretas: `functions/.env.fotos-44002` o la configuración del
  despliegue Firebase.
- Frontend: `src/environments/*.ts`, únicamente valores públicos.
- Nunca versionar `.env` reales, claves de servicio ni tokens.

Render no es un destino de configuración ni despliegue de esta aplicación.
