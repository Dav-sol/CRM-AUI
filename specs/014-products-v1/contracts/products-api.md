# Products v1 — API Contract

REST API under `/api/v1` (per API_GUIDELINES.md §2). Response envelope per API_GUIDELINES.md §6-8: success `{ "data": {} }`, collections `{ "data": [], "meta": {} }`, errors `{ "error": { "code", "message", "details? } }`.

All endpoints require `Authorization: Bearer <accessToken>` (JwtAuthGuard). Tenant scope always derives from the JWT; `organizationId` is never accepted from the client for ORGANIZATION users (NR-001). DELETE soft-deletes (`deletedAt`/`deletedBy`); records are never physically removed (06-database.md:328-333; API_GUIDELINES §5/§14; HG-2).

---

## GET /products

Lists products of the authenticated user's organization (PLATFORM_OWNER: all organizations), paginated. Soft-deleted products are excluded.

**Query parameters** (all optional):

| Param | Type | Validation | Default |
|-------|------|------------|---------|
| `page` | int | ≥ 1 | 1 |
| `limit` | int | 1..100 | 20 |
| `search` | string | ≤ 100; matches code/name/category (case-insensitive contains) | — |
| `status` | string | ACTIVE \| INACTIVE | — |
| `category` | string | ≤ 100; exact match | — |
| `createdFrom` | string (ISO 8601) | date; inclusive lower bound on createdAt | — |
| `createdTo` | string (ISO 8601) | date; inclusive upper bound on createdAt | — |
| `sort` | string | whitelist: code, name, category, status, createdAt, updatedAt; leading `-` = descending | `-createdAt` |

**Response 200**:

```json
{
  "data": [
    {
      "id": "cuid",
      "uuid": "uuid",
      "code": "P-100",
      "name": "Batería X",
      "category": "Baterías",
      "status": "ACTIVE",
      "createdAt": "2026-08-13T10:00:00.000Z",
      "updatedAt": "2026-08-13T10:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 42, "pages": 3 }
}
```

**Errors**: `400` `BAD_REQUEST` (invalid params).

---

## GET /products/{id}

Returns one product of the authenticated user's organization.

**Response 200**: `{ "data": { "id", "uuid", "code", "name", "category", "status", "createdAt", "updatedAt" } }`

**Errors**:
- `404` `PRODUCT_NOT_FOUND` "Product not found" — missing, cross-tenant (R-002), or soft-deleted (R-008)

---

## POST /products

Creates a product. Writable by ADMINISTRADOR, GERENTE, PLATFORM_OWNER (OPERADOR → 403).

**Request body**:

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `code` | string | yes | ≤ 50; immutable after creation (HG-3) |
| `name` | string | yes | ≤ 200 |
| `category` | string | no | ≤ 100 (free text; no catalog in v1) |
| `status` | string | no | ACTIVE \| INACTIVE; default ACTIVE |
| `organizationId` | string | PLATFORM_OWNER only | must reference an existing organization; forbidden for org users (400) |

**Response 201**: `{ "data": { "id", "uuid", "code", "name", "category", "status", "createdAt", "updatedAt", "createdBy" } }`

**Errors**:
- `400` `BAD_REQUEST` — DTO validation
- `400` `VALIDATION_ERROR` — org user sent organizationId; PLATFORM_OWNER missing/unknown organizationId
- `403` `FORBIDDEN` — OPERADOR (or any role not authorized)
- `409` `CONFLICT` "A product with this code already exists" — duplicate `(organizationId, code)` (schema.prisma:128; collision with a soft-deleted row also → 409, R-008)

---

## PATCH /products/{id}

Updates product fields. Writable by ADMINISTRADOR, GERENTE, PLATFORM_OWNER.

**Request body**: any subset of `name`, `category`, `status` (same validations as create). `code` is NOT accepted (immutable — whitelist rejects it with 400).

**Response 200**: `{ "data": { ...product } }` (updatedAt/updatedBy refreshed).

**Errors**:
- `400` `BAD_REQUEST` — DTO validation / immutable field attempt
- `403` `FORBIDDEN` — role denial
- `404` `PRODUCT_NOT_FOUND` — missing, cross-tenant, or soft-deleted

---

## DELETE /products/{id}

Soft-deletes a product (sets `deletedAt`/`deletedBy`; history preserved — HG-2). Writable by ADMINISTRADOR, GERENTE, PLATFORM_OWNER.

**Response 200**: `{ "data": { "success": true } }`

**Errors**:
- `403` `FORBIDDEN` — role denial
- `404` `PRODUCT_NOT_FOUND` — missing, cross-tenant, or already soft-deleted

---

## Authorization summary

| Operation | PLATFORM_OWNER | ADMINISTRADOR | GERENTE | OPERADOR |
|-----------|----------------|---------------|---------|----------|
| GET /products | ✓ (all orgs) | ✓ (own org) | ✓ (own org) | ✓ (own org) |
| GET /products/{id} | ✓ (any org) | ✓ | ✓ | ✓ |
| POST /products | ✓ (with valid organizationId) | ✓ | ✓ | ✗ 403 |
| PATCH /products/{id} | ✓ | ✓ | ✓ | ✗ 403 |
| DELETE /products/{id} | ✓ | ✓ | ✓ | ✗ 403 |

## Tenant isolation (contract-level)

- `organizationId` is never accepted from the client as an authorization source for ORGANIZATION users (API_GUIDELINES §18)
- Every tenant-scoped query filters by the authenticated user's `organizationId` (R-001)
- PLATFORM_OWNER (`organizationId=null`) bypasses tenant filters
- Cross-tenant resource access → `404 PRODUCT_NOT_FOUND` (R-002); role denials → `403 FORBIDDEN`
- Soft-deleted records behave as missing for all tenant-scoped queries (R-008)

## Purchases integration (contract-level)

- Purchases keep their historical product summaries after a product is soft-deleted (purchases v1 include has no `deletedAt` filter — no purchases change; HG-2)
- Creating a purchase referencing a soft-deleted product → `400` `VALIDATION_ERROR` (existing purchases R-011 filters `deletedAt: null` — no purchases change; HG-2)

## Audit (contract-level)

Every write produces an Audit row via `AuditIdentityService` (`module: 'products'`): action `product.create|update|delete` + `.success|.failure`, actor userId and organizationId from the JWT, sanitized metadata only. Audit failures never alter business outcomes (NR-005).