-- CreateTable
CREATE TABLE "public"."follow_up_sequences" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "warranty_months" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "follow_up_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."follow_up_sequence_stages" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "sequence_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "offset_days" INTEGER NOT NULL,
    "template" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "follow_up_sequence_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "follow_up_sequences_uuid_key" ON "public"."follow_up_sequences"("uuid");

-- CreateIndex
CREATE INDEX "follow_up_sequences_organization_id_idx" ON "public"."follow_up_sequences"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "follow_up_sequence_stages_uuid_key" ON "public"."follow_up_sequence_stages"("uuid");

-- CreateIndex
CREATE INDEX "follow_up_sequence_stages_sequence_id_idx" ON "public"."follow_up_sequence_stages"("sequence_id");

-- AddForeignKey
ALTER TABLE "public"."follow_up_sequences" ADD CONSTRAINT "follow_up_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."follow_up_sequence_stages" ADD CONSTRAINT "follow_up_sequence_stages_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "public"."follow_up_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
