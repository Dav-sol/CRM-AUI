-- AlterTable
ALTER TABLE "public"."messages" ADD COLUMN     "in_reply_to_automation_id" TEXT,
ADD COLUMN     "in_reply_to_campaign_id" TEXT;

-- AlterTable
ALTER TABLE "public"."purchases" ADD COLUMN     "source_conversation_id" TEXT;
