import { describe, it, expect } from 'vitest';
import { contactCreateSchema, campaignCreateSchema, apiKeyCreateSchema } from '@/lib/schemas';

const contactoValido = {
  name: 'Valeria Gomez',
  handle: '@valeria_g',
  email: 'valeria@innovatetech.io',
  channel: 'whatsapp'
};

describe('contactCreateSchema', () => {
  it('acepta un contacto valido', () => {
    expect(contactCreateSchema.safeParse(contactoValido).success).toBe(true);
  });

  it('rechaza campos que no estan en el esquema', () => {
    const conBasura = { ...contactoValido, esAdministrador: true, __proto__hack: 1 };
    expect(contactCreateSchema.safeParse(conBasura).success).toBe(false);
  });

  it('exige el nombre', () => {
    const sinNombre: Partial<typeof contactoValido> = { ...contactoValido };
    delete sinNombre.name;
    expect(contactCreateSchema.safeParse(sinNombre).success).toBe(false);
  });

  it('rechaza un email mal formado', () => {
    const malEmail = { ...contactoValido, email: 'esto-no-es-un-correo' };
    expect(contactCreateSchema.safeParse(malEmail).success).toBe(false);
  });

  it('rechaza un canal fuera del enum', () => {
    const malCanal = { ...contactoValido, channel: 'telegram' };
    expect(contactCreateSchema.safeParse(malCanal).success).toBe(false);
  });
});

describe('campaignCreateSchema', () => {
  it('rechaza campos arbitrarios', () => {
    const res = campaignCreateSchema.safeParse({ inventado: 'x' });
    expect(res.success).toBe(false);
  });
});

describe('apiKeyCreateSchema', () => {
  it('acepta nombre y permisos validos', () => {
    const res = apiKeyCreateSchema.safeParse({ name: 'Integracion X', permissions: ['read', 'write'] });
    expect(res.success).toBe(true);
  });

  it('rechaza un intento de enviar la clave desde el cliente (el backend siempre la genera)', () => {
    const res = apiKeyCreateSchema.safeParse({
      name: 'Integracion X',
      permissions: ['read'],
      key: 'clave-inventada-por-el-atacante',
    });
    expect(res.success).toBe(false);
  });

  it('rechaza un intento de enviar un id propio (el backend siempre lo genera)', () => {
    const res = apiKeyCreateSchema.safeParse({ name: 'X', permissions: ['read'], id: 'key_1' });
    expect(res.success).toBe(false);
  });

  it('exige al menos un permiso', () => {
    const res = apiKeyCreateSchema.safeParse({ name: 'X', permissions: [] });
    expect(res.success).toBe(false);
  });

  it('exige nombre no vacio', () => {
    const res = apiKeyCreateSchema.safeParse({ name: '', permissions: ['read'] });
    expect(res.success).toBe(false);
  });

  it('rechaza un permiso con formato invalido', () => {
    const res = apiKeyCreateSchema.safeParse({ name: 'X', permissions: ['DROP TABLE;'] });
    expect(res.success).toBe(false);
  });
});
