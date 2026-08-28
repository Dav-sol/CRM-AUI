-- CreateEnum
CREATE TYPE "public"."QuoteStatus" AS ENUM ('DRAFT', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'VENCIDA');

-- AlterTable
ALTER TABLE "public"."purchases" ADD COLUMN     "quote_id" TEXT;

-- CreateTable
CREATE TABLE "public"."quotes" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "customer_id" TEXT,
    "campaign_id" TEXT,
    "product_id" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "value" DECIMAL(12,2) NOT NULL,
    "status" "public"."QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "purchase_id" TEXT,
    "note" TEXT,
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotes_uuid_key" ON "public"."quotes"("uuid");

-- CreateIndex
CREATE INDEX "quotes_organization_id_idx" ON "public"."quotes"("organization_id");

-- CreateIndex
CREATE INDEX "quotes_customer_id_idx" ON "public"."quotes"("customer_id");

-- CreateIndex
CREATE INDEX "quotes_conversation_id_idx" ON "public"."quotes"("conversation_id");

-- CreateIndex
CREATE INDEX "quotes_campaign_id_idx" ON "public"."quotes"("campaign_id");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "public"."quotes"("status");
