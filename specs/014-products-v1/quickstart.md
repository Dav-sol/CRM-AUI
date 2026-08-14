# Quickstart — Products v1 Validation Guide

Phase 1 output for `specs/014-products-v1`. Runnable validation scenarios proving Products v1 works end-to-end. Implementation details live in `tasks.md`; this file is the validation/run guide.

## Prerequisites

- PostgreSQL running, `DATABASE_URL` set, Identity v1 + Customers v1 + Purchases v1 migrations applied (`prisma migrate status` up to date)
- Products migration applied: `npx prisma migrate dev` in `apps/api`
- API running: `npm run start:dev` in `apps/api`
- Seeded baseline (same as customers/purchases e2e): org1 with ADMINISTRADOR/GERENTE/OPERADOR users, org2 with ADMINISTRADOR, one PLATFORM_OWNER, one customer per org, one product per org

## Setup

```bash
# 1. Apply products schema (approved HG-4; review SQL)
cd apps/api
npx prisma migrate dev --create-only --name add_product_audit_fields   # review SQL
npx prisma migrate dev                                                  # apply
# 2. Seed baseline:
#    - org1: product P-100 (Batería X, category Baterías), P-200 (Batería Y), P-300 (Accesorio)
#    - org2: product P-100 (Batería X)
# 3. Verify API starts
npm run start:dev
```

## Validation Scenarios

### S1. Create product (ADMINISTRADOR)
```bash
TOKEN=$(curl -s -X POST /api/v1/auth/login -d '{"email":"admin@org1.test","password":"ValidPass123"}' | jq -r .data.accessToken)
curl -s -X POST /api/v1/products -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"code":"P-400","name":"Batería Z","category":"Baterías"}'
```
**Expected**: `201`; `data.status=ACTIVE` (default), `data.createdBy` set; Audit row `product.create.success` with `module=products`.

### S2. Duplicate code
```bash
curl -s -X POST /api/v1/products -H "Authorization: Bearer $TOKEN" -d '{"code":"P-400","name":"Otra"}'
```
**Expected**: `409` `CONFLICT`; audit `product.create.failure`. (Same `(organizationId, code)` → duplicate; also when the colliding row is soft-deleted — R-008.)

### S3. List + pagination
```bash
curl -s "/api/v1/products?page=1&limit=20" -H "Authorization: Bearer $TOKEN"
```
**Expected**: `200`; `meta={page:1, limit:20, total, pages}`; only org1 products; no soft-deleted products.

### S4. Search / filters / sort
```bash
curl -s "/api/v1/products?search=BATERIA&status=ACTIVE&category=Baterías&sort=-createdAt" -H "Authorization: Bearer $TOKEN"
```
**Expected**: `200`; only matching org1 products (case-insensitive); newest createdAt first.

### S5. Get by id
```bash
curl -s /api/v1/products/<id> -H "Authorization: Bearer $TOKEN"
```
**Expected**: `200` full product. Unknown/cross-tenant/soft-deleted id → `404 PRODUCT_NOT_FOUND`.

### S6. Update name/category/status
```bash
curl -s -X PATCH /api/v1/products/<id> -H "Authorization: Bearer $TOKEN" -d '{"name":"Batería Z Plus","category":"Baterías Premium","status":"INACTIVE"}'
```
**Expected**: `200`; fields updated, `updatedBy` set, audit `product.update.success`.

### S7. code immutable
```bash
curl -s -X PATCH /api/v1/products/<id> -H "Authorization: Bearer $TOKEN" -d '{"code":"P-9999"}'
```
**Expected**: `400` (immutable; whitelist/constraint rejection — HG-3).

### S8. OPERADOR read-only
```bash
OPERADOR_TOKEN=$(curl -s -X POST /api/v1/auth/login -d '{"email":"operador@org1.test","password":"ValidPass123"}' | jq -r .data.accessToken)
curl -s /api/v1/products -H "Authorization: Bearer $OPERADOR_TOKEN"   # 200
curl -s -X POST /api/v1/products -H "Authorization: Bearer $OPERADOR_TOKEN" -d '{"code":"X","name":"X"}'  # 403
curl -s -X PATCH /api/v1/products/<id> -H "Authorization: Bearer $OPERADOR_TOKEN" -d '{"status":"ACTIVE"}'  # 403
curl -s -X DELETE /api/v1/products/<id> -H "Authorization: Bearer $OPERADOR_TOKEN"  # 403
```

