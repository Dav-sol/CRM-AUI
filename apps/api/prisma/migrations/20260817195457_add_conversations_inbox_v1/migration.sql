-- CreateTable
CREATE TABLE "public"."conversation_tags" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "conversation_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conversation_tag_assignments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "conversation_tag_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conversation_notes" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "conversation_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."quick_replies" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_tags_uuid_key" ON "public"."conversation_tags"("uuid");

-- CreateIndex
CREATE INDEX "conversation_tags_organization_id_idx" ON "public"."conversation_tags"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_tags_organization_id_name_key" ON "public"."conversation_tags"("organization_id", "name");

-- CreateIndex
CREATE INDEX "conversation_tag_assignments_conversation_id_idx" ON "public"."conversation_tag_assignments"("conversation_id");

-- CreateIndex
CREATE INDEX "conversation_tag_assignments_tag_id_idx" ON "public"."conversation_tag_assignments"("tag_id");

-- CreateIndex
CREATE INDEX "conversation_tag_assignments_organization_id_idx" ON "public"."conversation_tag_assignments"("organization_id");

-- CreateIndex
CREATE INDEX "conversation_tag_assignments_organization_id_tag_id_idx" ON "public"."conversation_tag_assignments"("organization_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_tag_assignments_conversation_id_tag_id_key" ON "public"."conversation_tag_assignments"("conversation_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_notes_uuid_key" ON "public"."conversation_notes"("uuid");

-- CreateIndex
CREATE INDEX "conversation_notes_conversation_id_created_at_idx" ON "public"."conversation_notes"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "conversation_notes_organization_id_idx" ON "public"."conversation_notes"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "quick_replies_uuid_key" ON "public"."quick_replies"("uuid");

-- CreateIndex
CREATE INDEX "quick_replies_organization_id_idx" ON "public"."quick_replies"("organization_id");

-- AddForeignKey
ALTER TABLE "public"."conversation_tags" ADD CONSTRAINT "conversation_tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_tag_assignments" ADD CONSTRAINT "conversation_tag_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_tag_assignments" ADD CONSTRAINT "conversation_tag_assignments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_tag_assignments" ADD CONSTRAINT "conversation_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."conversation_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_tag_assignments" ADD CONSTRAINT "conversation_tag_assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_notes" ADD CONSTRAINT "conversation_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_notes" ADD CONSTRAINT "conversation_notes_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_notes" ADD CONSTRAINT "conversation_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."quick_replies" ADD CONSTRAINT "quick_replies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."quick_replies" ADD CONSTRAINT "quick_replies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
