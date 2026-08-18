# Dashboard v1 — Quickstart / Scenarios

Setup: local API on `http://localhost:3000`, JWT via `POST /api/v1/auth/login`. Replace `{TOKEN}` as needed.

## D1 — Dashboard Summary (KPIs)

```bash
curl -s "http://localhost:3000/api/v1/dashboard/summary" \
  -H "Authorization: Bearer $TOKEN"
# {
#   "data": {
#     "customers": { "total": 128, "newThisMonth": 9 },
#     "purchases": { "total": 342, "thisMonth": 41 },
#     "automations": { "scheduled": 27 },
#     "messages": { "sent": 96, "pending": 4 },
#     "conversations": { "open": 6 },
#     "campaigns": { "active": 2 }
#   }
# }
```

KPIs calculados on-the-fly sobre las tablas de la org (sin estado denormalizado, HG-1).

## D2 — Campaigns Panel

```bash
curl -s "http://localhost:3000/api/v1/dashboard/campaigns" \
  -H "Authorization: Bearer $TOKEN"
# {
#   "data": {
#     "recent": [
#       { "uuid": "c-1", "name": "Recompra verano", "type": "MANUAL",
#         "status": "ACTIVE", "startAt": "2026-09-01T10:00:00.000Z", "createdAt": "..." }
#     ],
#     "upcoming": [ ... ]  // ACTIVE con startAt futura, asc
#   }
# }
```

`recent`: últimas 10 campañas (createdAt desc). `upcoming`: campañas ACTIVE programadas a futuro (startAt asc).

## D3 — Activity Feed

```bash
curl -s "http://localhost:3000/api/v1/dashboard/activity" \
  -H "Authorization: Bearer $TOKEN"
# {
#   "data": [
#     { "uuid": "a-1", "module": "campaigns", "action": "campaign.activate",
#       "description": "Campaña Recompra verano activada", "metadata": { "campaignId": "c-1" },
#       "userId": "u-1", "userName": "Ana Pérez", "createdAt": "..." }
#   ]
# }
```

Últimos 20 registros de auditoría de la org (solo lectura; la escritura de auditoría la hacen los módulos de origen).

## D4 — Isolation (multi-tenant)

Dos tokens de organizaciones distintas → cada respuesta solo contiene datos de su propia org; cross-tenant → 404/0, nunca datos ajenos.

## D5 — Auth

Sin token → 401. Cualquier rol de org autenticado (ADMINISTRADOR/GERENTE/OPERADOR) → 200.