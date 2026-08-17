# Conversations Inbox v1 — Data Model

## Baseline

Models `Conversation` (schema.prisma:242-265) and `Message` (:267-298) exist (kit 017, migration `add_domain_entities` + whatsapp v1 additions). `Conversation.advisorId` (nullable, relation `ConversationAdvisor`, index `[advisorId]`) and `ConversationStatus {OPEN, CLOSED, ARCHIVED}` are already in the schema but unused (deferred to kit 018, HG-5). `MessageType` already includes `OUTGOING` (:502-507), reserved in 017. Kit 018 adds a **strictly additive** migration (HG-2): new tables only — no column changes, no enum changes, no backfills of business data.

## Target schema (delta)

```prisma
model ConversationTag {
  id             String    @id @default(cuid())
  uuid           String    @unique @default(uuid())
  organizationId String    @map("organization_id")
  name           String
  color          String?   // hex "#RRGGBB"
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  deletedAt      DateTime? @map("deleted_at")

  organization   Organization               @relation(fields: [organizationId], references: [id])
  assignments    ConversationTagAssignment[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("conversation_tags")
}

model ConversationTagAssignment {
  id             String    @id @default(cuid())
  organizationId String    @map("organization_id")
  conversationId String    @map("conversation_id")
  tagId          String    @map("tag_id")
  createdById    String    @map("created_by_id")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  deletedAt      DateTime? @map("deleted_at")

  organization   Organization @relation(fields: [organizationId], references: [id])
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  tag            ConversationTag @relation(fields: [tagId], references: [id])
  createdBy      User         @relation(fields: [createdById], references: [id])

  @@unique([conversationId, tagId])
  @@index([conversationId])
  @@index([tagId])
  @@index([organizationId])
  @@index([organizationId, tagId]) // bandeja tagIds filter path (FR-001)
  @@map("conversation_tag_assignments")
}

model ConversationNote {
  id             String    @id @default(cuid())
  uuid           String    @unique @default(uuid())
  organizationId String    @map("organization_id")
  conversationId String    @map("conversation_id")
  userId         String    @map("user_id") // author
  content        String
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  deletedAt      DateTime? @map("deleted_at")

  organization   Organization @relation(fields: [organizationId], references: [id])
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  user           User         @relation(fields: [userId], references: [id])

  @@index([conversationId, createdAt])
  @@index([organizationId])
  @@map("conversation_notes")
}

model QuickReply {
  id             String    @id @default(cuid())
  uuid           String    @unique @default(uuid())
  organizationId String    @map("organization_id")
  title          String
  body           String
  createdById    String    @map("created_by_id")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  deletedAt      DateTime? @map("deleted_at")

  organization   Organization @relation(fields: [organizationId], references: [id])
  createdBy      User         @relation(fields: [createdById], references: [id])

  @@index([organizationId])
  @@map("quick_replies")
}
```

Back-relations added to existing models (no column changes):

```prisma
model Conversation {
  // ...existing fields (242-265) unchanged...
  notes         ConversationNote[]           // NEW back-relation
  tagAssignments ConversationTagAssignment[] // NEW back-relation
  @@map("conversations")
}
```

## Migration SQL (review before apply)

