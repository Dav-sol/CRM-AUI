-- AlterTable
ALTER TABLE "public"."campaigns" ADD COLUMN     "segment" JSONB,
ADD COLUMN     "start_at" TIMESTAMP(3);
