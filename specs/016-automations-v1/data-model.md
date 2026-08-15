# Automatizaciones v1 — Data Model

## Baseline

Models `CommercialCycle` and `Automation` already exist (schema.prisma:170-233, migration `20260810000529_add_domain_entities`). Automatizaciones v1 adds a **strictly additive** migration (HG-1..HG-5): no table drops, no column renames, no enum changes, no backfills of business data.

## Target schema (delta)

```prisma
model CommercialCycle {
  id             String            @id @default(cuid())
  uuid           String            @unique @default(uuid())
  purchaseId     String            @unique @map("purchase_id")
  status         CommercialCycleStatus @default(ACTIVE)
  startDate      DateTime          @map("start_date")
  endDate        DateTime?         @map("end_date")
  createdBy      String?           @map("created_by") // NEW: actor fields (HG-1)
  updatedBy      String?           @map("updated_by")
  deletedBy      String?           @map("deleted_by")
  createdAt      DateTime          @default(now()) @map("created_at")
  updatedAt      DateTime          @updatedAt @map("updated_at")
  deletedAt      DateTime?         @map("deleted_at")

  purchase       Purchase          @relation(fields: [purchaseId], references: [id])
  automations    Automation[]

  @@map("commercial_cycles")
}

model Automation {
  id             String             @id @default(cuid())
  uuid           String             @unique @default(uuid())
  organizationId String             @map("organization_id")
  campaignId     String?            @map("campaign_id")
  purchaseId     String             @map("purchase_id")
  commercialCycleId String?         @map("commercial_cycle_id")
  scheduledDate  DateTime           @map("scheduled_date")
  executedDate   DateTime?          @map("executed_date")
  status         AutomationStatus   @default(PENDING)
  priority       Int                @default(0)
  createdBy      String?            @map("created_by") // NEW: actor fields (HG-1)
  updatedBy      String?            @map("updated_by")
  deletedBy      String?            @map("deleted_by")
  createdAt      DateTime           @default(now()) @map("created_at")
  updatedAt      DateTime           @updatedAt @map("updated_at")
  deletedAt      DateTime?          @map("deleted_at")

  organization   Organization       @relation(fields: [organizationId], references: [id])
  campaign       Campaign?          @relation(fields: [campaignId], references: [id])
  purchase       Purchase           @relation(fields: [purchaseId], references: [id])
  commercialCycle CommercialCycle?  @relation(fields: [commercialCycleId], references: [id])
  messages       Message[]

  @@index([organizationId])
  @@index([purchaseId])
  @@index([scheduledDate])
  @@index([status])
  @@index([organizationId, status]) // NEW: list filter path (FR-006)
  @@map("automations")
}
```

## Migration SQL (review before apply)

```sql
-- AlterTable (additive, all nullable)
ALTER TABLE "commercial_cycles" ADD COLUMN "created_by" TEXT;
ALTER TABLE "commercial_cycles" ADD COLUMN "updated_by" TEXT;
ALTER TABLE "commercial_cycles" ADD COLUMN "deleted_by" TEXT;
ALTER TABLE "automations" ADD COLUMN "created_by" TEXT;
ALTER TABLE "automations" ADD COLUMN "updated_by" TEXT;
ALTER TABLE "automations" ADD COLUMN "deleted_by" TEXT;

-- CreateIndex
CREATE INDEX "automations_organization_id_status_idx" ON "automations"("organization_id", "status");
```

Notes:

- All added columns are nullable → zero impact on existing rows (no business data exists yet in these tables).
- No enum changes (R-002): `CommercialCycleStatus` and `AutomationStatus` already cover v1 + reserved states.
- Generation: `npx prisma migrate dev --create-only --name add_automations_v1_fields`, review SQL, apply with `npx prisma migrate dev`.

## Entity relationships

- `CommercialCycle.purchaseId` → `Purchase.id` (unique). The organization boundary is reached through `purchase.organizationId` (research R-005) — the cycle itself has no `organizationId` (schema.prisma:170-185, no change).
- `Automation.organizationId` → `Organization.id`; `Automation.purchaseId` → `Purchase.id`; `Automation.commercialCycleId` → `CommercialCycle.id` (nullable, set on creation).
- `createdBy/updatedBy/deletedBy` = TEXT user uuid, aligned with the Identity v1 audit model. Event-driven creation sets `createdBy = null` (system-triggered, research R-014); `organizationId` on Automation = purchase.organizationId.

## Invariants (04-domain-model.md:327-330)

- A Purchase initiates a single CommercialCycle (`purchaseId` unique).
- Only one CommercialCycle can be ACTIVE per purchase line — enforced by the AU-003 transactional flow (FR-003, research R-009): the previous ACTIVE cycle is CANCELLED before the new one is created.
- Automations belong to exactly one purchase (CP-003, `03:107-109`) and are linked to a cycle via `commercialCycleId`.