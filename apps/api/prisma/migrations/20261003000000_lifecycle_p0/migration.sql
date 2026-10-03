-- Lifecycle postventa P0 (specs/025-lifecycle-postventa/spec.md)
--
-- Aditiva. No modifica ni borra filas existentes: las 27 compras y los 27
-- ciclos actuales quedan con installation_date = NULL, es decir FUERA del
-- lifecycle (§1 y gate G8). No se hace backfill.

-- AlterEnum: SKIPPED = hito vencido durante una pausa (§4.5). Distinto de
-- CANCELLED, que queda reservado para cancelación explícita.
ALTER TYPE "AutomationStatus" ADD VALUE 'SKIPPED';

-- CreateEnum
CREATE TYPE "ComplaintResolution" AS ENUM ('FALSE_ALARM', 'TECHNICAL_ISSUE_RESOLVED', 'BATTERY_REPLACED', 'DEFECTIVE_PRODUCT_RETURNED', 'DEFECTIVE_PRODUCT_REPLACED', 'UNRESOLVED_NO_CONTACT');

-- CreateEnum
CREATE TYPE "ComplaintOpenedBy" AS ENUM ('AUTO', 'ADVISOR');

-- CreateEnum
CREATE TYPE "ConsentScope" AS ENUM ('MAINTENEMENT');

-- CreateEnum
CREATE TYPE "ConsentDecision" AS ENUM ('GRANTED', 'REFUSED');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('INBOUND_MESSAGE', 'ADVISOR', 'IMPORT');

-- CreateEnum
CREATE TYPE "LifecyclePauseReason" AS ENUM ('HUMAN_ATTENTION', 'COMPLAINT', 'MANUAL');

-- CreateEnum
CREATE TYPE "LifecycleTerminationReason" AS ENUM ('BATTERY_REPLACED', 'DEFECTIVE_PRODUCT_RETURNED', 'DEFECTIVE_PRODUCT_REPLACED', 'COMPLAINT_CLOSED', 'OPT_OUT', 'MANUAL');

-- AlterTable: §1 fecha base del lifecycle. NULL = sin lifecycle.
ALTER TABLE "purchases" ADD COLUMN "installation_date" TIMESTAMP(3);

-- AlterTable: §4 pausa (G1), contadores de intento de negocio, §3 reseña única.
ALTER TABLE "commercial_cycles" ADD COLUMN "lifecycle_paused_at" TIMESTAMP(3),
ADD COLUMN "pause_reason" "LifecyclePauseReason",
ADD COLUMN "maintenance_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "review_requested_at" TIMESTAMP(3),
ADD COLUMN "maintenance_opt_out_at" TIMESTAMP(3),
ADD COLUMN "termination_reason" "LifecycleTerminationReason",
ADD COLUMN "terminated_at" TIMESTAMP(3);

-- CreateTable: reclamación como caso auditable (§6).
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_reason" TEXT NOT NULL,
    "opened_by" "ComplaintOpenedBy" NOT NULL,
    "detected_by" "ComplaintOpenedBy" NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolution" "ComplaintResolution",
    "resolution_notes" TEXT,
    "resolved_by" TEXT,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable: consentimiento auditable (§4.6). Ausencia = no consentido.
CREATE TABLE "lifecycle_consents" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "cycle_id" TEXT,
    "scope" "ConsentScope" NOT NULL,
    "decision" "ConsentDecision" NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" TEXT,
    "source" "ConsentSource" NOT NULL,
    "source_message_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lifecycle_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "complaints_uuid_key" ON "complaints"("uuid");
CREATE INDEX "complaints_organization_id_idx" ON "complaints"("organization_id");
CREATE INDEX "complaints_cycle_id_idx" ON "complaints"("cycle_id");
CREATE INDEX "complaints_organization_id_resolved_at_idx" ON "complaints"("organization_id", "resolved_at");

CREATE UNIQUE INDEX "lifecycle_consents_uuid_key" ON "lifecycle_consents"("uuid");
CREATE INDEX "lifecycle_consents_organization_id_customer_id_scope_idx" ON "lifecycle_consents"("organization_id", "customer_id", "scope");
CREATE INDEX "lifecycle_consents_organization_id_customer_id_scope_decide_idx" ON "lifecycle_consents"("organization_id", "customer_id", "scope", "decided_at");
CREATE INDEX "lifecycle_consents_cycle_id_idx" ON "lifecycle_consents"("cycle_id");

ALTER TABLE "complaints" ADD CONSTRAINT "complaints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "commercial_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lifecycle_consents" ADD CONSTRAINT "lifecycle_consents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lifecycle_consents" ADD CONSTRAINT "lifecycle_consents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lifecycle_consents" ADD CONSTRAINT "lifecycle_consents_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "commercial_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Índice que schema.prisma declara en channel_accounts desde el kit SMS
-- (kit 022) y que su migración no llegó a crear. Se añade aquí para que el
-- schema y el historial de migraciones converjan. Índice único sobre uuid,
-- sin.backfill ni cambio de datos.
CREATE UNIQUE INDEX "channel_accounts_uuid_key" ON "channel_accounts"("uuid");
