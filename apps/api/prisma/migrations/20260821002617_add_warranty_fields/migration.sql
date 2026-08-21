-- AlterTable
ALTER TABLE "public"."products" ADD COLUMN     "warranty_months" INTEGER;

-- AlterTable
ALTER TABLE "public"."purchases" ADD COLUMN     "warranty_expires_at" TIMESTAMP(3);
