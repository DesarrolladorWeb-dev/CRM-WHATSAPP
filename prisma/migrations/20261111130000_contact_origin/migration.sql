ALTER TABLE "contacts" ADD COLUMN "origin" TEXT;

CREATE INDEX "contacts_origin_idx" ON "contacts"("origin");
