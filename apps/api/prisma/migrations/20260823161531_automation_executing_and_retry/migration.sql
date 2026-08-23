-- AlterEnum
ALTER TYPE "public"."AutomationStatus" ADD VALUE 'EXECUTING';

-- AlterTable
ALTER TABLE "public"."automations" ADD COLUMN     "retry_count" INTEGER NOT NULL DEFAULT 0;
