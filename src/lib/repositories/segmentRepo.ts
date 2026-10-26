import type { PrismaClient, Prisma } from '../../generated/prisma/client';
import type { Segment } from '@/types';
import { resolveTagIds } from './tagRepo';
import { construirFiltro } from '@/lib/services/audienceService';

type SegmentRow = Prisma.SegmentGetPayload<{
  include: { channels: true; stages: true; segmentTags: { include: { tag: true } } };
}>;

const withRelations = {
  channels: true,
  stages: true,
  segmentTags: { include: { tag: true } },
} as const;

function ymd(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * El `contactCount` que ve la UI es SIEMPRE el recuento real en el momento de
 * leer, no el valor guardado en la columna. Antes el numero nacia de un
 * Math.random() en el cliente o del JSON de seed, asi que no tenia ninguna
 * relacion con la audiencia. Se cuenta con un COUNT agregado sobre los
 * criterios del segmento, sin traer contactos a memoria.
 */
async function toApiSegment(db: PrismaClient, row: SegmentRow): Promise<Segment> {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    channels: row.channels.map((c) => c.channel) as Segment['channels'],
    minScore: row.minScore ?? undefined,
    tags: row.segmentTags.map((st) => st.tag.name),
    stages: row.stages.map((s) => s.stage) as Segment['stages'],
    contactCount: await db.contact.count({ where: construirFiltro(row) }),
    createdAt: ymd(row.createdAt),
  };
}

type SegmentInput = Partial<Omit<Segment, 'channels' | 'stages' | 'tags'>> & {
  channels?: string[];
  stages?: string[];
  tags?: string[];
};

function scalarData(input: SegmentInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.minScore !== undefined) data.minScore = input.minScore;
  if (input.contactCount !== undefined) data.contactCount = input.contactCount;
  return data;
}

export async function listSegments(db: PrismaClient): Promise<Segment[]> {
  const rows = await db.segment.findMany({ include: withRelations, orderBy: { createdAt: 'desc' } });
  return Promise.all(rows.map((row) => toApiSegment(db, row)));
}

export async function getSegment(db: PrismaClient, id: string): Promise<Segment | null> {
  const row = await db.segment.findUnique({ where: { id }, include: withRelations });
  return row ? toApiSegment(db, row) : null;
}

async function syncChannels(db: PrismaClient, segmentId: string, channels: string[]): Promise<void> {
  const clean = Array.from(new Set(channels.filter(Boolean)));
  await db.segmentChannel.deleteMany({
    where: { segmentId, channel: { notIn: clean.length ? clean : ['__none__'] } },
  });
  for (const channel of clean) {
    await db.segmentChannel.upsert({
      where: { segmentId_channel: { segmentId, channel } },
      update: {},
      create: { segmentId, channel },
    });
  }
}

async function syncStages(db: PrismaClient, segmentId: string, stages: string[]): Promise<void> {
  const clean = Array.from(new Set(stages.filter(Boolean)));
  await db.segmentStage.deleteMany({
    where: { segmentId, stage: { notIn: clean.length ? clean : ['__none__'] } },
  });
  for (const stage of clean) {
    await db.segmentStage.upsert({
      where: { segmentId_stage: { segmentId, stage } },
      update: {},
      create: { segmentId, stage },
    });
  }
}

async function syncTags(db: PrismaClient, segmentId: string, tags: string[]): Promise<void> {
  const tagIds = await resolveTagIds(db, tags);
  await db.segmentTag.deleteMany({
    where: { segmentId, tagId: { notIn: tagIds.length ? tagIds : ['__none__'] } },
  });
  for (const tagId of tagIds) {
    await db.segmentTag.upsert({
      where: { segmentId_tagId: { segmentId, tagId } },
      update: {},
      create: { segmentId, tagId },
    });
  }
}

export async function upsertSegment(
  db: PrismaClient,
  id: string,
  input: SegmentInput
): Promise<Segment> {
  const scalar = scalarData(input);
  await db.segment.upsert({
    where: { id },
    update: scalar as Prisma.SegmentUpdateInput,
    create: { ...(scalar as Prisma.SegmentUncheckedCreateInput), id, name: input.name ?? id },
  });

  if (input.channels !== undefined) await syncChannels(db, id, input.channels);
  if (input.stages !== undefined) await syncStages(db, id, input.stages);
  if (input.tags !== undefined) await syncTags(db, id, input.tags);

  const row = await db.segment.findUnique({ where: { id }, include: withRelations });
  return toApiSegment(db, row as SegmentRow);
}

export async function updateSegment(
  db: PrismaClient,
  id: string,
  input: SegmentInput
): Promise<Segment | null> {
  const exists = await db.segment.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return null;

  await db.segment.update({ where: { id }, data: scalarData(input) as Prisma.SegmentUpdateInput });
  if (input.channels !== undefined) await syncChannels(db, id, input.channels);
  if (input.stages !== undefined) await syncStages(db, id, input.stages);
  if (input.tags !== undefined) await syncTags(db, id, input.tags);

  const row = await db.segment.findUnique({ where: { id }, include: withRelations });
  return toApiSegment(db, row as SegmentRow);
}

export async function deleteSegment(db: PrismaClient, id: string): Promise<void> {
  await db.segment.delete({ where: { id } }).catch(() => null);
}
