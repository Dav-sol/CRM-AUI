-- AlterTable
ALTER TABLE "public"."products" ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "deleted_by" TEXT,
ADD COLUMN     "updated_by" TEXT;

-- CreateIndex
CREATE INDEX "products_organization_id_status_idx" ON "public"."products"("organization_id", "status");
