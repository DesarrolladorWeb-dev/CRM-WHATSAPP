import type { NextResponse } from 'next/server';

/**
 * CORS para las rutas /api/*. Se aplica en el middleware (Edge).
 *
 * Origenes permitidos: lista exacta en `CORS_ALLOWED_ORIGINS` (separada por
 * comas). En desarrollo se aceptan ademas `localhost` / `127.0.0.1` en cualquier
 * puerto. Un `Origin` que no este en la lista NO recibe cabeceras CORS: el
 * navegador bloquea la respuesta, pero los clientes no-navegador (curl, scripts)
 * siguen funcionando porque no las necesitan.
 */

const ALLOWED_METHODS = 'GET, POST, PUT, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, x-api-key, Authorization';

function configuredOrigins(): string[] {
  return (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/** Devuelve el `Origin` si esta permitido, o null. */
export function resolveAllowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (configuredOrigins().includes(origin)) return origin;

  if (process.env.NODE_ENV !== 'production') {
    try {
      const { hostname } = new URL(origin);
      if (hostname === 'localhost' || hostname === '127.0.0.1') return origin;
    } catch {
      /* origin no parseable */
    }
  }
  return null;
}

/** Añade las cabeceras CORS a `res` si hay un origen permitido. */
export function applyCorsHeaders(res: NextResponse, allowOrigin: string | null): NextResponse {
  if (!allowOrigin) return res;
  res.headers.set('Access-Control-Allow-Origin', allowOrigin);
  res.headers.append('Vary', 'Origin');
  res.headers.set('Access-Control-Allow-Credentials', 'true');
  res.headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  res.headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  res.headers.set('Access-Control-Max-Age', '86400');
  return res;
}
