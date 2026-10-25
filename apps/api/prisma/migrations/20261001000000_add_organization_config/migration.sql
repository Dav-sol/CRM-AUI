-- CreateTable: configuración efectiva por organización
-- (specs/024-configuraciones-v1). Una fila por organización; las columnas
-- null significan "sin definir" y caen a la variable de entorno y después al
-- default del código. No contiene credenciales.
CREATE TABLE "public"."organization_configs" (
    "id" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "business_hours_enabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "business_days" TEXT[] DEFAULT ARRAY['MON', 'TUE', 'WED', 'THU', 'FRI']::TEXT[],
    "business_hours_start" INTEGER,
    "business_hours_end" INTEGER,
    "max_commercial_per_60d" INTEGER,
    "min_days_between_commercial" INTEGER,
    "quote_expiry_days" INTEGER,
    "whatsapp_message_cost" INTEGER,
    "whatsapp_message_cost_commercial" INTEGER,
    "sms_cost_per_segment" INTEGER,
    "sms_currency" TEXT,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "organization_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_configs_uuid_key" ON "public"."organization_configs"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "organization_configs_organization_id_key" ON "public"."organization_configs"("organization_id");

-- AddForeignKey
ALTER TABLE "public"."organization_configs" ADD CONSTRAINT "organization_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;