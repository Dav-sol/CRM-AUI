-- DropForeignKey
ALTER TABLE "public"."conversations" DROP CONSTRAINT "conversations_customer_id_fkey";

-- AlterTable
ALTER TABLE "public"."conversations" ALTER COLUMN "customer_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."messages" ADD COLUMN     "provider_conversation_id" TEXT,
ADD COLUMN     "provider_message_id" TEXT;

-- CreateIndex
CREATE INDEX "conversations_organization_id_status_idx" ON "public"."conversations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "messages_organization_id_status_idx" ON "public"."messages"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "messages_organization_id_provider_message_id_key" ON "public"."messages"("organization_id", "provider_message_id");

-- AddForeignKey
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;