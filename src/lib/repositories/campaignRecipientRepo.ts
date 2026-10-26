import type { PrismaClient } from '../../generated/prisma/client';
import type { RecipientStatus } from '@/types';
import type { AudienceContact } from '@/lib/services/audienceService';

/**
 * Acceso a la tabla de destinatarios (`campaign_recipients`).
 *
 * Esta tabla es la fuente de verdad de una campana: quien entro, a que
 * direccion, si salio, si llego y si fallo. Los contadores de `campaigns` son
 * solo una copia agregada para poder listar sin sumar fila a fila.
 */

/** Metricas reales de una campana, calculadas contando destinatarios. */
export interface CampaignMetrics {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  skipped: number;
  /** Porcentajes sobre la base correcta de cada indicador. */
  deliveryRate: number;
  openRate: number;
}

/**
 * Materializa la audiencia como filas `pending`.
 *
 * `skipDuplicates` se apoya en el indice unico (campaignId, contactId): si la
 * campana se lanza dos veces por un doble clic o un reintento, la segunda
 * llamada no crea nada nuevo en lugar de duplicar los envios. Devuelve cuantas
 * filas se crearon realmente.
 */
export async function materializeRecipients(
  db: PrismaClient,
  campaignId: string,
  channel: string,
  contacts: AudienceContact[]
): Promise<number> {
  if (contacts.length === 0) return 0;

  const res = await db.campaignRecipient.createMany({
    data: contacts.map((c) => ({
      campaignId,
      contactId: c.id,
      channel,
      address: c.address,
      status: 'pending',
    })),
    skipDuplicates: true,
  });

  return res.count;
}

/** Destinatarios pendientes de enviar, en lotes para no cargar todo en memoria. */
export async function takePending(
  db: PrismaClient,
  campaignId: string,
  limit: number
): Promise<
  Array<{ id: string; contactId: string; address: string; contactName: string; company: string | null }>
> {
  const filas = await db.campaignRecipient.findMany({
    where: { campaignId, status: 'pending' },
    take: limit,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      contactId: true,
      address: true,
      contact: { select: { name: true, company: true } },
    },
  });

  return filas.map((f) => ({
    id: f.id,
    contactId: f.contactId,
    address: f.address,
    contactName: f.contact.name,
    company: f.contact.company,
  }));
}

/** Marca un destinatario como enviado, guardando el id del proveedor. */
export async function markSent(
  db: PrismaClient,
  recipientId: string,
  providerId?: string
): Promise<void> {
  await db.campaignRecipient.update({
    where: { id: recipientId },
    data: { status: 'sent', providerId: providerId ?? null, sentAt: new Date(), error: null },
  });
}

/** Marca un destinatario como fallido o saltado, con el motivo. */
export async function markNotSent(
  db: PrismaClient,
  recipientId: string,
  status: Extract<RecipientStatus, 'failed' | 'skipped'>,
  error: string
): Promise<void> {
  await db.campaignRecipient.update({
    where: { id: recipientId },
    // El error se recorta: un stack trace completo del proveedor no aporta
    // nada en una tabla que puede tener miles de filas.
    data: { status, error: error.slice(0, 500) },
  });
}

/**
 * Aplica un acuse de recibo del proveedor (webhook de entrega o lectura).
 *
 * Solo avanza: un 'delivered' que llega despues de un 'read' (los webhooks no
 * garantizan orden) no puede hacer retroceder el estado.
 */
export async function applyDeliveryReceipt(
  db: PrismaClient,
  providerId: string,
  estado: Extract<RecipientStatus, 'delivered' | 'read' | 'failed'>,
  error?: string
): Promise<boolean> {
  const fila = await db.campaignRecipient.findFirst({
    where: { providerId },
    select: { id: true, status: true },
  });
  if (!fila) return false;

  const ORDEN: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 };
  if (estado !== 'failed' && (ORDEN[estado] ?? 0) <= (ORDEN[fila.status] ?? 0)) {
    return false;
  }

  await db.campaignRecipient.update({
    where: { id: fila.id },
    data: {
      status: estado,
      ...(estado === 'delivered' ? { deliveredAt: new Date() } : {}),
      ...(estado === 'read' ? { readAt: new Date() } : {}),
      ...(error ? { error: error.slice(0, 500) } : {}),
    },
  });

  return true;
}

/** Cuenta los destinatarios de una campana agrupados por estado. */
export async function computeMetrics(
  db: PrismaClient,
  campaignId: string
): Promise<CampaignMetrics> {
  const grupos = await db.campaignRecipient.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { _all: true },
  });

  const n = (estado: string) =>
    grupos.find((g) => g.status === estado)?._count._all ?? 0;

  const pending = n('pending');
  const sentOnly = n('sent');
  const delivered = n('delivered');
  const read = n('read');
  const failed = n('failed');
  const skipped = n('skipped');

  // Un mensaje leido tambien fue entregado y enviado: los estados son
  // acumulativos, no excluyentes. Contarlos por separado daria «enviados: 3»
  // en una campana de 10 que llegaron todas.
  const sent = sentOnly + delivered + read;
  const deliveredTotal = delivered + read;

  const pct = (parte: number, base: number) =>
    base > 0 ? Math.round((parte / base) * 1000) / 10 : 0;

  return {
    total: pending + sent + failed + skipped,
    pending,
    sent,
    delivered: deliveredTotal,
    read,
    failed,
    skipped,
    deliveryRate: pct(deliveredTotal, sent),
    openRate: pct(read, deliveredTotal),
  };
}

/** Vuelca las metricas calculadas sobre los contadores de la campana. */
export async function syncCampaignCounters(db: PrismaClient, campaignId: string): Promise<CampaignMetrics> {
  const m = await computeMetrics(db, campaignId);

  await db.campaign.update({
    where: { id: campaignId },
    data: {
      sentCount: m.sent,
      deliveredCount: m.delivered,
      openRate: m.openRate,
      // clickRate y conversions siguen a 0: requieren enlaces con seguimiento
      // y una definicion de conversion que el producto aun no tiene. Se dejan
      // a cero a proposito, en vez de inventar un numero.
    },
  });

  return m;
}

/** true si quedan destinatarios por procesar. */
export async function hasPending(db: PrismaClient, campaignId: string): Promise<boolean> {
  const n = await db.campaignRecipient.count({ where: { campaignId, status: 'pending' } });
  return n > 0;
}
