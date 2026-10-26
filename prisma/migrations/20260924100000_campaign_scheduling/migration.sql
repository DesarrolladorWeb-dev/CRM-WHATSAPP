-- Programacion real de campanas.
--
-- Hasta ahora la unica columna de fecha era `scheduled_date`, un TEXT libre
-- ("15 de marzo", "manana"). Con eso no se puede preguntar «que campanas
-- vencieron», que es exactamente por lo que ninguna campana programada salia
-- nunca: no existia nada que pudiera consultarlas.
--
-- Migracion aditiva: no toca ni borra `scheduled_date`, asi que las filas
-- actuales siguen mostrando lo que mostraban. No se intenta parsear el texto
-- viejo a fecha — adivinar zonas horarias e idiomas para luego ENVIAR mensajes
-- de verdad es justo el tipo de suposicion que no se debe automatizar. Las
-- campanas heredadas quedan con `scheduled_at` NULL y hay que reprogramarlas
-- a mano desde la interfaz.

-- AlterTable: momento real de lanzamiento, en UTC.
ALTER TABLE "campaigns" ADD COLUMN     "scheduled_at" TIMESTAMP(3);

-- CreateIndex: el worker corre esta consulta cada minuto
-- (status = 'scheduled' AND scheduled_at <= now()). Sin indice seria un
-- escaneo completo de la tabla 1.440 veces al dia.
CREATE INDEX "campaigns_status_scheduled_at_idx" ON "campaigns"("status", "scheduled_at");
