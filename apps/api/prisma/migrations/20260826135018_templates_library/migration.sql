-- CreateEnum
CREATE TYPE "public"."TemplateCategory" AS ENUM ('CAMPAIGN', 'FOLLOW_UP', 'QUICK_REPLY');

-- CreateEnum
CREATE TYPE "public"."TemplateTone" AS ENUM ('PROFESSIONAL', 'CARIBE_COMMERCIAL', 'CARIBE_AUTHENTIC');

-- CreateEnum
CREATE TYPE "public"."TemplateAngle" AS ENUM ('TRUST', 'PREVENTION', 'REPURCHASE', 'LOYALTY', 'CONVERSATION', 'CALM');

-- CreateTable
CREATE TABLE "public"."templates" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "group" TEXT,
    "category" "public"."TemplateCategory" NOT NULL DEFAULT 'CAMPAIGN',
    "tone" "public"."TemplateTone" NOT NULL DEFAULT 'PROFESSIONAL',
    "angle" "public"."TemplateAngle" NOT NULL,
    "goal" TEXT,
    "recommended_use" TEXT,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "templates_uuid_key" ON "public"."templates"("uuid");

-- CreateIndex
CREATE INDEX "templates_organization_id_idx" ON "public"."templates"("organization_id");

-- CreateIndex
CREATE INDEX "templates_organization_id_category_idx" ON "public"."templates"("organization_id", "category");

-- AddForeignKey
ALTER TABLE "public"."templates" ADD CONSTRAINT "templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
