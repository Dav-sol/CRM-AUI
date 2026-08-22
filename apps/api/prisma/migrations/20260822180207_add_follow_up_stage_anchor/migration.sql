-- CreateEnum
CREATE TYPE "public"."FollowUpStageAnchor" AS ENUM ('PURCHASE_DATE', 'WARRANTY_EXPIRY');

-- AlterTable
ALTER TABLE "public"."follow_up_sequence_stages" ADD COLUMN     "anchor" "public"."FollowUpStageAnchor" NOT NULL DEFAULT 'WARRANTY_EXPIRY',
ADD COLUMN     "template_on_past" TEXT;
