-- AlterTable
ALTER TABLE "public"."purchases" ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "updated_by" TEXT;

-- CreateIndex
CREATE INDEX "purchases_organization_id_status_idx" ON "public"."purchases"("organization_id", "status");

-- CreateIndex
CREATE INDEX "purchases_organization_id_purchase_date_idx" ON "public"."purchases"("organization_id", "purchase_date");
