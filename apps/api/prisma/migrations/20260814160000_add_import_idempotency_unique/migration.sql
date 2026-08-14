-- CreateIndex
CREATE UNIQUE INDEX "imports_organization_id_user_id_idempotency_key_key" ON "public"."imports"("organization_id", "user_id", "idempotency_key");
