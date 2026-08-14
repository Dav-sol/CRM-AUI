-- AlterEnum
ALTER TYPE "public"."ImportStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "public"."imports" ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "deleted_by" TEXT,
ADD COLUMN     "file_hash" TEXT,
ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "updated_by" TEXT;

-- CreateIndex
CREATE INDEX "imports_organization_id_status_idx" ON "public"."imports"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "imports_organization_id_file_hash_key" ON "public"."imports"("organization_id", "file_hash");