import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { logger } from '@/lib/logger';

/**
 * Las API Keys de whato-crm son credenciales autoemitidas (como las de Stripe o
 * GitHub): el backend nunca necesita recuperar el valor original, solo comparar
 * lo que llega en cada request. Por eso se guarda un hash irreversible (HMAC-SHA256
 * con un secreto de servidor) en vez de cifrado reversible o texto plano.
 *
 * El secreto (`API_KEY_HASH_SECRET`, o `API_MASTER_KEY` como respaldo) es
 * OBLIGATORIO en produccion: si falta, cualquier operacion con claves lanza un
 * error en vez de caer a un pepper de desarrollo publico. Genera uno con
 * `openssl rand -hex 32`. Rotarlo invalida todas las claves ya emitidas y obliga
 * a re-emitirlas.
 */

const KEY_PREFIX = 'scrm_live_';
const RAW_ENTROPY_BYTES = 24;
const PREFIX_VISIBLE_CHARS = 4;
const DEV_INSECURE_PEPPER = 'dev-only-insecure-api-key-pepper';

/**
 * Comprueba que el secreto del hash este configurado cuando importa (produccion).
 * Se puede llamar en el arranque para fallar rapido; de lo contrario, la primera
 * operacion con claves lanzara el mismo error.
 */
export function assertApiKeyHashSecret(): void {
  const secret = process.env.API_KEY_HASH_SECRET || process.env.API_MASTER_KEY;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error(
      '[apiKeySecurity] API_KEY_HASH_SECRET es obligatorio en produccion. Sin el, todas ' +
      'las API keys se hashean con un pepper publico conocido y el hash no protege nada. ' +
      'Genera uno con `openssl rand -hex 32` y definelo en el entorno antes de arrancar.'
    );
  }
}

function getHashSecret(): string {
  const secret = process.env.API_KEY_HASH_SECRET || process.env.API_MASTER_KEY;
  if (secret) return secret;

  assertApiKeyHashSecret(); // lanza en produccion
  logger.warn('apikeysecurity.dev_pepper_in_use', {
    detail: 'API_KEY_HASH_SECRET no esta configurado. Usando un secreto de desarrollo no apto para produccion.',
  });
  return DEV_INSECURE_PEPPER;
}

export function hashApiKey(rawKey: string): string {
  return createHmac('sha256', getHashSecret()).update(rawKey).digest('hex');
}

export function keyPrefixOf(rawKey: string): string {
  return rawKey.slice(0, KEY_PREFIX.length + PREFIX_VISIBLE_CHARS);
}

export interface GeneratedApiKey {
  rawKey: string;
  keyHash: string;
  keyPrefix: string;
}

export function generateApiKey(): GeneratedApiKey {
  const rawKey = `${KEY_PREFIX}${randomBytes(RAW_ENTROPY_BYTES).toString('hex')}`;
  return {
    rawKey,
    keyHash: hashApiKey(rawKey),
    keyPrefix: keyPrefixOf(rawKey),
  };
}

/** Deriva {keyHash, keyPrefix} de una clave ya existente (usado por la migracion). */
export function deriveHashedRecord(rawKey: string): { keyHash: string; keyPrefix: string } {
  return { keyHash: hashApiKey(rawKey), keyPrefix: keyPrefixOf(rawKey) };
}

/** Representacion segura para mostrar en UI: nunca permite reconstruir la clave. */
export function maskApiKey(keyPrefix: string): string {
  return `${keyPrefix}${'•'.repeat(8)}`;
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
