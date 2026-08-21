-- AlterTable
ALTER TABLE "public"."campaigns" ADD COLUMN     "follow_up_sequence_id" TEXT;

-- AlterTable
ALTER TABLE "public"."follow_up_sequence_stages" ADD COLUMN     "deleted_by" TEXT;

-- AddForeignKey
ALTER TABLE "public"."campaigns" ADD CONSTRAINT "campaigns_follow_up_sequence_id_fkey" FOREIGN KEY ("follow_up_sequence_id") REFERENCES "public"."follow_up_sequences"("id") ON DELETE SET NULL ON UPDATE CASCADE;
