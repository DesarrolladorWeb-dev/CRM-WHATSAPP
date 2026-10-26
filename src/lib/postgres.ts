import { PrismaClient } from '../generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg'
import { logger, alertOps, resolveOps } from '@/lib/logger';

/**
 * Cliente Prisma (Postgres) para el nucleo relacional del hibrido.
 *
 * Mismo contrato que src/lib/mongodb.ts: si no hay DATABASE_URL o Postgres no
 * responde, `connectToPostgres()` devuelve null. Ninguna ruta debe asumir que
 * Postgres existe: cuando es null, la ruta responde 503 (ver src/lib/demo.ts), o
 * sirve los datos de ejemplo de mockData solo si DEMO_MODE=true.
 */

declare global {
  var prismaClient: PrismaClient | undefined;
}

function getClient(): PrismaClient {
  if (!global.prismaClient) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL})
    global.prismaClient = new PrismaClient({ adapter ,log: ['error', 'warn'] });
  }
  return global.prismaClient;
}

// Se cachea el resultado de la primera sonda para no lanzar `SELECT 1` en cada
// request. Si el primer intento falla, se reintenta en la siguiente llamada.
let probe: { ok: boolean; at: number } | null = null;
const PROBE_TTL_MS = 10_000;

export async function connectToPostgres(): Promise<PrismaClient | null> {
  if (!process.env.DATABASE_URL) return null;

  const now = Date.now();
  if (probe && (probe.ok || now - probe.at < PROBE_TTL_MS)) {
    return probe.ok ? getClient() : null;
  }

  const wasOk = probe?.ok;
  try {
    const client = getClient();
    await client.$queryRaw`SELECT 1`;
    if (!wasOk) {
      logger.info('postgres.connected', { database: 'whato_crm' });
      resolveOps('db_down:postgres', 'postgres.recuperado', { database: 'whato_crm' });
    }
    probe = { ok: true, at: now };
    return client;
  } catch (err) {
    const detalle = (err as Error).message;
    logger.error('postgres.connection_error', { error: detalle });
    // En producción, además del log, dispara una alerta (deduplicada): Postgres
    // no responde y las rutas van a servir 503, no datos reales.
    alertOps('db_down:postgres', 'postgres.no_disponible', { motivo: detalle });
    probe = { ok: false, at: now };
    return null;
  }
}

export async function isPostgresConnected(): Promise<boolean> {
  return (await connectToPostgres()) !== null;
}

export function getPrisma(): PrismaClient {
  return getClient();
}

/**
 * Cierre ordenado del pool de conexiones de Prisma. Se llama desde
 * instrumentation.ts en SIGTERM/SIGINT: en un proceso persistente
 * (Docker/VPS) hay que liberar las conexiones del Postgres gestionado antes
 * de que el orquestador mate el proceso, o quedan colgadas hasta que el
 * proveedor las expira por timeout.
 */
export async function closePostgres(): Promise<void> {
  if (global.prismaClient) {
    await global.prismaClient.$disconnect();
    global.prismaClient = undefined;
    probe = null;
  }
}
