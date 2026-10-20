-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "note_revisions" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "editor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "note_revisions_note_id_idx" ON "note_revisions"("note_id");

-- CreateIndex
CREATE INDEX "note_revisions_note_id_version_idx" ON "note_revisions"("note_id", "version");

-- AddForeignKey
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_editor_id_fkey" FOREIGN KEY ("editor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
