# Contrato de API

La API recibe una solicitud `POST` JSON en la URL de Apps Script. Todas las respuestas tienen la forma:

```json
{ "ok": true, "data": {} }
```

Los errores regresan `{ "ok": false, "error": "mensaje" }`.

| Acción | Autenticación | Datos |
|---|---|---|
| `search` | No | `query`: folio o correo |
| `login` | No | `password` |
| `dashboard` | Token | — |
| `saveTrip` | Token | Cliente y datos de viaje |
| `registerPayment` | Token | folio, fecha, monto, método y nota |

El token se recibe como propiedad raíz `token` y dura ocho horas. Las operaciones de escritura usan un bloqueo de Apps Script para impedir inconsistencias si se registran pagos al mismo tiempo.
