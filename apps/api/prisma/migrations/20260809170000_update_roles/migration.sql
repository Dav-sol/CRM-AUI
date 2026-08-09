-- CreateEnum
CREATE TYPE "public"."RoleType_new" AS ENUM ('ADMINISTRADOR', 'GERENTE', 'ASESOR');

-- AlterTable
ALTER TABLE "public"."Role" ALTER COLUMN "name" TYPE "public"."RoleType_new" USING "name"::text::"public"."RoleType_new";

-- DropEnum
DROP TYPE "public"."RoleType";

-- RenameEnum
ALTER TYPE "public"."RoleType_new" RENAME TO "RoleType";