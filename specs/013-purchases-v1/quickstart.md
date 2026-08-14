# Quickstart — Purchases v1 Validation Guide

Phase 1 output for `specs/013-purchases-v1`. Runnable validation scenarios proving Purchases v1 works end-to-end. Implementation details live in `tasks.md`; this file is the validation/run guide.

## Prerequisites

- PostgreSQL running, `DATABASE_URL` set, Identity v1 + Customers v1 migrations applied (`prisma migrate status` up to date)
- Purchases migration applied: `npx prisma migrate dev` in `apps/api`
- API running: `npm run start:dev` in `apps/api`
- Seeded baseline (same as customers e2e): org1 with ADMINISTRADOR/GERENTE/OPERADOR users, org2 with ADMINISTRADOR, one PLATFORM_OWNER, plus one customer and one product per org (products seeded directly — no Products module)

## Setup

```bash
# 1. Apply purchases schema (approved HG-5; review SQL)
cd apps/api
npx prisma migrate dev --create-only --name add_purchase_audit_fields   # review SQL
npx prisma migrate dev                                                  # apply
# 2. Seed baseline:
#    - org1: customers C-0001 (Juan Pérez), C-0002; product P-100 (Batería X)
#    - org2: customer C-0001; product P-100
# 3. Verify API starts
npm run start:dev
```

## Validation Scenarios

### S1. Create purchase (ADMINISTRADOR)
```bash
TOKEN=$(curl -s -X POST /api/v1/auth/login -d '{"email":"admin@org1.test","password":"ValidPass123"}' | jq -r .data.accessToken)
curl -s -X POST /api/v1/purchases -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"customerId":"<c1>","productId":"<p1>","invoiceNumber":"INV-0001","purchaseDate":"2026-07-22T14:35:18Z","quantity":2,"value":"450.00"}'
```
**Expected**: `201`; `data.status=COMPLETED`, `data.value="450.00"` (string), `data.createdBy` set; Audit row `purchase.create.success` with `module=purchases`.

### S2. Duplicate tuple (CP-005)
```bash
curl -s -X POST /api/v1/purchases -H "Authorization: Bearer $TOKEN" -d '{"customerId":"<c1>","productId":"<p1>","invoiceNumber":"INV-0001","purchaseDate":"2026-07-22T14:35:18Z","quantity":1,"value":"10.00"}'
```
**Expected**: `409` `CONFLICT`; audit `purchase.create.failure`. (Same invoice+customer+product+date → duplicate, regardless of quantity/value.)

### S3. List + pagination
```bash
curl -s "/api/v1/purchases?page=1&limit=20" -H "Authorization: Bearer $TOKEN"
```
**Expected**: `200`; `meta={page:1, limit:20, total, pages}`; only org1 purchases; inline `customer`/`product` summaries.

### S4. Search / filters / sort
```bash
curl -s "/api/v1/purchases?search=INV-000&status=COMPLETED&sort=-purchaseDate" -H "Authorization: Bearer $TOKEN"
```
**Expected**: `200`; only matching org1 purchases; newest purchaseDate first.

### S5. Get by id
```bash
curl -s /api/v1/purchases/<id> -H "Authorization: Bearer $TOKEN"
```
**Expected**: `200` full purchase with customer/product. Unknown/cross-tenant id → `404 PURCHASE_NOT_FOUND`.

### S6. Update fields + status
```bash
curl -s -X PATCH /api/v1/purchases/<id> -H "Authorization: Bearer $TOKEN" -d '{"quantity":3,"status":"CANCELLED"}'
```
**Expected**: `200`; `quantity=3`, `status=CANCELLED`, `updatedBy` set, audit `purchase.update.success`.

### S7. invoiceNumber immutable
```bash
curl -s -X PATCH /api/v1/purchases/<id> -H "Authorization: Bearer $TOKEN" -d '{"invoiceNumber":"INV-9999"}'
```
**Expected**: `400` (immutable; whitelist/constraint rejection).

