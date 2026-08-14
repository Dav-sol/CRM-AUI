# Customers v1 — API Contract

REST API under `/api/v1` (per API_GUIDELINES.md §2). Response envelope per API_GUIDELINES.md §6-8: success `{ "data": {} }`, collections `{ "data": [], "meta": {} }`, errors `{ "error": { "code", "message", "details? } }`.

All endpoints require `Authorization: Bearer <accessToken>` (JwtAuthGuard). Tenant scope always derives from the JWT; `organizationId` is never accepted from the client for ORGANIZATION users (NR-001).

---

## GET /customers

Lists customers of the authenticated user's organization (PLATFORM_OWNER: all organizations), paginated.

**Query parameters** (all optional):

| Param | Type | Validation | Default |
|-------|------|------------|---------|
| `page` | int | ≥ 1 | 1 |
| `limit` | int | 1..100 | 20 |
| `search` | string | ≤ 100; matches name/codcli/phone/email (case-insensitive contains) | — |
| `status` | string | ACTIVE \| INACTIVE \| BLOCKED | — |
| `city` | string | ≤ 200 (case-insensitive contains) | — |
| `createdFrom` | string (ISO 8601) | date | — |
| `createdTo` | string (ISO 8601) | date | — |
| `sort` | string | whitelist: name, codcli, city, status, createdAt, updatedAt; leading `-` = descending | `-createdAt` |

**Response 200**:

```json
{
  "data": [
    {
      "id": "cuid",
      "uuid": "uuid",
      "codcli": "C-0001",
      "name": "Juan Pérez",
      "phone": "0991234567",
      "email": "juan@example.com",
      "address": "Av. Siempre Viva 123",
      "city": "Quito",
      "status": "ACTIVE",
      "createdAt": "2026-08-13T10:00:00.000Z",
      "updatedAt": "2026-08-13T10:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 42, "pages": 3 }
}
```

Soft-deleted customers are excluded. Errors: `400` `BAD_REQUEST` (invalid params).

---

## GET /customers/{id}

Returns one customer of the authenticated user's organization.

**Response 200**: `{ "data": { "id", "uuid", "codcli", "name", "phone", "email", "address", "city", "status", "createdAt", "updatedAt" } }`

**Errors**:
- `404` `CUSTOMER_NOT_FOUND` "Customer not found" — missing, cross-tenant (HG-3), or soft-deleted

---

## POST /customers

Creates a customer. Writable by ADMINISTRADOR, GERENTE, PLATFORM_OWNER (OPERADOR → 403).

**Request body**:

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `codcli` | string | yes | ≤ 50; immutable after creation |
| `name` | string | yes | ≤ 200 |
| `phone` | string | no | ≤ 30 (free string, HG-8) |
| `email` | string | no | format: email |
| `address` | string | no | ≤ 200 |
| `city` | string | no | ≤ 200 |
| `organizationId` | string | PLATFORM_OWNER only | must reference an existing organization; forbidden for org users (400) |

**Response 201**: `{ "data": { "id", "uuid", "codcli", "name", "phone", "email", "address", "city", "status": "ACTIVE", "createdAt", "updatedAt", "createdBy" } }`

**Errors**:
- `400` `BAD_REQUEST` — DTO validation
- `400` `VALIDATION_ERROR` — org user sent organizationId; PLATFORM_OWNER missing/unknown organizationId
- `403` `FORBIDDEN` — OPERADOR (or any role not authorized)
- `409` `CONFLICT` "A customer with this codcli already exists" — duplicate (organizationId, codcli)

---

## PATCH /customers/{id}

Updates customer contact fields. Writable by ADMINISTRADOR, GERENTE, PLATFORM_OWNER.

**Request body**: any subset of `name`, `phone`, `email`, `address`, `city`, `status` (same validations as create). `codcli` is NOT accepted (immutable — whitelist rejects it with 400).

**Response 200**: `{ "data": { ...customer } }` (updatedAt/updatedBy refreshed).

**Errors**:
- `400` `BAD_REQUEST` — DTO validation
- `403` `FORBIDDEN` — role denial
- `404` `CUSTOMER_NOT_FOUND` — missing, cross-tenant, or soft-deleted

---

## DELETE /customers/{id}

Soft-deletes a customer (sets `deletedAt`/`deletedBy`; history preserved). Writable by ADMINISTRADOR, GERENTE, PLATFORM_OWNER.

**Response 200**: `{ "data": { "success": true } }`

**Errors**:
- `403` `FORBIDDEN` — role denial
- `404` `CUSTOMER_NOT_FOUND` — missing, cross-tenant, or already soft-deleted

---

## Authorization summary

| Operation | PLATFORM_OWNER | ADMINISTRADOR | GERENTE | OPERADOR |
|-----------|----------------|---------------|---------|----------|
| GET /customers | ✓ (all orgs) | ✓ (own org) | ✓ (own org) | ✓ (own org) |
| GET /customers/{id} | ✓ (any org) | ✓ | ✓ | ✓ |
| POST /customers | ✓ (with valid organizationId) | ✓ | ✓ | ✗ 403 |
| PATCH /customers/{id} | ✓ | ✓ | ✓ | ✗ 403 |
| DELETE /customers/{id} | ✓ | ✓ | ✓ | ✗ 403 |

## Tenant isolation (contract-level)

- `organizationId` is never accepted from the client as an authorization source for ORGANIZATION users (NR-009/010)
- Every tenant-scoped query filters by the authenticated user's `organizationId` (R-012)
- PLATFORM_OWNER (`organizationId=null`) bypasses tenant filters
- Cross-tenant resource access → `404 CUSTOMER_NOT_FOUND` (HG-3); role denials → `403 FORBIDDEN`

## Audit (contract-level)

Every write produces an Audit row via `AuditIdentityService` (`module: 'customers'`): action `customer.create|update|delete` + `.success|.failure`, actor userId and organizationId from the JWT, sanitized metadata only. Audit failures never alter business outcomes (NR-005).