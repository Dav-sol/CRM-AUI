# Data Model: Products v1

Phase 1 output for `specs/014-products-v1`. Describes the Prisma entity involved in Products v1, mapped to the existing `apps/api/prisma/schema.prisma`. The Product model already exists (migration `20260810000529_add_domain_entities`); the changes below are additive and subject to the approved HUMAN GATE (HG-4).

## Conventions

- Identifiers: `id` (cuid) + `uuid` (unique) per existing schema convention
- Tenant entities carry `organizationId` + `@@index([organizationId])`
- Snake_case DB mapping via `@map` per existing schema
- Actor audit fields per API_GUIDELINES.md §15: `createdBy` / `updatedBy` / `deletedBy` (DELETE exists in v1 per HG-2 — unlike purchases)

---

## 1. Product (modified — additive, APPROVED HG-4)

Current model in `schema.prisma:113-131` (fields source: 06-database.md:127-139):

| Field | Current | Proposed | Notes |
|-------|---------|----------|-------|
| `id` | `String @id @default(cuid())` | unchanged | |
| `uuid` | `String @unique @default(uuid())` | unchanged | |
| `organizationId` | `String @map("organization_id")` | unchanged | tenant key |
| `code` | `String` | unchanged | ERP-facing reference (01-mvp.md:65-73); part of unique identity (HG-3); immutable (R-004) |
| `name` | `String` | unchanged | |
| `category` | `String?` | unchanged | optional free text (R-015) |
| `status` | `ProductStatus @default(ACTIVE)` | unchanged | ACTIVE/INACTIVE; no transitions workflow (Q7) |
| `createdAt` | `DateTime @default(now()) @map("created_at")` | unchanged | |
| `updatedAt` | `DateTime @updatedAt @map("updated_at")` | unchanged | |
| `deletedAt` | `DateTime? @map("deleted_at")` | unchanged | soft delete marker (HG-2) |
| `createdBy` | — | `String? @map("created_by")` | **NEW**; actor id from JWT (HG-4, API_GUIDELINES §15) |
| `updatedBy` | — | `String? @map("updated_by")` | **NEW**; actor id from JWT (HG-4) |
| `deletedBy` | — | `String? @map("deleted_by")` | **NEW**; actor id from JWT (HG-4, HG-2) |

Indexes:

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `@@unique([organizationId, code])` | unchanged | product identity (schema.prisma:128); spans soft-deleted rows (R-008) |
| `@@index([organizationId])` | unchanged | tenant lookups |
| — | `@@index([organizationId, status])` | **NEW**; status filter on lists (06-database.md:350 estado) |

Relationships (unchanged, out of v1 scope): `organization`, `purchases Purchase[]` (FK `productId`, schema.prisma:152 — purchases module consumes products; no changes there, HG-2).

**Domain invariants**:
- A product belongs to exactly one organization (06-database.md:310).
- `(organizationId, code)` is unique (schema.prisma:128).
- A product is never physically deleted; DELETE sets `deletedAt`/`deletedBy` and hides it from queries (06-database.md:328-333; API_GUIDELINES §14; HG-2).
- A soft-deleted product does not release its `code` unique slot (R-008 — no partial index).
- Purchases referencing a product keep their historical summary after soft delete; new purchases referencing a soft-deleted product are rejected (013-purchases-v1 R-011; HG-2 — no purchases code change).

**Status transitions**:

```
[POST create]   [PATCH status — v1: no transitions workflow]   [DELETE — soft]
     │                    │                                          │
     v                    v                                          v
   ACTIVE ────────────► INACTIVE                        deletedAt/deletedBy set
```

---

## 2. Purchase (referenced, NOT modified)

- `Purchase` (schema.prisma:133-164) references `Product` via `productId` (schema.prisma:152). Purchases v1 already validates product existence + tenant access with `deletedAt: null` (013-purchases-v1 research.md R-011) and includes the product summary in list/detail (research.md R-009). **No changes to the purchases module or schema.**

---

## 3. Audit (reused, no changes)

Existing model `schema.prisma:369-389` is reused via `AuditIdentityService` with `module: 'products'` (R-005):

| Field | Value for product events |
|-------|--------------------------|
| `module` | `'products'` |
| `action` | `product.create.success` / `product.create.failure` / `product.update.success` / `product.update.failure` / `product.delete.success` / `product.delete.failure` |
| `userId` | actor id from JWT |
| `organizationId` | actor's `organizationId` from JWT (null only for PLATFORM_OWNER) |
| `description` | optional human summary |
| `metadata` | non-sensitive context only (sanitized) |

**No schema change** to Audit.

---

## 4. Enums

`ProductStatus` (schema.prisma:431-434): `ACTIVE`, `INACTIVE` — unchanged. Both are usable via PATCH with no transitions workflow (Q7).

---

## 5. Validation Rules

| Field | Create | Update | Notes |
|-------|--------|--------|-------|
| `code` | required, string ≤ 50 | NOT accepted (immutable, HG-3, R-004) | explicit attempts → 400 |
| `name` | required, string ≤ 200 | optional | |
| `category` | optional, string ≤ 100 | optional | free text (R-015) |
| `status` | optional (default ACTIVE) | optional, enum | no transitions workflow (Q7) |
| `organizationId` | optional; required for PLATFORM_OWNER; forbidden for org users | — | R-011 |

Query params: `page` int 1..n default 1; `limit` int 1..100 default 20; `search` string ≤ 100 (code/name/category contains, insensitive); `status` enum; `category` string ≤ 100 (exact); `createdFrom`/`createdTo` ISO dates (createdAt range; date-only = whole-day inclusive); `sort` whitelist (`code`, `name`, `category`, `status`, `createdAt`, `updatedAt`, optional leading `-`; default `-createdAt`).

---

## 6. Migration Plan (APPROVED HG-4)

```sql
-- additive only; review before apply (--create-only)
ALTER TABLE "products" ADD COLUMN "created_by" TEXT;
ALTER TABLE "products" ADD COLUMN "updated_by" TEXT;
ALTER TABLE "products" ADD COLUMN "deleted_by" TEXT;
CREATE INDEX "products_organization_id_status_idx" ON "products"("organization_id", "status");
```

No other tables touched. Migration name: `add_product_audit_fields`.