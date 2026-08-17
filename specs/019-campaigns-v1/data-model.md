# Campaigns v1 — Data Model

## Baseline

Models `Campaign` (`schema.prisma:197-215`) and `Automation` (`schema.prisma:217-247`) already exist from `add_domain_entities` (016). `Campaign.status {DRAFT, ACTIVE, PAUSED, FINISHED, CANCELLED}` and `AutomationStatus {PENDING, SCHEDULED, EXECUTED, CANCELLED, ERROR, PAUSED}` and `CampaignType {AUTOMATIC, MANUAL, REPURCHASE, SPECIAL}` are in the enum. `Automation.purchaseId` is `NOT NULL` (HG-6 kept). `Automation.campaignId` is nullable (one automations belongs to at most one campaign). Kit 018 added `startAt/endAt` → no, kit 019 adds two new additive columns.

## Delta (additive migration `add_campaigns_v1`)

Two new columns on the `campaigns` table:

```prisma
model Campaign {
  // ...existing fields (197-215) unchanged...
  startAt   DateTime?  @map("start_at")  // send date; "Programada" = ACTIVE with future startAt (HG-5)
  segment   Json?    @map("segment")     // { city?, productId?, purchaseFrom?, purchaseTo?, customerStatus? } (HG-7, R-002)

  @@index([organizationId])
  @@map("campaigns")
}
```

- `Campaign.startAt`: nullable `DateTime` (soft-date). When present and > `now`, activation sets `scheduledDate = startAt`. When absent or ≤ `now`, scheduledDate = now (activation schedules immediately). Documented INFERENCIA (campaign "Programada" semantics, HG-5).
- `Campaign.segment`: nullable `Json` (jsonb). Contains optional filters: `city` (case-insensitive contains, consistent with `customers.service.ts:249-250`), `productId` (product `uuid`), `purchaseFrom`/`purchaseTo` (whole-day inclusive, NR-010 precedent), `customerStatus` (`ACTIVE`/`INACTIVE`/`BLOCKED` from `CustomerStatus` enum). **At least one criterion required** to define a segment; empty segment resolves to all customers with purchases.

## Back-relations added to existing models (no column changes):

- `Campaign.automations Automation[]` — already present; read-only from campaigns service (aggregation for stats).

## Migration SQL (review before apply)

```sql
-- AddColumn: start_at (nullable, default null)
ALTER TABLE "campaigns" ADD COLUMN "start_at" TIMESTAMP(3);

-- AddColumn: segment (nullable, default null)
ALTER TABLE "campaigns" ADD COLUMN "segment" JSONB;
```

Notes:
- All new columns; zero impact on existing rows (`start_at`/`segment` nullable).
- `@@unique` unchanged (no column change on campaigns beyond these two additions).
- JSONB is PostgreSQL native; Prisma reads/writes a JS object. Documented INFERENCIA — future Configuração (Módulo 10) may normalize.
- Generation: `npx prisma migrate dev --create-only --name add_campaigns_v1`, review SQL, apply.

## Entity relationships

- `Campaign.organizationId → Organization.id`; `Campaign.automations` (one-to-many, aggregated stats).
- `Automation.campaignId → Campaign.id` (nullable); `Automation.purchaseId → Purchase.id` (NOT NULL).
- `Automation.status transitions`: PENDING → SCHEDULED (activation) → EXECUTED (scheduler) → CANCELLED (cancel) / ERROR (provider failure, logged only). No SCHEDULED enum value (HG-5).

## Invariants

- Every campaign belongs to exactly one organization; segment is org-scoped.
- Records never physically deleted (CO-003): soft-delete only via `deletedAt` on Campaign; never in v1.
- Activation (DRAFT→ACTIVE) guarded NR-005; concurrent activate → 400.
- Cancel (ACTIVE/PAUSED→CANCELLED) additionally cancels pending SCHEDULED automations of the campaign.
- Pause (ACTIVE→PAUSED) flips status; scheduler filters (R-006) skip non-ACTIVE campaigns.
- Finish auto when remaining SCHEDULED automations = 0 (R-005).
- One automation per qualifying customer (dedupe); campaign automations never modify customer data (CA-002).
- City matching: case-insensitive contains (consistent with `customers.service.ts:249-250` product content).