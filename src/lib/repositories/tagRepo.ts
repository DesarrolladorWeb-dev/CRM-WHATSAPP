import type { PrismaClient } from '../../generated/prisma/client';

export interface ApiTag {
  id: string;
  name: string;
  color: string;
}

const DEFAULT_TAG_COLOR = '#6b7280';

export function toApiTag(row: { id: string; name: string; color: string }): ApiTag {
  return { id: row.id, name: row.name, color: row.color };
}

export async function listTags(db: PrismaClient): Promise<ApiTag[]> {
  const rows = await db.tag.findMany({ orderBy: { name: 'asc' } });
  return rows.map(toApiTag);
}

export async function createTag(
  db: PrismaClient,
  input: { name: string; color?: string }
): Promise<ApiTag> {
  const row = await db.tag.upsert({
    where: { name: input.name },
    update: input.color ? { color: input.color } : {},
    create: { name: input.name, color: input.color ?? DEFAULT_TAG_COLOR },
  });
  return toApiTag(row);
}

export async function deleteTag(db: PrismaClient, id: string): Promise<void> {
  await db.tag.delete({ where: { id } }).catch(() => null);
}

/**
 * Resuelve una lista de nombres de etiqueta a filas Tag, creando las que falten.
 * Devuelve los ids en el mismo orden. Se usa al guardar contactos y segmentos,
 * que en la app manejan etiquetas por nombre (string), no por id.
 */
export async function resolveTagIds(
  db: PrismaClient,
  names: string[]
): Promise<string[]> {
  const clean = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (clean.length === 0) return [];

  await Promise.all(
    clean.map((name) =>
      db.tag.upsert({
        where: { name },
        update: {},
        create: { name, color: DEFAULT_TAG_COLOR },
      })
    )
  );

  const rows = await db.tag.findMany({ where: { name: { in: clean } } });
  const byName = new Map(rows.map((r) => [r.name, r.id]));
  return clean.map((n) => byName.get(n)).filter((v): v is string => !!v);
}
