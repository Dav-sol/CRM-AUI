# Imports v1 — Data Model

## Baseline

`model Import` already exists (schema.prisma:288-314, migration `20260810000529_add_domain_entities`). Imports v1 adds a **strictly additive** migration (HG-18/HG-5): no table drops, no column renames, no backfills of business data.

## Target schema (delta)

```prisma
model Import {
  id               String         @id @default(cuid())
  uuid             String         @unique @default(uuid())
  organizationId   String         @map("organization_id")
  userId           String         @map("user_id")
  type             ImportType
  fileName         String         @map("file_name")
  filePath         String         @map("file_path")
  fileHash         String?        @map("file_hash") // NEW: SHA-256 idempotency (HG-5)
  idempotencyKey   String?        @map("idempotency_key") // NEW: §19 replay (FR-005)
  status           ImportStatus   @default(PENDING)
  totalRecords     Int            @default(0) @map("total_records")
  processedRecords Int            @default(0) @map("processed_records")
  errorRecords     Int            @default(0) @map("error_records")
  errors           Json?
  startedAt        DateTime?      @map("started_at")
  completedAt      DateTime?      @map("completed_at")
  createdBy        String?        @map("created_by") // NEW: actor fields (HG-18)
  updatedBy        String?        @map("updated_by")
  deletedBy        String?        @map("deleted_by")
  createdAt        DateTime       @default(now()) @map("created_at")
  updatedAt        DateTime       @updatedAt @map("updated_at")
  deletedAt        DateTime?      @map("deleted_at")

  organization     Organization   @relation(fields: [organizationId], references: [id])
  user             User           @relation(fields: [userId], references: [id])

  @@index([organizationId])
  @@index([userId])
  @@index([status])
  @@index([organizationId, status]) // NEW: active-job path (FR-019)
  @@unique([organizationId, fileHash]) // NEW: duplicate-file 409 (FR-004)
  @@map("imports")
}
```

Enum change:

```prisma
enum ImportStatus {
  PENDING
  VALIDATING
  PROCESSING
  COMPLETED
  FAILED
  PARTIAL
  CANCELLED // NEW (FR-006)
}
```

## Migration SQL (review before apply)

```sql
-- AlterTable (additive, all nullable)
ALTER TABLE "imports" ADD COLUMN "created_by" TEXT;
ALTER TABLE "imports" ADD COLUMN "updated_by" TEXT;
ALTER TABLE "imports" ADD COLUMN "deleted_by" TEXT;
ALTER TABLE "imports" ADD COLUMN "file_hash" TEXT;
ALTER TABLE "imports" ADD COLUMN "idempotency_key" TEXT;

-- AlterEnum (R-018: needs PG >= 12 for in-transaction ADD VALUE)
ALTER TYPE "public"."ImportStatus" ADD VALUE 'CANCELLED';

-- CreateIndex
CREATE INDEX "imports_organization_id_status_idx" ON "imports"("organization_id", "status");
CREATE UNIQUE INDEX "imports_organization_id_file_hash_key" ON "imports"("organization_id", "file_hash");
```

Notes:

- All added columns are nullable → zero impact on existing rows.
- Unique index allows multiple NULL `file_hash` (Postgres treats NULLs as distinct) → no constraints on jobs created before this migration.
- `CANCELLED` is appended at the end of the enum → no ordinal shift of existing values (safe ALTER TYPE).
- Generation: `npx prisma migrate dev --create-only --name add_import_v1_fields`, review SQL, apply with `npx prisma migrate dev`.

## Entity relationships

- `Import.organizationId` → `Organization.id` (already present). Tenant boundary: every query scoped by organization.
- `Import.userId` → `User.id` (already present) — job creator.
- `createdBy/updatedBy/deletedBy` = TEXT user uuid (`uuid`), aligned with the Identity v1 audit model; `Import` is created with `createdBy = user.uuid`.

## Storage (non-DB)

- Files: `uploads/org-{organizationId}/<uuid>.<ext>` (HG-14). `uploads/` added to `.gitignore`.
- `filePath` is relative to the app root and NEVER serialized to API responses (NR-006).
- Retention: 30 days; purge hook exposed on the processor for the future scheduler (FR-023, HG-17).
