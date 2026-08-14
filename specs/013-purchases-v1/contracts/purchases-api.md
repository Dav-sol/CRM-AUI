# Purchases v1 — API Contract

REST API under `/api/v1` (per API_GUIDELINES.md §2). Response envelope per API_GUIDELINES.md §6-8: success `{ "data": {} }`, collections `{ "data": [], "meta": {} }`, errors `{ "error": { "code", "message", "details? } }`.

All endpoints require `Authorization: Bearer <accessToken>` (JwtAuthGuard). Tenant scope always derives from the JWT; `organizationId` is never accepted from the client for ORGANIZATION users. There is NO DELETE endpoint (CP-004, HG-4).

---

## GET /purchases

Lists purchases of the authenticated user's organization (PLATFORM_OWNER: all organizations), paginated. Includes inline customer/product summaries (single query, no N+1 — R-009).

**Query parameters** (all optional):

| Param | Type | Validation | Default |
|-------|------|------------|---------|
| `page` | int | ≥ 1 | 1 |
| `limit` | int | 1..100 | 20 |
| `search` | string | ≤ 100; matches invoiceNumber (case-insensitive contains) | — |
| `customerId` | string | exact customer id | — |
| `productId` | string | exact product id | — |
| `status` | string | COMPLETED \| CANCELLED \| REFUNDED | — |
| `dateFrom` | string (ISO 8601) | date; inclusive lower bound on purchaseDate | — |
| `dateTo` | string (ISO 8601) | date; inclusive upper bound on purchaseDate | — |
| `sort` | string | whitelist: purchaseDate, invoiceNumber, quantity, value, status, createdAt, updatedAt; leading `-` = descending | `-purchaseDate` |

**Response 200**:

```json
{
  "data": [
    {
      "id": "cuid",
      "uuid": "uuid",
      "invoiceNumber": "INV-0001",
      "purchaseDate": "2026-07-22T14:35:18Z",
      "quantity": 2,
      "value": "450.00",
      "status": "COMPLETED",
      "customer": { "id": "cuid", "codcli": "C-0001", "name": "Juan Pérez" },
      "product": { "id": "cuid", "code": "P-100", "name": "Batería X" },
      "createdAt": "2026-08-13T10:00:00.000Z",
      "updatedAt": "2026-08-13T10:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 42, "pages": 3 }
}
```

`value` is always a string (HG-7, R-008). Errors: `400` `BAD_REQUEST` (invalid params).

---

## GET /purchases/{id}

Returns one purchase of the authenticated user's organization, with customer/product summaries.

**Response 200**: `{ "data": { "id", "uuid", "invoiceNumber", "purchaseDate", "quantity", "value", "status", "customer": {...}, "product": {...}, "createdAt", "updatedAt" } }`

**Errors**:
- `404` `PURCHASE_NOT_FOUND` "Purchase not found" — missing or cross-tenant (R-002)

---

## POST /purchases

Creates a purchase. Writable by ADMINISTRADOR, GERENTE, PLATFORM_OWNER (OPERADOR → 403).

**Request body**:

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `customerId` | string | yes | must exist and belong to the tenant (R-011); immutable after creation |
| `productId` | string | yes | must exist and belong to the tenant (HG-3, R-011); immutable after creation |
| `invoiceNumber` | string | yes | ≤ 50; immutable after creation (HG-7) |
| `purchaseDate` | string (ISO 8601) | yes | date-time |
| `quantity` | int | yes | ≥ 1 |
| `value` | string | yes | money: `^\d{1,10}(\.\d{1,2})?$` (HG-7); total value |
| `status` | string | no | COMPLETED \| CANCELLED \| REFUNDED; default COMPLETED |
| `organizationId` | string | PLATFORM_OWNER only | must reference an existing organization; forbidden for org users (400) |

**Response 201**: `{ "data": { ...purchase, "createdBy": "userId" } }`

**Errors**:
- `400` `BAD_REQUEST` — DTO validation
- `400` `VALIDATION_ERROR` — org user sent organizationId; PLATFORM_OWNER missing/unknown organizationId; unknown or cross-tenant customerId/productId
- `403` `FORBIDDEN` — OPERADOR (or any role not authorized)
- `409` `CONFLICT` "A purchase with this invoiceNumber already exists" — duplicate `(organizationId, invoiceNumber, customerId, productId, purchaseDate)` (CP-005)

---

## PATCH /purchases/{id}

Updates purchase fields. Writable by ADMINISTRADOR, GERENTE, PLATFORM_OWNER.

**Request body**: any subset of `purchaseDate`, `quantity`, `value`, `status` (same validations as create). `invoiceNumber`, `customerId`, `productId` are NOT accepted (immutable — whitelist rejects them with 400).

**Response 200**: `{ "data": { ...purchase } }` (updatedAt/updatedBy refreshed).

**Errors**:
- `400` `BAD_REQUEST` — DTO validation / immutable field attempt
- `403` `FORBIDDEN` — role denial
- `404` `PURCHASE_NOT_FOUND` — missing or cross-tenant

---

## DELETE /purchases/{id}

**Does not exist.** Purchases are never deleted (CP-004, HG-4). The route is not registered; requests fall through to the router's default 404.

---

## Authorization summary

| Operation | PLATFORM_OWNER | ADMINISTRADOR | GERENTE | OPERADOR |
|-----------|----------------|---------------|---------|----------|
| GET /purchases | ✓ (all orgs) | ✓ (own org) | ✓ (own org) | ✓ (own org) |
| GET /purchases/{id} | ✓ (any org) | ✓ | ✓ | ✓ |
| POST /purchases | ✓ (with valid organizationId) | ✓ | ✓ | ✗ 403 |
| PATCH /purchases/{id} | ✓ | ✓ | ✓ | ✗ 403 |
| DELETE /purchases/{id} | — (no route) | — | — | — |

## Tenant isolation (contract-level)

- `organizationId` is never accepted from the client as an authorization source for ORGANIZATION users (API_GUIDELINES §18)
- Every tenant-scoped query filters by the authenticated user's `organizationId` (R-001)
- PLATFORM_OWNER (`organizationId=null`) bypasses tenant filters
- Cross-tenant resource access → `404 PURCHASE_NOT_FOUND`; role denials → `403 FORBIDDEN`
- `customerId`/`productId` on create are validated against the resolved tenant (HG-3)

## Audit (contract-level)

Every write produces an Audit row via `AuditIdentityService` (`module: 'purchases'`): action `purchase.create|update` + `.success|.failure`, actor userId and organizationId from the JWT, sanitized metadata only. Audit failures never alter business outcomes (NR-005).