```sql
-- CreateTable (all new, additive; no existing table modified)
CREATE TABLE "conversation_tags" (
  "id" TEXT NOT NULL, "uuid" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
  "name" TEXT NOT NULL, "color" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, "deleted_at" TIMESTAMP(3),
  CONSTRAINT "conversation_tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "conversation_tags_uuid_key" ON "conversation_tags"("uuid");
CREATE UNIQUE INDEX "conversation_tags_organization_id_name_key" ON "conversation_tags"("organization_id", "name");
CREATE INDEX "conversation_tags_organization_id_idx" ON "conversation_tags"("organization_id");

CREATE TABLE "conversation_tag_assignments" (
  "id" TEXT NOT NULL, "organization_id" TEXT NOT NULL, "conversation_id" TEXT NOT NULL,
  "tag_id" TEXT NOT NULL, "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, "deleted_at" TIMESTAMP(3),
  CONSTRAINT "conversation_tag_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "conversation_tag_assignments_conversation_id_tag_id_key"
  ON "conversation_tag_assignments"("conversation_id", "tag_id");
CREATE INDEX "conversation_tag_assignments_conversation_id_idx" ON "conversation_tag_assignments"("conversation_id");
CREATE INDEX "conversation_tag_assignments_tag_id_idx" ON "conversation_tag_assignments"("tag_id");
CREATE INDEX "conversation_tag_assignments_organization_id_idx" ON "conversation_tag_assignments"("organization_id");
CREATE INDEX "conversation_tag_assignments_organization_id_tag_id_idx"
  ON "conversation_tag_assignments"("organization_id", "tag_id");

CREATE TABLE "conversation_notes" (
  "id" TEXT NOT NULL, "uuid" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "content" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, "deleted_at" TIMESTAMP(3),
  CONSTRAINT "conversation_notes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "conversation_notes_uuid_key" ON "conversation_notes"("uuid");
CREATE INDEX "conversation_notes_conversation_id_created_at_idx" ON "conversation_notes"("conversation_id", "created_at");
CREATE INDEX "conversation_notes_organization_id_idx" ON "conversation_notes"("organization_id");

CREATE TABLE "quick_replies" (
  "id" TEXT NOT NULL, "uuid" TEXT NOT NULL, "organization_id" TEXT NOT NULL,
  "title" TEXT NOT NULL, "body" TEXT NOT NULL, "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, "deleted_at" TIMESTAMP(3),
  CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "quick_replies_uuid_key" ON "quick_replies"("uuid");
CREATE INDEX "quick_replies_organization_id_idx" ON "quick_replies"("organization_id");

-- AddForeignKey (no column changes)
ALTER TABLE "conversation_tag_assignments" ADD CONSTRAINT "conversation_tag_assignments_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_tag_assignments" ADD CONSTRAINT "conversation_tag_assignments_tag_id_fkey"
  FOREIGN KEY ("tag_id") REFERENCES "conversation_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_tag_assignments" ADD CONSTRAINT "conversation_tag_assignments_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

Notes:

- All tables new → zero impact on existing rows.
- `@@unique([organizationId, name])` on `ConversationTag` keeps the catalog consistent; duplicate → `409 TAG_NAME_EXISTS`.
- `@@unique([conversationId, tagId])` on assignments is the idempotency backstop (P2002 → no-op, CO-003, FR-011). Delete = set `deleted_at` (soft delete, never hard-delete). Because the unique constraint prevents re-creating a pair that has a soft-deleted row, re-adding a removed tag **revives** the existing row (`updateMany` setting `deleted_at = null`) instead of creating a new one; active assignments are always unique per (conversation, tag).
- No enum changes (R-002 precedent): `MessageType.OUTGOING` already exists.
- Generation: `npx prisma migrate dev --create-only --name add_conversations_inbox_v1`, review SQL, apply with `npx prisma migrate dev`.

## Entity relationships

- `ConversationTag.organizationId` → `Organization.id`; assignments M2M `Conversation ↔ ConversationTag` via `ConversationTagAssignment` (with `createdById` → `User.id`).
- `ConversationNote.organizationId` → `Organization.id`; `ConversationNote.conversationId` → `Conversation.id` (NOT NULL); `ConversationNote.userId` → `User.id` (author, NOT NULL).
- `QuickReply.organizationId` → `Organization.id`; `QuickReply.createdById` → `User.id`.
- `Conversation.advisorId` → `User.id` (nullable, `ConversationAdvisor` relation) — already present, now written by assignment/transfer (HG-4).

## Invariants

- Every inbox row belongs to exactly one organization; catalog rows (`ConversationTag`, `QuickReply`) are org-scoped by `organizationId`; assignments/notes inherit the conversation's organization (cross-tenant write → 404/400, Q11).
- Records are never physically deleted (CO-003, FR-011): soft-delete only on tags, assignments, notes, quick replies. Deleting a tag soft-deletes its active assignments.
- Assignment is metadata (`advisorId`), not a state: assign/transfer never changes `ConversationStatus` (Q2).
- One active assignment per `(conversationId, tagId)`; the unique constraint + P2002 → no-op on re-assign, never 500 (NR-005, 07:375-379).
- Notes are append-only (HG-2): create + list; no edit/delete endpoints in v1. Content is historical, may contain PII → never logged, never in events (NR-009).
- Reply transaction: message creation + reopen transition atomic (NR-004); reopen only `CLOSED → OPEN` (ARCHIVED → 400, HG-5).