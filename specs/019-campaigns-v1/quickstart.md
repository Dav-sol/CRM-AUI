# Campaigns v1 — Quickstart / Scenarios

Setup: local API on `http://localhost:3000`, JWT via `POST /api/v1/auth/login`. Replace `{TOKEN}` as needed.

## C1 — Create Campaign (Flujo 08 steps 1-7)

```bash
curl -s "http://localhost:3000/api/v1/campaigns" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Recompra de clientes inactivos",
    "description": "Campaña para reactivar clientes que no compran hace más de 90 días",
    "type": "MANUAL",
    "template": "Hola {customerName}, le ofrecemos un 15% de descuento en nuestro producto {productName}. ¡Volvamos a conectar!",
    "segment": {
      "city": "Madrid",
      "customerStatus": "INACTIVE"
    }
  }'
```

Campaign creada como `DRAFT`.

## C2 — Update Draft (PATCH, only while DRAFT)

```bash
curl -s -X PATCH "http://localhost:3000/api/v1/campaigns/{uuid}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Recompra de clientes inactivos v2"
  }'
```

Solo permitido mientras status = DRAFT.

## C3 — Segment Preview (dry-run)

```bash
curl -s "http://localhost:3000/api/v1/campaigns/{uuid}/preview-segment" \
  -H "Authorization: Bearer $TOKEN"
# { "data": { "count": 247 } }
```

Devuelve el nº de clientes cualificados sin crear automaciones.

## C4 — Activate Campaign (Flujo 08 step 7)

```bash
curl -s -X POST "http://localhost:3000/api/v1/campaigns/{uuid}/activate" \
  -H "Authorization: Bearer $TOKEN"
# { "data": { "uuid": "...", "status": "ACTIVE", "automationCount": 247, "startedAt": "2026-09-01T10:00:00.000Z" } }
```

Genera 247 SCHEDULED automations (una por cliente cualificado); campaign pasa a ACTIVE. Si startAt futuro, el tiempo restante hasta startAt se cuenta.

## C5 — Pause Campaign

```bash
curl -s -X POST "http://localhost:3000/api/v1/campaigns/{uuid}/pause" \
  -H "Authorization: Bearer $TOKEN"
# { "data": { "uuid": "...", "status": "PAUSED" } }
```

Automations creadas se mantienen SCHEDULED pero el scheduler no las ejecuta mientras la campaña esté PAUSED.

## C6 — Resume Campaign

```bash
curl -s -X POST "http://localhost:3000/api/v1/campaigns/{uuid}/resume" \
  -H "Authorization: Bearer $TOKEN"
# { "data": { "uuid": "...", "status": "ACTIVE" } }
```

Reanuda la campaña; automations reanudan envío.

## C7 — Cancel Campaign

```bash
curl -s -X POST "http://localhost:3000/api/v1/campaigns/{uuid}/cancel" \
  -H "Authorization: Bearer $TOKEN"
# { "data": { "uuid": "...", "status": "CANCELLED" } }
```

Campaña terminal; automations pendientes → CANCELLED.

## C8 — Detail with Stats

```bash
curl -s "http://localhost:3000/api/v1/campaigns/{uuid}" \
  -H "Authorization: Bearer $TOKEN"
# { "data": {
#   "uuid": "...", "name": "...", "status": "ACTIVE",
#   "type": "MANUAL", "template": "...", "startAt": "...",
#   "segment": { "city": "Madrid", "customerStatus": "INACTIVE" },
#   "automationCount": 247, "executedCount": 153,
#   "createdAt": "...", "updatedAt": "..."
# } }
```

## C9 — Lifecycle Summary

1. Create → DRAFT
2. (Optional) Update → DRAFT (only)
3. Activate → ACTIVE + automations SCHEDULED
4. Pause → PAUSED (automations pending, scheduler skips)
5. Resume → ACTIVE (automations continue)
6. Cancel → CANCELLED (automations → CANCELLED)
7. Auto-finish → FINISHED (when all SCHEDULED executed)