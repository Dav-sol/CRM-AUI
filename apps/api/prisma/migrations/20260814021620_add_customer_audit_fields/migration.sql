-- AlterTable
ALTER TABLE "public"."customers" ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "deleted_by" TEXT,
ADD COLUMN     "updated_by" TEXT;

-- CreateIndex
CREATE INDEX "customers_organization_id_status_idx" ON "public"."customers"("organization_id", "status");

-- CreateIndex
CREATE INDEX "customers_organization_id_created_at_idx" ON "public"."customers"("organization_id", "created_at");
