import type { PrismaClient, Prisma, Campaign as CampaignRow } from '../../generated/prisma/client';
import type { Campaign } from '@/types';
import { parseScheduledAt } from '@/lib/time';

function ymd(date: Date): string {
  return date.toISOString().split('T')[0];
}

function toApiCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    title: row.title,
    channel: row.channel as Campaign['channel'],
    segmentId: row.segmentId,
    segmentName: row.segmentName,
    content: row.content,
    imageUrl: row.imageUrl ?? undefined,
    status: row.status as Campaign['status'],
    sentCount: row.sentCount,
    deliveredCount: row.deliveredCount,
    openRate: row.openRate,
    clickRate: row.clickRate,
    conversions: row.conversions,
    scheduledDate: row.scheduledDate ?? undefined,
    // Siempre sale en ISO UTC. La conversion a hora de Lima es cosa de quien
    // lo muestra, no de quien lo guarda: una fecha que viaja ya formateada
    // pierde la zona y deja de poder compararse.
    scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : undefined,
    launchedAt: row.launchedAt ? row.launchedAt.toISOString() : undefined,
    completedAt: row.completedAt ? row.completedAt.toISOString() : undefined,
    failureReason: row.failureReason ?? undefined,
    createdAt: ymd(row.createdAt),
  };
}

type CampaignInput = Partial<Omit<Campaign, 'createdAt'>>;

function scalarData(input: CampaignInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.channel !== undefined) data.channel = input.channel;
  if (input.segmentId !== undefined) data.segmentId = input.segmentId;
  if (input.segmentName !== undefined) data.segmentName = input.segmentName;
  if (input.content !== undefined) data.content = input.content;
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
  if (input.status !== undefined) data.status = input.status;
  if (input.scheduledDate !== undefined) data.scheduledDate = input.scheduledDate;

  // `scheduledAt` entra como cadena y sale a Postgres como Date. La conversion
  // pasa SIEMPRE por `parseScheduledAt`, nunca por `new Date(...)` directo: una
  // hora de pared ("2026-09-25T14:30") interpretada por `new Date` usa la zona
  // del proceso, que en un contenedor es UTC, y la campana saldria 5 horas
  // antes de lo que pidio el usuario.
  //
  // El `null` explicito desprograma; `undefined` deja el valor como estaba.
  if (input.scheduledAt !== undefined) {
    data.scheduledAt = input.scheduledAt === null ? null : parseScheduledAt(input.scheduledAt);
  }
  // sentCount, deliveredCount, openRate, clickRate y conversions NO se copian
  // desde la entrada a proposito: son metricas derivadas de la tabla de
  // destinatarios y solo las escribe syncCampaignCounters(). Aceptarlas aqui
  // volveria a permitir que el navegador inventara «500 enviados».
  return data;
}

export async function listCampaigns(db: PrismaClient): Promise<Campaign[]> {
  const rows = await db.campaign.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(toApiCampaign);
}

export async function getCampaign(db: PrismaClient, id: string): Promise<Campaign | null> {
  const row = await db.campaign.findUnique({ where: { id } });
  return row ? toApiCampaign(row) : null;
}

export async function upsertCampaign(
  db: PrismaClient,
  id: string,
  input: CampaignInput
): Promise<Campaign> {
  const scalar = scalarData(input);
  const row = await db.campaign.upsert({
    where: { id },
    update: scalar as Prisma.CampaignUpdateInput,
    create: {
      ...(scalar as Prisma.CampaignUncheckedCreateInput),
      id,
      title: input.title ?? id,
      segmentId: input.segmentId ?? '',
    },
  });
  return toApiCampaign(row);
}

export async function updateCampaign(
  db: PrismaClient,
  id: string,
  input: CampaignInput
): Promise<Campaign | null> {
  const exists = await db.campaign.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return null;
  const row = await db.campaign.update({
    where: { id },
    data: scalarData(input) as Prisma.CampaignUpdateInput,
  });
  return toApiCampaign(row);
}

export async function deleteCampaign(db: PrismaClient, id: string): Promise<void> {
  await db.campaign.delete({ where: { id } }).catch(() => null);
}
