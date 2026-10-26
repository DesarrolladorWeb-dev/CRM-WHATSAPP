import mongoose from 'mongoose';
import { logger, alertOps, resolveOps } from '@/lib/logger';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/whato-crm';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache || { conn: null, promise: null };

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

export async function connectToDatabase(): Promise<typeof mongoose | null> {
  if (!process.env.MONGODB_URI) {
    // If no URI is explicitly set, we still can attempt default or return null for demo mode
    logger.warn('mongodb.uri_not_set', {
      detail: 'MONGODB_URI is not set in environment variables. Falling back to in-memory/demo store.',
    });
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    // Pool de conexiones del driver de Mongo. En un proceso persistente
    // (Docker/VPS) un solo pool por proceso basta; se deja configurable por
    // env para no tener que redesplegar si el plan del Mongo gestionado
    // (Atlas) cambia su límite de conexiones concurrentes.
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: Number(process.env.MONGODB_POOL_MAX) || 10,
      minPoolSize: Number(process.env.MONGODB_POOL_MIN) || 1,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((m) => {
      logger.info('mongodb.connected', { database: 'whato-crm' });
      resolveOps('db_down:mongodb', 'mongodb.recuperado', { database: 'whato-crm' });
      return m;
    }).catch((err) => {
      logger.error('mongodb.connection_error', { error: err.message });
      // En producción, además del log, dispara una alerta (deduplicada): Mongo
      // no responde y las rutas van a servir 503, no datos reales.
      alertOps('db_down:mongodb', 'mongodb.no_disponible', { motivo: err.message });
      cached.promise = null;
      return null;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch {
    cached.conn = null;
  }

  return cached.conn;
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Cierre ordenado de la conexión de Mongoose. Contraparte de
 * closePostgres() en src/lib/postgres.ts; ver ese comentario.
 */
export async function closeDatabase(): Promise<void> {
  if (cached.conn) {
    await cached.conn.disconnect();
    cached.conn = null;
    cached.promise = null;
  }
}
