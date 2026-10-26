import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  maskApiKey,
  deriveHashedRecord,
  safeEqual,
  assertApiKeyHashSecret,
} from '@/lib/apiKeySecurity';

describe('generateApiKey', () => {
  const original = process.env.API_KEY_HASH_SECRET;
  afterEach(() => { process.env.API_KEY_HASH_SECRET = original; });

  it('nunca guarda la clave en texto plano: keyHash no es igual a rawKey', () => {
    process.env.API_KEY_HASH_SECRET = 'secreto-de-prueba';
    const { rawKey, keyHash } = generateApiKey();
    expect(keyHash).not.toBe(rawKey);
    expect(keyHash).not.toContain(rawKey);
  });

  it('genera claves distintas en cada llamada (alta entropia)', () => {
    process.env.API_KEY_HASH_SECRET = 'secreto-de-prueba';
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.rawKey).not.toBe(b.rawKey);
    expect(a.keyHash).not.toBe(b.keyHash);
  });

  it('el hash es determinista: el backend puede recalcularlo para comparar en cada request', () => {
    process.env.API_KEY_HASH_SECRET = 'secreto-de-prueba';
    const { rawKey, keyHash } = generateApiKey();
    expect(hashApiKey(rawKey)).toBe(keyHash);
  });

  it('el mismo secreto produce el mismo hash; un secreto distinto produce otro hash', () => {
    process.env.API_KEY_HASH_SECRET = 'secreto-uno';
    const hashConSecretoUno = hashApiKey('scrm_live_ejemplo');
    process.env.API_KEY_HASH_SECRET = 'secreto-dos';
    const hashConSecretoDos = hashApiKey('scrm_live_ejemplo');
    expect(hashConSecretoUno).not.toBe(hashConSecretoDos);
  });
});

describe('API_KEY_HASH_SECRET obligatorio en produccion', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('en produccion sin secreto: assertApiKeyHashSecret y hashApiKey lanzan (no caen al pepper de dev)', () => {
    vi.stubEnv('API_KEY_HASH_SECRET', '');
    vi.stubEnv('API_MASTER_KEY', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => assertApiKeyHashSecret()).toThrow(/obligatorio en produccion/);
    expect(() => hashApiKey('scrm_live_ejemplo')).toThrow(/obligatorio en produccion/);
  });

  it('en produccion con secreto definido: no lanza', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('API_KEY_HASH_SECRET', 'secreto-de-produccion');
    expect(() => assertApiKeyHashSecret()).not.toThrow();
    expect(() => hashApiKey('scrm_live_ejemplo')).not.toThrow();
  });

  it('en produccion acepta API_MASTER_KEY como respaldo', () => {
    vi.stubEnv('API_KEY_HASH_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('API_MASTER_KEY', 'clave-maestra');
    expect(() => assertApiKeyHashSecret()).not.toThrow();
  });

  it('fuera de produccion sin secreto: no lanza (usa el pepper de desarrollo)', () => {
    vi.stubEnv('API_KEY_HASH_SECRET', '');
    vi.stubEnv('API_MASTER_KEY', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(() => assertApiKeyHashSecret()).not.toThrow();
    expect(() => hashApiKey('scrm_live_ejemplo')).not.toThrow();
  });
});

describe('maskApiKey', () => {
  it('la version enmascarada nunca contiene la clave completa ni el hash', () => {
    process.env.API_KEY_HASH_SECRET = 'secreto-de-prueba';
    const { rawKey, keyHash, keyPrefix } = generateApiKey();
    const masked = maskApiKey(keyPrefix);
    expect(masked).not.toBe(rawKey);
    expect(masked).not.toContain(keyHash);
    expect(masked.length).toBeLessThan(rawKey.length + 8);
    expect(masked).toContain('•');
  });
});

describe('deriveHashedRecord (usado por la migracion de claves existentes)', () => {
  it('produce el mismo keyHash/keyPrefix que generateApiKey para la misma clave', () => {
    process.env.API_KEY_HASH_SECRET = 'secreto-de-prueba';
    const generated = generateApiKey();
    const migrated = deriveHashedRecord(generated.rawKey);
    expect(migrated.keyHash).toBe(generated.keyHash);
    expect(migrated.keyPrefix).toBe(generated.keyPrefix);
  });

  it('nunca imprime ni registra la clave en texto plano al migrarla', () => {
    process.env.API_KEY_HASH_SECRET = 'secreto-de-prueba';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rawLegacyKey = 'scrm_live_legacy_plaintext_1234567890';

    deriveHashedRecord(rawLegacyKey);

    const allLoggedArgs = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat();
    expect(allLoggedArgs.some((arg) => typeof arg === 'string' && arg.includes(rawLegacyKey))).toBe(false);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe('safeEqual', () => {
  it('true solo cuando ambos valores son identicos', () => {
    expect(safeEqual('abc123', 'abc123')).toBe(true);
  });

  it('false cuando difieren', () => {
    expect(safeEqual('abc123', 'abc124')).toBe(false);
  });

  it('false cuando difieren en longitud (sin lanzar error)', () => {
    expect(safeEqual('abc', 'abcdef')).toBe(false);
  });
});