### S9. Tenant isolation
```bash
ADMIN2_TOKEN=$(curl -s -X POST /api/v1/auth/login -d '{"email":"admin2@org2.test","password":"ValidPass123"}' | jq -r .data.accessToken)
curl -s /api/v1/products/<org1-product-id> -H "Authorization: Bearer $ADMIN2_TOKEN"            # 404 PRODUCT_NOT_FOUND
curl -s -X POST /api/v1/products -H "Authorization: Bearer $ADMIN2_TOKEN" -d '{"code":"P-1","name":"X","organizationId":"<org1-id>"}'  # 400 (tenant from JWT only)
```

### S10. Soft delete
```bash
curl -s -X DELETE /api/v1/products/<id> -H "Authorization: Bearer $TOKEN"   # 200 {data:{success:true}}; audit product.delete.success
curl -s /api/v1/products/<id> -H "Authorization: Bearer $TOKEN"             # 404 (hidden)
curl -s -X DELETE /api/v1/products/<id> -H "Authorization: Bearer $TOKEN"   # 404 (already deleted)
curl -s -X PATCH /api/v1/products/<id> -H "Authorization: Bearer $TOKEN" -d '{"name":"X"}'  # 404
```

### S11. PLATFORM_OWNER cross-org
```bash
OWNER_TOKEN=$(curl -s -X POST /api/v1/auth/login -d '{"email":"owner@platform.test","password":"ValidPass123"}' | jq -r .data.accessToken)
curl -s /api/v1/products -H "Authorization: Bearer $OWNER_TOKEN"                   # 200: products of ALL orgs
curl -s -X POST /api/v1/products -H "Authorization: Bearer $OWNER_TOKEN" -d '{"code":"P-500","name":"Batería Global","organizationId":"<org2-id>"}'   # 201 in org2
curl -s -X POST /api/v1/products -H "Authorization: Bearer $OWNER_TOKEN" -d '{"code":"P-501","name":"X"}'                    # 400 (missing org)
curl -s -X POST /api/v1/products -H "Authorization: Bearer $OWNER_TOKEN" -d '{"code":"P-502","name":"X","organizationId":"<unknown>"}'  # 400 (unknown org)
```

### S12. Audit trail
```sql
SELECT action, "userId", "organizationId", "module" FROM "Audit" WHERE "module" = 'products' ORDER BY "createdAt" DESC;
```
**Expected**: rows for every create/update/delete with correct actor/org; no sensitive metadata.

### S13. Purchases integration (soft-deleted product)
```bash
# 1. Soft-delete a product referenced by an existing purchase (S10)
# 2. List purchases:
curl -s "/api/v1/purchases?productId=<soft-deleted-product>" -H "Authorization: Bearer $TOKEN"
#    Expected: purchases still show product {id, code, name} summary (historical record — HG-2, no purchases change)
# 3. Create a purchase referencing the soft-deleted product:
curl -s -X POST /api/v1/purchases -H "Authorization: Bearer $TOKEN" -d '{"customerId":"<c1>","productId":"<soft-deleted-product>","invoiceNumber":"INV-X","purchaseDate":"2026-08-01T10:00:00Z","quantity":1,"value":"1.00"}'
#    Expected: 400 VALIDATION_ERROR (purchases R-011 filters deletedAt: null)
```

### S14. createdFrom/createdTo day boundary (inclusive bounds)
```bash
# Seed products created at 2026-02-28T00:00:00Z, 2026-02-28T12:00:00Z, 2026-02-28T23:59:59.999Z and 2026-03-01T00:00:00Z
curl -s "/api/v1/products?createdTo=2026-02-28" -H "Authorization: Bearer $TOKEN"   # 2026-02-28 00:00:00, 12:00:00 and 23:59:59.999 — NOT 03-01
curl -s "/api/v1/products?createdFrom=2026-02-28" -H "Authorization: Bearer $TOKEN" # 2026-02-28 00:00:00 through 03-01+ (lower bound)
curl -s "/api/v1/products?createdTo=2026-02-28T12:00:00Z" -H "Authorization: Bearer $TOKEN"  # full datetime: exact instant preserved
```
**Expected**: a date-only `createdTo` includes the **whole requested day** (`<= 23:59:59.999`); a date-only `createdFrom` means `>= 00:00:00`; a full ISO datetime keeps its exact instant.

## Quality gates

```bash
cd apps/api
npm run lint
npm run build
npm run test          # unit: *.spec.ts
npm run test:e2e      # e2e: test/jest-e2e.json
# combined coverage (unit + e2e):
./node_modules/.bin/jest --config ./test/jest-combined.json --runInBand --silent --coverage
# target >80% coverage for modules/products (Constitution X)
```

## Expected completion signals

- All S1-S14 scenarios pass
- Unit + integration coverage >80% for the products module
- No changes outside Products scope (only `app.module.ts` registration); purchases/customers untouched