import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  RateLimiterMongo,
  type RateLimiterRes,
} from 'rate-limiter-flexible';
import { connectToDatabase, isDbConnected } from '@/lib/mongodb';
import { extractApiKey } from './auth';

const DEFAULT_POINTS = 1;
const DEFAULT_WINDOW_SECONDS = 40;
const RATE_LIMIT_COLLECTION = 'rate_limits';
const RATE_LIMIT_KEY_PREFIX = 'whato_ai';

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) return fallback;

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    console.warn(`${name} debe ser un entero positivo; se usará ${fallback}.`);
    return fallback;
  }

  return value;
}

export const AI_RATE_LIMIT_POINTS = positiveIntegerFromEnv(
  'AI_RATE_LIMIT_POINTS',
  DEFAULT_POINTS
);
export const AI_RATE_LIMIT_WINDOW_SECONDS = positiveIntegerFromEnv(
  'AI_RATE_LIMIT_WINDOW_SECONDS',
  DEFAULT_WINDOW_SECONDS
);

export interface RateLimitConsumer {
  consume(key: string): Promise<RateLimiterRes>;
}

export type AiRateLimitScope =
  | 'campaign-copy'
  | 'chatbot-autorespond'
  | 'smart-reply'
  | 'summarize'
  | 'generalAI';

interface RateLimiterCache {
  promise: Promise<RateLimiterMongo> | null;
}

declare global {
  var aiRateLimiterCache: RateLimiterCache | undefined;
}

const cache: RateLimiterCache = globalThis.aiRateLimiterCache || { promise: null };

if (!globalThis.aiRateLimiterCache) {
  globalThis.aiRateLimiterCache = cache;
}

function extractClientAddress(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'desconocida';
  }

  return req.headers.get('x-real-ip')?.trim() || 'desconocida';
}


export function getRateLimitIdentity(req: NextRequest): string {
  const credential = extractApiKey(req);
  const identity = credential
    ? JSON.stringify(['credential', credential])
    : JSON.stringify(['ip', extractClientAddress(req)]);
  return createHash('sha256').update(identity).digest('hex');
}

async function createDistributedLimiter(): Promise<RateLimiterMongo> {
  const mongoose = await connectToDatabase();
  const databaseName = mongoose?.connection.db?.databaseName;

  if (!mongoose || !databaseName || !isDbConnected()) {
    throw new Error('MongoDB no está disponible para el rate limiter');
  }

  const limiter = new RateLimiterMongo({
    storeClient: mongoose.connection.getClient(),
    dbName: databaseName,
    tableName: RATE_LIMIT_COLLECTION,
    keyPrefix: RATE_LIMIT_KEY_PREFIX,
    points: AI_RATE_LIMIT_POINTS,
    duration: AI_RATE_LIMIT_WINDOW_SECONDS,
    disableIndexesCreation: true,
    // Tras el primer exceso, evita golpear MongoDB de nuevo desde ese proceso.
    inMemoryBlockOnConsumed: AI_RATE_LIMIT_POINTS + 1,
  });

  await limiter.createIndexes();
  return limiter;
}

async function getDistributedLimiter(): Promise<RateLimiterMongo> {
  if (!cache.promise) {
    const pending = createDistributedLimiter();
    cache.promise = pending;

    pending.catch(() => {
      // Permite recuperarse cuando MongoDB vuelve a estar disponible.
      if (cache.promise === pending) cache.promise = null;
    });
  }

  return cache.promise;
}

function isRateLimitResult(error: unknown): error is RateLimiterRes {
  if (!error || typeof error !== 'object') return false;

  const result = error as Partial<RateLimiterRes>;
  return (
    typeof result.msBeforeNext === 'number' &&
    typeof result.remainingPoints === 'number' &&
    typeof result.consumedPoints === 'number'
  );
}

const DEFAULT_LOGIN_POINTS = 5;
const DEFAULT_LOGIN_WINDOW_SECONDS = 300; // 5 minutos
const LOGIN_RATE_LIMIT_COLLECTION = 'rate_limits';
const LOGIN_RATE_LIMIT_KEY_PREFIX = 'whato_login';

