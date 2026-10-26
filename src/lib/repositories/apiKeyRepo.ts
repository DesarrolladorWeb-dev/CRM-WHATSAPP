import type { PrismaClient, ApiKey as ApiKeyRow } from '../../generated/prisma/client';
import { generateApiKey, maskApiKey } from '@/lib/apiKeySecurity';

export interface PublicApiKey {
  id: string;
  name: string;
  keyPreview: string;
  createdAt: string;
  lastUsed: string;
  permissions: string[];
}

function ymd(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function toPublicApiKey(row: ApiKeyRow): PublicApiKey {
  return {
    id: row.id,
    name: row.name,
    keyPreview: maskApiKey(row.keyPrefix),
    createdAt: ymd(row.createdAt),
    lastUsed: row.lastUsed,
    permissions: row.permissions,
  };
}

export async function listApiKeys(db: PrismaClient): Promise<PublicApiKey[]> {
  const rows = await db.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(toPublicApiKey);
}

/**
 * Crea una API key. El unico momento en que la clave en texto plano existe es el
 * valor devuelto en `key`: quien la crea debe copiarla ahora. En BD solo queda el
 * hash HMAC-SHA256 y el prefijo visible.
 */
export async function createApiKey(
  db: PrismaClient,
  input: { name: string; permissions: string[] }
): Promise<PublicApiKey & { key: string }> {
  const { rawKey, keyHash, keyPrefix } = generateApiKey();
  const id = `key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const row = await db.apiKey.create({
    data: { id, name: input.name, keyHash, keyPrefix, permissions: input.permissions },
  });

  return { ...toPublicApiKey(row), key: rawKey };
}

export async function deleteApiKey(db: PrismaClient, id: string): Promise<boolean> {
  const res = await db.apiKey.deleteMany({ where: { id } });
  return res.count > 0;
}
