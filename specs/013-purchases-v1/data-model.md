# Data Model: Purchases v1

Phase 1 output for `specs/013-purchases-v1`. Describes the Prisma entity involved in Purchases v1, mapped to the existing `apps/api/prisma/schema.prisma`. The Purchase model already exists (migration `20260810000529_add_domain_entities`); the changes below are additive and subject to the approved HUMAN GATE (HG-5).

## Conventions

- Identifiers: `id` (cuid) + `uuid` (unique) per existing schema convention
- Tenant entities carry `organizationId` + `@@index([organizationId])`
- Snake_case DB mapping via `@map` per existing schema
- Actor audit fields per API_GUIDELINES.md §15: `createdBy` / `updatedBy` (NO `deletedBy` — no DELETE per HG-4)

---

## 1. Purchase (modified — additive, APPROVED HG-5)

Current model in `schema.prisma:133-160` (fields source: 06-database.md:142-157):

| Field | Current | Proposed | Notes |
|-------|---------|----------|-------|
| `id` | `String @id @default(cuid())` | unchanged | |
| `uuid` | `String @unique @default(uuid())` | unchanged | |
| `organizationId` | `String @map("organization_id")` | unchanged | tenant key |
| `customerId` | `String @map("customer_id")` | unchanged | required FK; CP-001 (03-business-rules.md:95-97) |
| `productId` | `String @map("product_id")` | unchanged | required FK; validated tenant-scoped (HG-3) |
| `invoiceNumber` | `String @map("invoice_number")` | unchanged | part of duplicate identity (CP-005); immutable (HG-7) |
| `purchaseDate` | `DateTime @map("purchase_date")` | unchanged | filterable/sortable |
| `quantity` | `Int` | unchanged | ≥ 1 |
| `value` | `Decimal @db.Decimal(12, 2)` | unchanged | money; TOTAL value (HG-7); serialized as string |
| `status` | `PurchaseStatus @default(COMPLETED)` | unchanged | COMPLETED/CANCELLED/REFUNDED; no transitions workflow (HG-7) |
| `createdAt` | `DateTime @default(now()) @map("created_at")` | unchanged | |
| `updatedAt` | `DateTime @updatedAt @map("updated_at")` | unchanged | |
| `deletedAt` | `DateTime? @map("deleted_at")` | unchanged | **INERT** (HG-4: CP-004 prevails; never used by v1) |
| `createdBy` | — | `String? @map("created_by")` | **NEW**; actor id from JWT (HG-5, API_GUIDELINES §15) |
| `updatedBy` | — | `String? @map("updated_by")` | **NEW**; actor id from JWT (HG-5) |
| `deletedBy` | — | NOT added | HG-4 |

Indexes:

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `@@unique([organizationId, invoiceNumber, customerId, productId, purchaseDate])` | unchanged | CP-005 duplicate identity (03-business-rules.md:121-131; 06-database.md:362) |
| `@@index([organizationId])` | unchanged | tenant lookups |
| `@@index([customerId])` | unchanged | FK lookups (06-database.md:336-353) |
| `@@index([purchaseDate])` | unchanged | fecha_compra (06-database.md:346) |
| `@@index([invoiceNumber])` | unchanged | numero_factura (06-database.md:348) |
| — | `@@index([organizationId, status])` | **NEW**; status filter on lists (06-database.md:350 estado) |
| — | `@@index([organizationId, purchaseDate])` | **NEW**; date-range filters + default sort (06-database.md:346) |

Relationships (unchanged, out of v1 scope): `organization`, `customer`, `product`, `commercialCycle CommercialCycle?`, `automations Automation[]`.

**Domain invariants**:
- A purchase belongs to exactly one customer (CP-001, 06-database.md:312) and one organization (06-database.md:310).
- `(organizationId, invoiceNumber, customerId, productId, purchaseDate)` is unique (CP-005, schema.prisma:154).
- A purchase is never deleted; only its status changes (CP-004, HG-4).
- A purchase starts one commercial cycle (06-database.md:314) — CommercialCycle management is OUT of v1 scope (Automations module).

**Status transitions**:

```
[POST create]                    [PATCH status — v1: no transitions workflow]
     │                                        │
     v                                        v
  COMPLETED ───────────────────────────────► CANCELLED / REFUNDED
```

- No DELETE path exists (HG-4); `deletedAt` is inert.

---

## 2. Customer / Product (referenced, NOT modified)

- `Customer` (schema.prisma:83-111): used only to validate `customerId` existence + tenant access (HG-3). Full module already implemented (Customers v1).
- `Product` (schema.prisma:113-131): used only to validate `productId` existence + tenant access (HG-3). **NO Products module in v1.**

---

## 3. Audit (reused, no changes)

Existing model `schema.prisma:369-389` is reused via `AuditIdentityService` with `module: 'purchases'` (R-005):

| Field | Value for purchase events |
|-------|--------------------------|
| `module` | `'purchases'` |
| `action` | `purchase.create.success` / `purchase.create.failure` / `purchase.update.success` / `purchase.update.failure` |
| `userId` | actor id from JWT |
| `organizationId` | actor's `organizationId` from JWT (null only for PLATFORM_OWNER) |
| `description` | optional human summary |
| `metadata` | non-sensitive context only (sanitized) |

**No schema change** to Audit.

---

## 4. Enums

`PurchaseStatus` (schema.prisma:432-436): `COMPLETED`, `CANCELLED`, `REFUNDED` — unchanged. All three are usable via PATCH with no transitions workflow (HG-7).

---

## 5. Validation Rules

| Field | Create | Update | Notes |
|-------|--------|--------|-------|
| `customerId` | required, string | NOT accepted (immutable, R-013) | tenant-validated (R-011) |
| `productId` | required, string | NOT accepted (immutable, R-013) | tenant-validated (HG-3, R-011) |
| `invoiceNumber` | required, string ≤ 50 | NOT accepted (immutable, HG-7, R-004) | explicit attempts → 400 |
| `purchaseDate` | required, `@IsDateString()` | optional | ISO 8601 (API_GUIDELINES §20) |
| `quantity` | required, `@IsInt()` ≥ 1 | optional | |
| `value` | required, money string `^\d{1,10}(\.\d{1,2})?$` | optional | serialized as string (HG-7, R-008) |
| `status` | optional (default COMPLETED) | optional, enum | no transitions workflow (HG-7) |
| `organizationId` | optional; required for PLATFORM_OWNER; forbidden for org users | — | R-012 |

Query params: `page` int 1..n default 1; `limit` int 1..100 default 20; `search` string ≤ 100 (invoiceNumber contains, insensitive); `customerId`/`productId` strings; `status` enum; `dateFrom`/`dateTo` ISO dates (purchaseDate range); `sort` whitelist (`purchaseDate`, `invoiceNumber`, `quantity`, `value`, `status`, `createdAt`, `updatedAt`, optional leading `-`; default `-purchaseDate`).

---

## 6. Migration Plan (APPROVED HG-5)

```sql
-- additive only; review before apply (--create-only)
ALTER TABLE "purchases" ADD COLUMN "created_by" TEXT;
ALTER TABLE "purchases" ADD COLUMN "updated_by" TEXT;
CREATE INDEX "purchases_organization_id_status_idx" ON "purchases"("organization_id", "status");
CREATE INDEX "purchases_organization_id_purchase_date_idx" ON "purchases"("organization_id", "purchase_date");
```

No other tables touched. Migration name: `add_purchase_audit_fields`.