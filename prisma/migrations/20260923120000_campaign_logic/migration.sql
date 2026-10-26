-- Logica de campana: baja de difusion, ciclo de vida y tabla de destinatarios.
-- Migracion puramente aditiva: no modifica ni borra ninguna columna existente,
-- asi que los datos actuales de campanas y contactos se conservan intactos.

-- AlterTable: baja de difusion masiva por contacto.
ALTER TABLE "contacts" ADD COLUMN     "opted_out" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: marcas de tiempo del ciclo de vida de la campana.
ALTER TABLE "campaigns" ADD COLUMN     "launched_at" TIMESTAMP(3),
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "failure_reason" TEXT;

-- CreateTable: un destinatario = un intento de envio a un contacto.
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "address" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider_id" TEXT,
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaign_recipients_campaign_id_status_idx" ON "campaign_recipients"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "campaign_recipients_provider_id_idx" ON "campaign_recipients"("provider_id");

-- CreateIndex: la barrera fisica contra el doble envio. Un contacto no puede
-- aparecer dos veces en la misma campana, aunque el lanzamiento se repita.
CREATE UNIQUE INDEX "campaign_recipients_campaign_id_contact_id_key" ON "campaign_recipients"("campaign_id", "contact_id");

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
