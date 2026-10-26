import type { PrismaClient, PresetImage as PresetImageRow } from '../../generated/prisma/client';
import type { PresetImage } from '@/types';

function toApiPresetImage(row: PresetImageRow): PresetImage {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    type: row.type || undefined,
  };
}

export async function listPresetImages(db: PrismaClient): Promise<PresetImage[]> {
  const rows = await db.presetImage.findMany({ orderBy: { name: 'asc' } });
  return rows.map(toApiPresetImage);
}

export async function createPresetImage(
  db: PrismaClient,
  input: { name: string; url: string; type?: string }
): Promise<PresetImage> {
  const row = await db.presetImage.create({
    data: {
      name: input.name,
      url: input.url,
      type: input.type ?? 'general',
    },
  });
  return toApiPresetImage(row);
}

export async function deletePresetImage(db: PrismaClient, id: string): Promise<void> {
  await db.presetImage.delete({ where: { id } }).catch(() => null);
}
