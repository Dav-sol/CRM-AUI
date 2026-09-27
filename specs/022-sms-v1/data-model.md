# SMS v1 — Data Model

## Baseline

Current models: Organization, Customer, Purchase, Campaign, FollowUpSequence, FollowUpSequenceStage, Automation, Conversation, Message (24 models total in `schema.prisma`). Key enums: `ChannelType { WHATSAPP_CLIENTS, WHATSAPP_SOCIAL }`, `MessageStatus { QUEUED, SENT, DELIVERED, READ, FAILED }`, `AutomationPurpose { TRANSACTIONAL, COMMERCIAL }`.

## Delta: New Models

### ChannelAccount

```prisma
model ChannelAccount {
  id                  String              @id @default(cuid())
  uuid                String              @unique @default(uuid())
  organizationId      String              @map("organization_id")
  channel             ChannelType
  provider            ChannelProvider
  label               String              // human-readable name ("SMS Háblame", "WhatsApp Redes")
  phoneNumber         String?             @map("phone_number") // E.164 format if applicable
  senderId            String?             @map("sender_id")   // alphanumeric sender or short code
  status              ChannelAccountStatus @default(ACTIVE)
  isDefaultForChannel Boolean             @default(false) @map("is_default_for_channel")
  metadata            Json?               // provider-specific config (not secrets; secrets via env only)
  createdAt           DateTime            @default(now()) @map("created_at")
  updatedAt           DateTime            @updatedAt @map("updated_at")
  deletedAt           DateTime?           @map("deleted_at")

  organization Organization @relation(fields: [organizationId], references: [id])
  messages     Message[]
  automations  Automation[]

  @@unique([organizationId, channel, provider, senderId])
  @@index([organizationId])
  @@index([organizationId, channel])
  @@map("channel_accounts")
}
```

### New Enums

```prisma
enum ChannelType {
  WHATSAPP_CLIENTS
  WHATSAPP_SOCIAL
  SMS
}

enum ChannelProvider {
  NULL        // dev/sandbox
  TWILIO
  VONAGE
  BIRD        // MessageBird
  INFOBIP
  HABLAME     // local Colombia
  META        // WhatsApp Cloud API
  PANCAKE
}

enum ChannelAccountStatus {
  ACTIVE
  SUSPENDED
  DISABLED
}

enum PurchaseSource {
  CRM
  SOCIAL_WHATSAPP
}
```

## Delta: Modified Models

### Campaign (additive columns)

```prisma
model Campaign {
  // ...existing fields unchanged...
  channel          ChannelType     @default(WHATSAPP_CLIENTS)
  channelAccountId String?         @map("channel_account_id")

  channelAccount ChannelAccount?  @relation(fields: [channelAccountId], references: [id])

  @@index([organizationId])
  @@map("campaigns")
}
```

### Automation (additive columns)

```prisma
model Automation {
  // ...existing fields unchanged...
  channel          ChannelType     @default(WHATSAPP_CLIENTS)
  channelAccountId String?         @map("channel_account_id")

  channelAccount ChannelAccount?  @relation(fields: [channelAccountId], references: [id])

  @@index([organizationId])
  @@map("automations")
}
```

### Message (nullable + new columns)

```prisma
model Message {
  // ...existing fields...
  conversationId         String?          @map("conversation_id")  // NULLABLE (was NOT NULL)
  customerId             String?          @map("customer_id")      // NEW: direct link for SMS
  channel                ChannelType?     // NEW: denormalized for query
  channelAccountId       String?          @map("channel_account_id")
  provider               String?          @map("provider")         // ChannelProvider value
  estimatedCost          Decimal?         @db.Decimal(10, 4)
  actualCost             Decimal?         @db.Decimal(10, 4)
  currency               String?          @db.VarChar(3)
  segmentCount           Int?             @map("segment_count")
  failureReason          String?          @map("failure_reason")

  customer       Customer?        @relation(fields: [customerId], references: [id])
  channelAccount ChannelAccount?  @relation(fields: [channelAccountId], references: [id])

  @@unique([organizationId, providerMessageId])
  @@index([organizationId])
  @@index([conversationId])
  @@index([automationId])
  @@index([customerId])
  @@index([status])
  @@index([channel])
  @@index([createdAt])
  @@index([organizationId, status])
  @@map("messages")
}
```

### Purchase (additive column)

```prisma
model Purchase {
  // ...existing fields unchanged...
  source PurchaseSource @default(CRM) @map("source")

  @@unique([organizationId, invoiceNumber, customerId, productId, purchaseDate])
  @@index([organizationId])
  @@index([customerId])
  @@index([purchaseDate])
  @@index([invoiceNumber])
  @@index([organizationId, status])
  @@index([organizationId, purchaseDate])
  @@map("purchases")
}
```

## Migration SQL (review before apply)

