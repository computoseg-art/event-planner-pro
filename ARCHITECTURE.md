# Arquitectura

## Componentes

```text
Usuario
  ↓
Firebase Hosting + Angular
  ├─ Firebase Authentication
  ├─ Realtime Database en lectura
  └─ /api/* → Function api
                    ├─ reservations
                    ├─ payments
                    ├─ contact
                    └─ gallery

Cloud Scheduler → reservationMaintenance
```

## Despliegues

| Función | Trigger | Responsabilidad |
|---|---|---|
| `api` | HTTPS | API Express autenticada y rutas públicas de contacto/webhook |
| `reservationMaintenance` | `every 15 minutes`, Uruguay | Vencimientos y recordatorios de saldo |

Ambas usan Node.js 24. TypeScript compila con `NodeNext`.

## Flujos

### Reservas

1. Angular envía los servicios seleccionados.
2. La Function vuelve a validar catálogo, categoría, fecha y descripción.
3. Calcula total y descuento en servidor.
4. Reserva atómicamente la fecha y guarda la reserva.
5. Envía el aviso por Brevo.

### Mercado Pago

1. Se crea una preferencia con intención persistida.
2. Mercado Pago redirige al usuario y envía webhook.
3. El backend verifica token, modo, firma, importe y usuario.
4. Aplica el pago una vez mediante `pagosMercadoPago/<paymentId>`.
5. Actualiza saldo, historial y correos.

### Efectivo

1. El administrador registra el comprobante.
2. El pago queda `pendiente_confirmacion`.
3. El cliente confirma o informa una diferencia.
4. Solo al confirmar se acredita `pagado`.
5. El administrador resuelve los pagos en revisión.

### Galería

1. Admin crea sesión para un cliente registrado.
2. Backblaze B2 recibe una carga multipart mediante URL firmada.
3. Firebase guarda metadatos, no los archivos.
4. El cliente consulta URLs temporales de visualización/descarga.
5. Favoritos y ocultos se guardan en Realtime Database por cuenta.

## Datos principales

```text
reservas/<usuario>/<reserva>
fechas_ocupadas/<reserva>
historial_pagos/<usuario>/<paymentId>
pagos_pendientes/<externalReference>
notificaciones_reservas/<usuario>/<reserva>
notificaciones_pagos/<paymentId>/<tipo>
recordatorios_senia/<usuario>/<reserva>
b2_galerias/<uid>/<session>/media/<mediaId>
b2_pending_uploads/<uploadToken>
b2_storage_usage
gallery_b2_preferences/<uid>/<session>/<mediaId>
```

## Seguridad

- Firebase ID token obligatorio en rutas de reservas, pagos privados y galería.
- Middleware administrativo para efectivo y administración de B2.
- Catálogo y precios validados de nuevo en servidor.
- Firmas de webhook de Mercado Pago.
- Secretos solo en Secret Manager.
- Contacto con límite de cinco mensajes cada 15 minutos.
- B2 privado; las URLs firmadas son temporales.

## Entornos

- Desarrollo: `environment.ts` y emuladores opcionales.
- Producción: `environment.prod.ts`, Hosting y Functions.
- `backend-agenda/` es referencia histórica y no recibe tráfico de producción.
