import { describe, it, expect, afterEach } from 'vitest';
import { toApiUser, assertJwtSecret } from '@/lib/repositories/userRepo';

// Fila tal como la devuelve Prisma, con el hash incluido.
const filaDeLaBase = {
  id: 'cus_123',
  name: 'Bob Smith',
  email: 'bob@example.com',
  password: '$2b$10$hashDePruebaQueNoDebeSalirNunca',
  role: 'Administrador',
  avatarUrl: null as unknown as string,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('toApiUser', () => {
  it('no incluye el hash de la contrasena', () => {
    const salida = toApiUser(filaDeLaBase);
    expect(salida).not.toHaveProperty('password');
  });

  it('el hash no aparece en el JSON serializado que viaja al cliente', () => {
    const json = JSON.stringify(toApiUser(filaDeLaBase));
    expect(json).not.toContain(filaDeLaBase.password);
    expect(json).not.toContain('password');
  });

  it('conserva los campos que el frontend si necesita', () => {
    const salida = toApiUser(filaDeLaBase);
    expect(salida.id).toBe('cus_123');
    expect(salida.name).toBe('Bob Smith');
    expect(salida.email).toBe('bob@example.com');
    expect(salida.role).toBe('Administrador');
  });
});

describe('assertJwtSecret', () => {
  const original = process.env.JWT_SECRET;
  afterEach(() => { process.env.JWT_SECRET = original; });

  it('lanza si falta la variable: sin ella el login responde 500 sin explicacion', () => {
    delete process.env.JWT_SECRET;
    expect(() => assertJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it('lanza tambien si esta vacia, no solo si esta ausente', () => {
    process.env.JWT_SECRET = '';
    expect(() => assertJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it('no lanza cuando esta definida', () => {
    process.env.JWT_SECRET = 'secreto-de-prueba';
    expect(() => assertJwtSecret()).not.toThrow();
  });
});
