# Quickstart — Customers v1 Validation Guide

Phase 1 output for `specs/012-customers-v1`. Runnable validation scenarios proving Customers v1 works end-to-end. Implementation details live in `tasks.md`; this file is the validation/run guide.

## Prerequisites

- PostgreSQL running, `DATABASE_URL` set, Identity v1 migration applied (`prisma migrate status` up to date)
- Customers migration applied: `npx prisma migrate dev` in `apps/api`
- API running: `pnpm --filter api start:dev` (or `npm run start:dev` in `apps/api`)
- Seeded baseline (same as identity e2e): one organization, ADMINISTRADOR/GERENTE/OPERADOR users, one PLATFORM_OWNER

## Setup

```bash
# 1. Apply customers schema (approved HG-5; review SQL)
cd apps/api
npx prisma migrate dev --name add_customer_audit_fields

# 2. Seed baseline (test tooling or manual):
#    - org1 with users admin@org1.test / gerente@org1.test / operador@org1.test (ValidPass123)
#    - org2 with admin2@org2.test
#    - owner@platform.test (PLATFORM_OWNER)
# 3. Verify API starts
npm run start:dev
```

## Validation Scenarios

### S1. Create customer (ADMINISTRADOR)
```bash
TOKEN=$(curl -s -X POST /api/v1/auth/login -d '{"email":"admin@org1.test","password":"ValidPass123"}' | jq -r .data.accessToken)
curl -s -X POST /api/v1/customers -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"codcli":"C-0001","name":"Juan Pérez","phone":"0991234567","email":"juan@example.com","city":"Quito"}'
```
**Expected**: `201`; `data.status=ACTIVE`, `data.createdBy` set; Audit row `customer.create.success` with `module=customers`.

### S2. Duplicate codcli
```bash
curl -s -X POST /api/v1/customers -H "Authorization: Bearer $TOKEN" -d '{"codcli":"C-0001","name":"Otro"}'
```
**Expected**: `409` `CONFLICT` "A customer with this codcli already exists"; audit `customer.create.failure`.

### S3. List + pagination
```bash
curl -s "/api/v1/customers?page=1&limit=20" -H "Authorization: Bearer $TOKEN"
```
**Expected**: `200`; `meta={page:1, limit:20, total, pages}`; only org1 customers.

### S4. Search / filters / sort
```bash
curl -s "/api/v1/customers?search=juan&status=ACTIVE&city=Quito&sort=-createdAt" -H "Authorization: Bearer $TOKEN"
```
**Expected**: `200`; only matching org1 customers; newest first.

### S5. Get by id
```bash
curl -s /api/v1/customers/<id> -H "Authorization: Bearer $TOKEN"
```
**Expected**: `200` full customer. Unknown/cross-tenant/soft-deleted id → `404 CUSTOMER_NOT_FOUND`.

### S6. Update contact fields
```bash
curl -s -X PATCH /api/v1/customers/<id> -H "Authorization: Bearer $TOKEN" -d '{"phone":"0990000000"}'
```
**Expected**: `200`; `phone` updated, `updatedBy` set, audit `customer.update.success`.

### S7. codcli immutable
```bash
curl -s -X PATCH /api/v1/customers/<id> -H "Authorization: Bearer $TOKEN" -d '{"codcli":"C-9999"}'
```
**Expected**: `400` (whitelist rejection; codcli not accepted on update).

### S8. OPERADOR read-only
```bash
OPERADOR_TOKEN=$(curl -s -X POST /api/v1/auth/login -d '{"email":"operador@org1.test","password":"ValidPass123"}' | jq -r .data.accessToken)
curl -s /api/v1/customers -H "Authorization: Bearer $OPERADOR_TOKEN"   # 200
curl -s -X POST /api/v1/customers -H "Authorization: Bearer $OPERADOR_TOKEN" -d '{"codcli":"X","name":"X"}'   # 403
curl -s -X PATCH /api/v1/customers/<id> -H "Authorization: Bearer $OPERADOR_TOKEN" -d '{"name":"X"}'            # 403
curl -s -X DELETE /api/v1/customers/<id> -H "Authorization: Bearer $OPERADOR_TOKEN"                            # 403
```

### S9. Tenant isolation
```bash
ADMIN2_TOKEN=$(curl -s -X POST /api/v1/auth/login -d '{"email":"admin2@org2.test","password":"ValidPass123"}' | jq -r .data.accessToken)
curl -s /api/v1/customers/<org1-customer-id> -H "Authorization: Bearer $ADMIN2_TOKEN"
```
**Expected**: `404 CUSTOMER_NOT_FOUND` (no data leak, HG-3). List for org2 shows no org1 customers.

### S10. Soft delete
```bash
curl -s -X DELETE /api/v1/customers/<id> -H "Authorization: Bearer $TOKEN"
```
**Expected**: `200 {data:{success:true}}`; subsequent GET/list → 404/excluded; audit `customer.delete.success`; second DELETE → 404.

### S11. PLATFORM_OWNER cross-org
```bash
OWNER_TOKEN=$(curl -s -X POST /api/v1/auth/login -d '{"email":"owner@platform.test","password":"ValidPass123"}' | jq -r .data.accessToken)
curl -s /api/v1/customers -H "Authorization: Bearer $OWNER_TOKEN"                       # 200: customers of ALL orgs
curl -s -X POST /api/v1/customers -H "Authorization: Bearer $OWNER_TOKEN" -d '{"codcli":"C-P1","name":"Platform","organizationId":"<org1-id>"}'   # 201 in org1
curl -s -X POST /api/v1/customers -H "Authorization: Bearer $OWNER_TOKEN" -d '{"codcli":"C-P2","name":"Bad"}'                                        # 400 (missing org)
curl -s -X POST /api/v1/customers -H "Authorization: Bearer $OWNER_TOKEN" -d '{"codcli":"C-P3","name":"Bad","organizationId":"<unknown>"}'           # 400 (unknown org)
```

### S12. Audit trail
```sql
SELECT action, "userId", "organizationId", "module" FROM "Audit" WHERE "module" = 'customers' ORDER BY "createdAt" DESC;
```
**Expected**: rows for every create/update/delete with correct actor/org; no sensitive metadata.

## Quality gates

```bash
cd apps/api
npm run lint
npm run build
npm run test          # unit: *.spec.ts
npm run test:e2e      # e2e: test/jest-e2e.json
npm run test:cov      # target >80% coverage (Constitution X)
```

## Expected completion signals

- All S1-S12 scenarios pass
- Unit + integration coverage >80% for the customers module
- No changes outside Customers scope (plus the approved additive audit parameter)