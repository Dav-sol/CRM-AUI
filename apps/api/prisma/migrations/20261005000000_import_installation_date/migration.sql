-- Importación UAT: permitir que una fila de compra sin columna de instalación
-- tome `purchase_date` como `installation_date`, SOLO para ese job.
--
-- Alcance deliberadamente estrecho. La equivalencia purchaseDate =
-- installationDate está validada únicamente para los datos históricos de
-- Baterías del Caribe de esta UAT, no es una regla del dominio: por eso el
-- opt-in vive en el job de importación y no en la organización, ni en el
-- tipo de importación, ni como valor por defecto.
--
-- Con `false` (por defecto) el comportamiento no cambia: `installation_date`
-- queda NULL y la compra no entra al lifecycle (gate G8).
ALTER TABLE "imports"
  ADD COLUMN "installation_from_purchase_date" BOOLEAN NOT NULL DEFAULT false;