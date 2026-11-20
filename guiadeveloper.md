# Guía para desarrolladores

La guía vigente de configuración, arquitectura y despliegue se consolidó en:

- [guia.md](./guia.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [functions/README.md](./functions/README.md)

## Flujo de trabajo

```powershell
npm ci
npm --prefix functions ci
npm run build
npm --prefix functions run build
```

El backend de producción está en `functions/src/`, ejecutado en Node.js 24.
`backend-agenda/` se conserva como referencia histórica y no recibe tráfico.

Los cambios de catálogo/precios deben mantenerse consistentes entre frontend y
Functions. Para desplegar use:

```powershell
firebase deploy --only functions,hosting --project fotos-44002
```

Consulte `guia.md` antes de modificar secretos, webhook, B2 o reglas.