export const LOGIN_RATE_LIMIT_POINTS = positiveIntegerFromEnv(
  'LOGIN_RATE_LIMIT_POINTS',
  DEFAULT_LOGIN_POINTS
);
export const LOGIN_RATE_LIMIT_WINDOW_SECONDS = positiveIntegerFromEnv(
  'LOGIN_RATE_LIMIT_WINDOW_SECONDS',
  DEFAULT_LOGIN_WINDOW_SECONDS
);

interface LoginRateLimiterCache {
  promise: Promise<RateLimiterMongo> | null;
}

declare global {
  var loginRateLimiterCache: LoginRateLimiterCache | undefined;
}

const loginCache: LoginRateLimiterCache = globalThis.loginRateLimiterCache || { promise: null };

if (!globalThis.loginRateLimiterCache) {
  globalThis.loginRateLimiterCache = loginCache;
}

async function createLoginLimiter(): Promise<RateLimiterMongo> {
  const mongoose = await connectToDatabase();
  const databaseName = mongoose?.connection.db?.databaseName;

  if (!mongoose || !databaseName || !isDbConnected()) {
    throw new Error('MongoDB no está disponible para el limitador de login');
  }

  const limiter = new RateLimiterMongo({
    storeClient: mongoose.connection.getClient(),
    dbName: databaseName,
    tableName: LOGIN_RATE_LIMIT_COLLECTION,
    keyPrefix: LOGIN_RATE_LIMIT_KEY_PREFIX,
    points: LOGIN_RATE_LIMIT_POINTS,
    duration: LOGIN_RATE_LIMIT_WINDOW_SECONDS,
    disableIndexesCreation: true,
    inMemoryBlockOnConsumed: LOGIN_RATE_LIMIT_POINTS + 1,
  });

  await limiter.createIndexes();
  return limiter;
}

async function getLoginLimiter(): Promise<RateLimiterMongo> {
  if (!loginCache.promise) {
    const pending = createLoginLimiter();
    loginCache.promise = pending;

    pending.catch(() => {
      if (loginCache.promise === pending) loginCache.promise = null;
    });
  }

  return loginCache.promise;
}

export function getLoginRateLimitIdentity(req: NextRequest, email: string): string {
  const ip = extractClientAddress(req);
  const identity = JSON.stringify(['login', ip, email.trim().toLowerCase()]);
  return createHash('sha256').update(identity).digest('hex');
}

export async function enforceLoginRateLimit(
  req: NextRequest,
  email: string
): Promise<NextResponse | null> {
  try {
    const limiter = await getLoginLimiter();
    await limiter.consume(getLoginRateLimitIdentity(req, email));
    return null;
  } catch (error: unknown) {
    if (isRateLimitResult(error)) {
      const retryAfter = Math.max(1, Math.ceil(error.msBeforeNext / 1000));
      return NextResponse.json(
        {
          success: false,
          error: 'Demasiados intentos de inicio de sesión. Intenta nuevamente más tarde.',
          retryAfter,
        },
        {
          status: 429,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) },
        }
      );
    }

    console.error('No se pudo comprobar el rate limit de login (fail-open):', error);
    return null;
  }
}

/**
 * Aplica el cupo de una ruta de IA de forma compartida entre procesos.
 * Devuelve null si la petición puede continuar.
 */
export async function enforceAiRateLimit(
  req: NextRequest,
  scope: AiRateLimitScope,
  consumer?: RateLimitConsumer
): Promise<NextResponse | null> {
  try {
    const limiter = consumer || (await getDistributedLimiter());
    await limiter.consume(`${scope}:${getRateLimitIdentity(req)}`);
    return null;
  } catch (error: unknown) {
    if (isRateLimitResult(error)) {
      const retryAfter = Math.max(1, Math.ceil(error.msBeforeNext / 1000));
      const resetAt = Math.ceil((Date.now() + error.msBeforeNext) / 1000);

      return NextResponse.json(
        {
          success: false,
          error: 'Demasiadas solicitudes. Intenta nuevamente más tarde.',
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(AI_RATE_LIMIT_POINTS),
            'X-RateLimit-Remaining': String(Math.max(0, error.remainingPoints)),
            'X-RateLimit-Reset': String(resetAt),
          },
        }
      );
    }

    console.error('No se pudo comprobar el rate limit distribuido:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'El control de solicitudes no está disponible temporalmente.',
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '1' },
      }
    );
  }
}
