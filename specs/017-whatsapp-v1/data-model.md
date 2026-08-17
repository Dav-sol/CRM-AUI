# WhatsApp/Messaging v1 — Data Model

## Baseline

Models `Conversation` (schema.prisma:242-264) and `Message` (:266-293) already exist (migration `20260810000529_add_domain_entities`). WhatsApp/Messaging v1 adds a **strictly additive** migration (HG-8, HG-13): no table drops, no column renames, no enum changes, no backfills of business data.

## Target schema (delta)

```prisma
model Conversation {
  id             String             @id @default(cuid())
  uuid           String             @unique @default(uuid())
  organizationId String             @map("organization_id")
  customerId     String?            @map("customer_id") // NEW: nullable (HG-8) — unknown inbound numbers
  advisorId      String?            @map("advisor_id")
  channel        ChannelType
  status         ConversationStatus @default(OPEN)
  createdAt      DateTime           @default(now()) @map("created_at")
  updatedAt      DateTime           @updatedAt @map("updated_at")
  deletedAt      DateTime?          @map("deleted_at")

  organization   Organization       @relation(fields: [organizationId], references: [id])
  customer       Customer?          @relation(fields: [customerId], references: [id]) // NOW optional
  advisor        User?              @relation("ConversationAdvisor", fields: [advisorId], references: [id])
  messages       Message[]

  @@index([organizationId])
  @@index([customerId])
  @@index([advisorId])
  @@index([status])
  @@index([organizationId, status]) // NEW: list filter path (FR-007)
  @@map("conversations")
}

model Message {
  id                     String         @id @default(cuid())
  uuid                   String         @unique @default(uuid())
  organizationId         String         @map("organization_id")
  conversationId         String         @map("conversation_id")
  automationId           String?        @map("automation_id")
  type                   MessageType
  content                String
  direction              MessageDirection
  status                 MessageStatus  @default(QUEUED)
  providerMessageId      String?        @map("provider_message_id") // NEW (HG-13): idempotency backstop
  providerConversationId String?        @map("provider_conversation_id") // NEW (HG-13): reconciliation
  sentAt                 DateTime?      @map("sent_at")
  deliveredAt            DateTime?      @map("delivered_at")
  readAt                 DateTime?      @map("read_at")
  createdAt              DateTime       @default(now()) @map("created_at")
  updatedAt              DateTime       @updatedAt @map("updated_at")
  deletedAt              DateTime?      @map("deleted_at")

  organization           Organization   @relation(fields: [organizationId], references: [id])
  conversation           Conversation   @relation(fields: [conversationId], references: [id])
  automation             Automation?    @relation(fields: [automationId], references: [id])

  @@index([organizationId])
  @@index([conversationId])
  @@index([automationId])
  @@index([status])
  @@index([createdAt])
  @@unique([organizationId, providerMessageId]) // NEW (HG-13): inbound/status idempotency
  @@index([organizationId, status]) // NEW: list filter path (FR-009)
  @@map("messages")
}
```

## Migration SQL (review before apply)

```sql
-- AlterTable (additive; customer_id drops NOT NULL, no data loss)
ALTER TABLE "conversations" ALTER COLUMN "customer_id" DROP NOT NULL;

-- AlterTable (additive, all nullable)
ALTER TABLE "messages" ADD COLUMN "provider_message_id" TEXT;
ALTER TABLE "messages" ADD COLUMN "provider_conversation_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "messages_organization_id_provider_message_id_key"
  ON "messages"("organization_id", "provider_message_id");
CREATE INDEX "conversations_organization_id_status_idx"
  ON "conversations"("organization_id", "status");
CREATE INDEX "messages_organization_id_status_idx"
  ON "messages"("organization_id", "status");
```

Notes:

- `customer_id DROP NOT NULL` never violates existing rows (relaxing a constraint).
- All added columns nullable → zero impact on existing rows.
- No enum changes (R-002).
- Generation: `npx prisma migrate dev --create-only --name add_whatsapp_v1_fields`, review SQL, apply with `npx prisma migrate dev`.

## Entity relationships

- `Conversation.organizationId` → `Organization.id`; `Conversation.customerId` → `Customer.id` (nullable, HG-8); `Conversation.advisorId` → `User.id` (nullable, `ConversationAdvisor` relation).
- `Message.organizationId` → `Organization.id`; `Message.conversationId` → `Conversation.id` (NOT NULL — outbound auto-opens the conversation, R-010/C-05); `Message.automationId` → `Automation.id` (nullable, set for automatic messages).
- Unique `(organizationId, providerMessageId)` on Message = idempotency backstop (HG-13): replayed inbound webhooks/status callbacks hit P2002 → no-op, never 500 (NR-006, 07:375-379).
- `Conversation.customerId` nullable does not weaken the Aggregado Cliente (04:221-231): conversations without a customer are pending (to be linked when identified).

## Invariants

- A conversation belongs to exactly one organization (`organizationId`); it may have zero or one customer (HG-8), zero or one advisor, and many messages (CO-002, 03:304-308).
- Messages are never deleted (CO-004, 03:322-325); soft delete only (CO-003, CP-004).
- One OPEN conversation per customer per channel is the normal state; enforced by find-or-create inside a transaction (R-010), not by a DB constraint (multiple CLOSED/ARCHIVED allowed).
- AU-004/AU-011: an EXECUTED automation is never re-executed and never produces a second message — guarded by the `SCHEDULED → EXECUTED` single-row status transition (FR-002, NR-005) and, once created, the Message reference.