### S8. OPERADOR read-only
```bash
OPERADOR_TOKEN=$(curl -s -X POST /api/v1/auth/login -d '{"email":"operador@org1.test","password":"ValidPass123"}' | jq -r .data.accessToken)
curl -s /api/v1/purchases -H "Authorization: Bearer $OPERADOR_TOKEN"   # 200
curl -s -X POST /api/v1/purchases -H "Authorization: Bearer $OPERADOR_TOKEN" -d '{"customerId":"<c1>","productId":"<p1>","invoiceNumber":"X","purchaseDate":"2026-07-22T14:35:18Z","quantity":1,"value":"1.00"}'  # 403
curl -s -X PATCH /api/v1/purchases/<id> -H "Authorization: Bearer $OPERADOR_TOKEN" -d '{"status":"REFUNDED"}'   # 403
```

### S9. Tenant isolation
```bash
ADMIN2_TOKEN=$(curl -s -X POST /api/v1/auth/login -d '{"email":"admin2@org2.test","password":"ValidPass123"}' | jq -r .data.accessToken)
curl -s /api/v1/purchases/<org1-purchase-id> -H "Authorization: Bearer $ADMIN2_TOKEN"
curl -s -X POST /api/v1/purchases -H "Authorization: Bearer $ADMIN2_TOKEN" -d '{"customerId":"<org1-customer>","productId":"<org1-product>","invoiceNumber":"Y","purchaseDate":"2026-07-22T14:35:18Z","quantity":1,"value":"1.00"}'
```
**Expected**: `404 PURCHASE_NOT_FOUND` (no data leak); POST with org1 customer/product → `400 VALIDATION_ERROR`.

### S10. No DELETE route
```bash
curl -s -X DELETE /api/v1/purchases/<id> -H "Authorization: Bearer $TOKEN"
```
**Expected**: `404` (route does not exist — CP-004/HG-4). No deletion semantics anywhere.

### S11. PLATFORM_OWNER cross-org
```bash
OWNER_TOKEN=$(curl -s -X POST /api/v1/auth/login -d '{"email":"owner@platform.test","password":"ValidPass123"}' | jq -r .data.accessToken)
curl -s /api/v1/purchases -H "Authorization: Bearer $OWNER_TOKEN"                  # 200: purchases of ALL orgs
curl -s -X POST /api/v1/purchases -H "Authorization: Bearer $OWNER_TOKEN" -d '{"customerId":"<org2-c>","productId":"<org2-p>","invoiceNumber":"INV-P1","purchaseDate":"2026-07-22T14:35:18Z","quantity":1,"value":"1.00","organizationId":"<org2-id>"}'   # 201 in org2
curl -s -X POST /api/v1/purchases -H "Authorization: Bearer $OWNER_TOKEN" -d '{"customerId":"<org2-c>","productId":"<org2-p>","invoiceNumber":"INV-P2","purchaseDate":"2026-07-22T14:35:18Z","quantity":1,"value":"1.00"}'          # 400 (missing org)
curl -s -X POST /api/v1/purchases -H "Authorization: Bearer $OWNER_TOKEN" -d '{"customerId":"<org2-c>","productId":"<org2-p>","invoiceNumber":"INV-P3","purchaseDate":"2026-07-22T14:35:18Z","quantity":1,"value":"1.00","organizationId":"<unknown>"}'    # 400 (unknown org)
```

### S12. Audit trail
```sql
SELECT action, "userId", "organizationId", "module" FROM "Audit" WHERE "module" = 'purchases' ORDER BY "createdAt" DESC;
```
**Expected**: rows for every create/update with correct actor/org; no sensitive metadata.

## Quality gates

```bash
cd apps/api
npm run lint
npm run build
npm run test          # unit: *.spec.ts
npm run test:e2e      # e2e: test/jest-e2e.json
# combined coverage (unit + e2e):
./node_modules/.bin/jest --config ./test/jest-combined.json --runInBand --silent --coverage
# target >80% coverage for modules/purchases (Constitution X)
```

## Expected completion signals

- All S1-S12 scenarios pass
- Unit + integration coverage >80% for the purchases module
- No DELETE endpoint; no changes outside Purchases scope (only `app.module.ts` registration)