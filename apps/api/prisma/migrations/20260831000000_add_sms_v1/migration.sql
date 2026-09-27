-- CreateEnum
CREATE TYPE "ChannelProvider" AS ENUM ('NULL', 'TWILIO', 'VONAGE', 'BIRD', 'INFOBIP', 'HABLAME', 'META', 'PANCAKE');

-- CreateEnum
CREATE TYPE "ChannelAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "PurchaseSource" AS ENUM ('CRM', 'SOCIAL_WHATSAPP');

-- AlterEnum: Add SMS to ChannelType
ALTER TYPE "ChannelType" ADD VALUE 'SMS';

-- CreateTable: channel_accounts
CREATE TABLE "channel_accounts" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "provider" "ChannelProvider" NOT NULL,
    "label" TEXT NOT NULL,
    "phone_number" TEXT,
    "sender_id" TEXT,
    "status" "ChannelAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_default_for_channel" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "channel_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_accounts_organization_id_channel_provider_sender_id_key" ON "channel_accounts"("organization_id", "channel", "provider", "sender_id");
CREATE INDEX "channel_accounts_organization_id_idx" ON "channel_accounts"("organization_id");
CREATE INDEX "channel_accounts_organization_id_channel_idx" ON "channel_accounts"("organization_id", "channel");

-- AddForeignKey: channel_accounts -> organizations
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: campaigns
ALTER TABLE "campaigns" ADD COLUMN "channel" "ChannelType" NOT NULL DEFAULT 'WHATSAPP_CLIENTS';
ALTER TABLE "campaigns" ADD COLUMN "channel_account_id" TEXT;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: automations
ALTER TABLE "automations" ADD COLUMN "channel" "ChannelType" NOT NULL DEFAULT 'WHATSAPP_CLIENTS';
ALTER TABLE "automations" ADD COLUMN "channel_account_id" TEXT;
ALTER TABLE "automations" ADD CONSTRAINT "automations_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: purchases
ALTER TABLE "purchases" ADD COLUMN "source" "PurchaseSource" NOT NULL DEFAULT 'CRM';

-- AlterTable: messages — make conversationId nullable + add new columns
ALTER TABLE "messages" DROP CONSTRAINT "messages_conversation_id_fkey";
ALTER TABLE "messages" ALTER COLUMN "conversation_id" DROP NOT NULL;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "messages" ADD COLUMN "customer_id" TEXT;
ALTER TABLE "messages" ADD COLUMN "channel" "ChannelType";
ALTER TABLE "messages" ADD COLUMN "channel_account_id" TEXT;
ALTER TABLE "messages" ADD COLUMN "provider" TEXT;
ALTER TABLE "messages" ADD COLUMN "estimated_cost" DECIMAL(10, 4);
ALTER TABLE "messages" ADD COLUMN "actual_cost" DECIMAL(10, 4);
ALTER TABLE "messages" ADD COLUMN "currency" VARCHAR(3);
ALTER TABLE "messages" ADD COLUMN "segment_count" INTEGER;
ALTER TABLE "messages" ADD COLUMN "failure_reason" TEXT;

-- AddForeignKey: messages -> customers
ALTER TABLE "messages" ADD CONSTRAINT "messages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: messages -> channel_accounts
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: messages
CREATE INDEX "messages_customer_id_idx" ON "messages"("customer_id");
CREATE INDEX "messages_channel_idx" ON "messages"("channel");

-- Backfill existing messages
UPDATE "messages" SET "channel" = 'WHATSAPP_CLIENTS' WHERE "channel" IS NULL;
UPDATE "messages" m SET "customer_id" = c."customer_id" FROM "conversations" c WHERE m."conversation_id" = c."id" AND m."customer_id" IS NULL AND c."customer_id" IS NOT NULL;
