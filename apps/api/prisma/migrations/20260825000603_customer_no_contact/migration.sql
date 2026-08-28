-- AlterTable
ALTER TABLE "public"."customers" ADD COLUMN     "no_contact_at" TIMESTAMP(3),
ADD COLUMN     "no_contact_reason" TEXT;
