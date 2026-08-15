# Automatizaciones v1 — Quickstart / Scenarios

Setup: local API on `http://localhost:3000`, JWT via `POST /api/v1/auth/login`. Replace `{TOKEN}` as needed. Automation creation is event-driven: import a purchase (Imports v1) to trigger it.

## S1 — Import a purchase triggers cycle + 3 automations (AU-001)

```bash
curl -s -X POST http://localhost:3000/api/v1/imports \
  -H "Authorization: Bearer $TOKEN" \
  -F "type=PURCHASES" -F "file=@compras.csv"
# wait for job COMPLETED → PurchaseImported consumed
curl -s http://localhost:3000/api/v1/commercial-cycles -H "Authorization: Bearer $TOKEN"
# { data: [ { status: "ACTIVE", automations: [...] } ], meta: { total: 1 } }
```

One ACTIVE cycle with 3 SCHEDULED automations (3 days / 6 months / 12 months from `purchaseDate`) (AS-001).

## S2 — List automations

```bash
curl -s "http://localhost:3000/api/v1/automations?status=SCHEDULED&page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"
# { data: [ { uuid, status: "SCHEDULED", scheduledDate, priority: 0 } ], meta: {...} }
```

Filter by `status`, `commercialCycleId`, `customerId`, `scheduledFrom`/`scheduledTo` (AS-005).

## S3 — Cycle detail with automations

```bash
curl -s http://localhost:3000/api/v1/commercial-cycles/{uuid} -H "Authorization: Bearer $TOKEN"
# { data: { status: "ACTIVE", startDate, automations: [ { status: "SCHEDULED", scheduledDate } ] } } (AS-004)
```

## S4 — Re-purchase cancels previous cycle (AU-003)

Import a second purchase for the SAME customer before the cycle ends → the previous cycle + its PENDING/SCHEDULED automations are CANCELLED, a new ACTIVE cycle is created (AS-003).

```bash
curl -s http://localhost:3000/api/v1/commercial-cycles -H "Authorization: Bearer $TOKEN"
# two cycles: former CANCELLED with endDate set; new ACTIVE
```

## S5 — Idempotent event replay

Re-importing the same purchase (duplicate file → 409, or a replayed event) never duplicates the cycle (AS-002): the consumer is idempotent on `purchaseId`.

## S6 — Cancel automation

```bash
curl -s -X POST http://localhost:3000/api/v1/automations/{uuid}/cancel -H "Authorization: Bearer $TOKEN"
# 200 { data: { uuid, status: "CANCELLED", success: true } } (AS-006)
# cancel an EXECUTED/CANCELLED automation → 400 (AS-007)
```

## S7 — Role enforcement

OPERADOR token: POST cancel → `403 FORBIDDEN`; GET list/detail → 200 (AS-009).

## S8 — Cross-tenant → 404

Request another organization's automation/cycle uuid → `404 AUTOMATION_NOT_FOUND` / `404 COMMERCIAL_CYCLE_NOT_FOUND` (AS-008).

## S9 — No manual create

There is NO POST to create cycles/automations — creation is event-driven only (FR-014, AS-010).

## Audit & events (verification)

- Audit rows: `automations` module with `automation.cycle.created/.cancelled`, `automation.created/.cancelled` outcomes (AS-011).
- Events: `CommercialCycleStarted` + `AutomationCreated` (×3) with traceability payload; `AutomationCancelled`/`CommercialCycleCancelled` on cancellation (AS-012).