```sql
-- 1. New enum: ChannelProvider
CREATE TYPE "ChannelProvider" AS ENUM ('NULL', 'TWILIO', 'VONAGE', 'BIRD', 'INFOBIP', 'HABLAME', 'META', 'PANCAKE');

-- 2. New enum: ChannelAccountStatus
CREATE TYPE "ChannelAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- 3. New enum: PurchaseSource
CREATE TYPE "PurchaseSource" AS ENUM ('CRM', 'SOCIAL_WHATSAPP');

-- 4. Extend ChannelType enum (add SMS)
ALTER TYPE "ChannelType" ADD VALUE 'SMS';

-- 5. Create channel_accounts table
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
CREATE UNIQUE INDEX "channel_accounts_organization_id_channel_provider_sender_id_key" ON "channel_accounts"("organization_id", "channel", "provider", "sender_id");
CREATE INDEX "channel_accounts_organization_id_idx" ON "channel_accounts"("organization_id");
CREATE INDEX "channel_accounts_organization_id_channel_idx" ON "channel_accounts"("organization_id", "channel");
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Add channel + channelAccountId to campaigns
ALTER TABLE "campaigns" ADD COLUMN "channel" "ChannelType" NOT NULL DEFAULT 'WHATSAPP_CLIENTS';
ALTER TABLE "campaigns" ADD COLUMN "channel_account_id" TEXT;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Add channel + channelAccountId to automations
ALTER TABLE "automations" ADD COLUMN "channel" "ChannelType" NOT NULL DEFAULT 'WHATSAPP_CLIENTS';
ALTER TABLE "automations" ADD COLUMN "channel_account_id" TEXT;
ALTER TABLE "automations" ADD CONSTRAINT "automations_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 8. Add source to purchases
ALTER TABLE "purchases" ADD COLUMN "source" "PurchaseSource" NOT NULL DEFAULT 'CRM';
-- No backfill needed: default CRM applies to all existing rows.

-- 9. Add new columns to messages
ALTER TABLE "messages" ADD COLUMN "customer_id" TEXT;
ALTER TABLE "messages" ADD COLUMN "channel" "ChannelType";
ALTER TABLE "messages" ADD COLUMN "channel_account_id" TEXT;
ALTER TABLE "messages" ADD COLUMN "provider" TEXT;
ALTER TABLE "messages" ADD COLUMN "estimated_cost" DECIMAL(10, 4);
ALTER TABLE "messages" ADD COLUMN "actual_cost" DECIMAL(10, 4);
ALTER TABLE "messages" ADD COLUMN "currency" VARCHAR(3);
ALTER TABLE "messages" ADD COLUMN "segment_count" INTEGER;
ALTER TABLE "messages" ADD COLUMN "failure_reason" TEXT;

-- 10. Make conversationId nullable on messages
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_conversation_id_fkey";
ALTER TABLE "messages" ALTER COLUMN "conversation_id" DROP NOT NULL;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 11. Add foreign keys for new message columns
ALTER TABLE "messages" ADD CONSTRAINT "messages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 12. Backfill existing messages: channel = WHATSAPP_CLIENTS, customerId from conversation
UPDATE "messages" SET "channel" = 'WHATSAPP_CLIENTS' WHERE "channel" IS NULL;
UPDATE "messages" m SET "customer_id" = c."customer_id" FROM "conversations" c WHERE m."conversation_id" = c."id" AND m."customer_id" IS NULL AND c."customer_id" IS NOT NULL;

-- 13. Add indexes
CREATE INDEX "messages_customer_id_idx" ON "messages"("customer_id");
CREATE INDEX "messages_channel_idx" ON "messages"("channel");
```

## Notes

- All new columns are nullable or have safe defaults → zero impact on existing rows.
- `conversationId` nullable change is the only schema-level modification to existing behavior; existing WhatsApp messages retain their conversation links.
- `ChannelAccount` is seeded from env/config in V1 (no full CRUD API); full management deferred to V2.
- `Purchase.source` default `CRM` means all existing purchases automatically get `CRM` with no data migration risk.
- `SmsProvider` implementations must NOT store secrets in `ChannelAccount.metadata`; secrets go in env vars only.

## Entity Relationships (V1 additions)

```
Organization 1──N ChannelAccount
ChannelAccount 1──N Message (optional)
ChannelAccount 1──N Automation (optional)
Campaign N──1 ChannelAccount (optional)
Automation N──1 ChannelAccount (optional)
Message N──1 Customer (optional, new direct link)
Message N──1 ChannelAccount (optional)
Purchase.source → PurchaseSource enum
```

## Invariants

- Every `ChannelAccount` belongs to exactly one `Organization`.
- `ChannelAccount` uniqueness per `[organizationId, channel, provider, senderId]` (senderId nullable: PostgreSQL treats NULLs as distinct in unique constraints, allowing multiple accounts with `senderId=NULL` per org/channel/provider).
- `Message.customerId` is set for SMS messages (linked via automation → purchase → customer); for WhatsApp, resolved via `conversation.customerId` as before.
- `Message.channel` is snapshot from `Automation.channel` at execution time.
- `Campaign.channel` is immutable while ACTIVE (same guard as existing fields).
