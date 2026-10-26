import type { PrismaClient, Prisma, QuickReply as QuickReplyRow } from '../../generated/prisma/client';
import type { QuickReply } from '@/types';

function toApiQuickReply(row: QuickReplyRow): QuickReply {
  return {
    id: row.id,
    title: row.title,
    emoji: row.emoji || undefined,
    text: row.text,
    imageUrl: row.imageUrl ?? undefined,
    category: (row.category || undefined) as QuickReply['category'],
  };
}

type QuickReplyInput = Partial<QuickReply>;

function scalarData(input: QuickReplyInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.emoji !== undefined) data.emoji = input.emoji ?? '';
  if (input.text !== undefined) data.text = input.text;
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
  if (input.category !== undefined) data.category = input.category ?? 'general';
  return data;
}

export async function listQuickReplies(db: PrismaClient): Promise<QuickReply[]> {
  const rows = await db.quickReply.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map(toApiQuickReply);
}

export async function upsertQuickReply(
  db: PrismaClient,
  id: string,
  input: QuickReplyInput
): Promise<QuickReply> {
  const scalar = scalarData(input);
  const row = await db.quickReply.upsert({
    where: { id },
    update: scalar as Prisma.QuickReplyUpdateInput,
    create: { ...(scalar as Prisma.QuickReplyUncheckedCreateInput), id, title: input.title ?? id },
  });
  return toApiQuickReply(row);
}

export async function deleteQuickReply(db: PrismaClient, id: string): Promise<void> {
  await db.quickReply.delete({ where: { id } }).catch(() => null);
}
