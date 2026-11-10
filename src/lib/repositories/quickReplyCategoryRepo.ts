import { randomUUID } from 'node:crypto';
import type { PrismaClient, QuickReplyCategory as QuickReplyCategoryRow } from '../../generated/prisma/client';
import type { QuickReplyCategory } from '@/types';

type CategoryRowWithCount = QuickReplyCategoryRow & {
  _count: { quickReplies: number };
};

function toApiCategory(row: CategoryRowWithCount): QuickReplyCategory {
  return {
    id: row.id,
    label: row.label,
    icon: row.icon,
    color: row.color,
    usageCount: row._count.quickReplies,
  };
}

export class QuickReplyCategoryInUseError extends Error {
  constructor(public readonly usageCount: number) {
    super('La categoría está asignada a plantillas');
    this.name = 'QuickReplyCategoryInUseError';
  }
}

export class QuickReplyCategoryDefaultError extends Error {
  constructor() {
    super('La categoría General es la categoría predeterminada y no se puede eliminar');
    this.name = 'QuickReplyCategoryDefaultError';
  }
}

export class QuickReplyCategoryNameExistsError extends Error {
  constructor() {
    super('Ya existe una categoría con ese nombre');
    this.name = 'QuickReplyCategoryNameExistsError';
  }
}

async function ensureLabelAvailable(db: PrismaClient, label: string, exceptId?: string): Promise<void> {
  const existing = await db.quickReplyCategory.findFirst({
    where: {
      label: { equals: label.trim(), mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new QuickReplyCategoryNameExistsError();
}

export async function listQuickReplyCategories(db: PrismaClient): Promise<QuickReplyCategory[]> {
  const rows = await db.quickReplyCategory.findMany({
    orderBy: { label: 'asc' },
    include: { _count: { select: { quickReplies: true } } },
  });
  return rows.map((row) => toApiCategory(row as CategoryRowWithCount));
}

export async function createQuickReplyCategory(
  db: PrismaClient,
  input: Pick<QuickReplyCategory, 'label'> & Partial<Pick<QuickReplyCategory, 'icon' | 'color'>>
): Promise<QuickReplyCategory> {
  await ensureLabelAvailable(db, input.label);
  const row = await db.quickReplyCategory.create({
    data: {
      id: randomUUID(),
      label: input.label.trim(),
      icon: input.icon ?? 'Tag',
      color: input.color ?? 'bg-slate-100 text-slate-700',
    },
    include: { _count: { select: { quickReplies: true } } },
  });
  return toApiCategory(row as CategoryRowWithCount);
}

export async function updateQuickReplyCategory(
  db: PrismaClient,
  id: string,
  input: Partial<Pick<QuickReplyCategory, 'label' | 'icon' | 'color'>>
): Promise<QuickReplyCategory> {
  if (input.label !== undefined) await ensureLabelAvailable(db, input.label, id);
  const row = await db.quickReplyCategory.update({
    where: { id },
    data: {
      ...(input.label !== undefined ? { label: input.label.trim() } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    },
    include: { _count: { select: { quickReplies: true } } },
  });
  return toApiCategory(row as CategoryRowWithCount);
}

export async function deleteQuickReplyCategory(db: PrismaClient, id: string): Promise<void> {
  if (id === 'general') throw new QuickReplyCategoryDefaultError();

  const usageCount = await db.quickReply.count({ where: { category: id } });
  if (usageCount > 0) throw new QuickReplyCategoryInUseError(usageCount);

  await db.quickReplyCategory.delete({ where: { id } });
}
