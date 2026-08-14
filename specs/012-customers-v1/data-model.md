# Data Model: Customers v1

Phase 1 output for `specs/012-customers-v1`. Describes the Prisma entity involved in Customers v1, mapped to the existing `apps/api/prisma/schema.prisma`. The Customer model already exists; the changes below are additive and subject to the approved HUMAN GATE (HG-5).

## Conventions

- Identifiers: `id` (cuid) + `uuid` (unique) per existing schema convention
- Soft delete via `deletedAt` per API_GUIDELINES.md §14
- Tenant entities carry `organizationId` + `@@index([organizationId])`
- Snake_case DB mapping via `@map` per existing schema
- Actor audit fields per API_GUIDELINES.md §15: `createdBy` / `updatedBy` / `deletedBy`

---

## 1. Customer (modified — additive, APPROVED HG-5)

Current model in `schema.prisma:83-106`:

| Field | Current | Proposed | Notes |
|-------|---------|----------|-------|
| `id` | `String @id @default(cuid())` | unchanged | |
| `uuid` | `String @unique @default(uuid())` | unchanged | |
| `organizationId` | `String @map("organization_id")` | unchanged | tenant key |
| `codcli` | `String` | unchanged | ERP identity; immutable after creation (HG-2) |
| `name` | `String` | unchanged | |
| `phone` | `String?` | unchanged | free string (HG-8), no E.164 |
| `email` | `String?` | unchanged | |
| `address` | `String?` | unchanged | |
| `city` | `String?` | unchanged | filterable |
| `status` | `CustomerStatus @default(ACTIVE)` | unchanged | ACTIVE/INACTIVE used; BLOCKED reserved (HG-7) |
| `createdAt` | `DateTime @default(now()) @map("created_at")` | unchanged | |
| `updatedAt` | `DateTime @updatedAt @map("updated_at")` | unchanged | |
| `deletedAt` | `DateTime? @map("deleted_at")` | unchanged | soft delete (HG-4) |
| `createdBy` | — | `String? @map("created_by")` | **NEW**; actor id from JWT (HG-5, API_GUIDELINES §15) |
| `updatedBy` | — | `String? @map("updated_by")` | **NEW**; actor id from JWT (HG-5) |
| `deletedBy` | — | `String? @map("deleted_by")` | **NEW**; actor id from JWT (HG-5) |

Indexes:

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `@@unique([organizationId, codcli])` | unchanged | CL-001/002; 06-database:123 |
| `@@index([organizationId])` | unchanged | tenant lookups |
| `@@index([phone])` | unchanged | 06-database:344 |
| — | `@@index([organizationId, status])` | **NEW**; status filter on lists (06-database:336-353) |
| — | `@@index([organizationId, createdAt])` | **NEW**; created-range filters + default sort (06-database:353) |

Relationships (unchanged, out of v1 scope): `organization`, `purchases Purchase[]`, `conversations Conversation[]`.

**Domain invariants**:
- `(organizationId, codcli)` is unique per organization (CL-002).
- A customer belongs to exactly one organization (06-database:310).
- codcli is immutable after creation (HG-2).
- Soft-deleted customers keep `deletedAt` set and are excluded from normal queries (API_GUIDELINES §14).
- History (purchases, conversations, audit) is never deleted (06-database:328-332).

**Status transitions**:

```
[create]                 [PATCH status / future ERP sync]        [future ERP sync]
    │                          │                                        │
    v                          v                                        v
  ACTIVE ──────────────► INACTIVE ◄──────────────────────────── (kept, history preserved)
    │
    └──[DELETE soft]──► deletedAt set (hidden; history preserved)
```

- `BLOCKED` is reserved with no v1 behavior (HG-7).

---

## 2. Audit (reused, no changes)

Existing model `schema.prisma:364-384` is reused via `AuditIdentityService` with `module: 'customers'` (HG-9):

| Field | Value for customer events |
|-------|--------------------------|
| `module` | `'customers'` |
| `action` | `customer.create.success` / `customer.create.failure` / `customer.update.success` / `customer.update.failure` / `customer.delete.success` / `customer.delete.failure` |
| `userId` | actor id from JWT (null only for pre-auth events, which customer writes never are) |
| `organizationId` | actor's `organizationId` from JWT (null only for PLATFORM_OWNER) |
| `description` | optional human summary |
| `metadata` | non-sensitive context only (sanitized) |

**No schema change** to Audit.

---

## 3. Enums

`CustomerStatus` (schema.prisma:416-420): `ACTIVE`, `INACTIVE`, `BLOCKED` — unchanged. Customers v1 uses ACTIVE/INACTIVE in operations; BLOCKED accepted by validation but inert (HG-7).

---

## 4. Validation Rules

| Field | Create | Update | Notes |
|-------|--------|--------|-------|
| `codcli` | required, string ≤ 50 | NOT accepted (immutable, HG-2) | whitelist rejects it → 400 BAD_REQUEST |
| `name` | required, string ≤ 200 | optional | |
| `phone` | optional, string ≤ 30 | optional | free string (HG-8) |
| `email` | optional, `@IsEmail()` | optional | |
| `address` | optional, string ≤ 200 | optional | |
| `city` | optional, string ≤ 200 | optional | |
| `status` | — (default ACTIVE) | optional, enum | ACTIVE/INACTIVE/BLOCKED (R-015) |
| `organizationId` | optional; required for PLATFORM_OWNER; forbidden for org users | — | R-012 |

Query params: `page` int 1..n default 1; `limit` int 1..100 default 20; `search` string ≤ 100; `status` enum; `city` string ≤ 200; `createdFrom`/`createdTo` ISO dates; `sort` whitelist (`name`, `codcli`, `city`, `status`, `createdAt`, `updatedAt`, optional leading `-`).