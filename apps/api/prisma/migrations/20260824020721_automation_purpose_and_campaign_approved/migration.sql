-- CreateEnum
CREATE TYPE "public"."AutomationPurpose" AS ENUM ('TRANSACTIONAL', 'COMMERCIAL');

-- AlterEnum
ALTER TYPE "public"."CampaignStatus" ADD VALUE 'APPROVED';

-- AlterTable
ALTER TABLE "public"."automations" ADD COLUMN     "purpose" "public"."AutomationPurpose" NOT NULL DEFAULT 'TRANSACTIONAL';
