import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * Modo demo explícito.
 *
 * Por defecto (sin `DEMO_MODE`), si Postgres o Mongo no responden, las rutas de
 * la API devuelven un 503 real: nunca se sirven los datos de ejemplo de
 * `src/mockData.ts` disfrazados de datos reales, y una escritura contra una base
 * caída falla en vez de responder `success: true` sin persistir nada.
 *
 * Con `DEMO_MODE=true` se recupera el comportamiento anterior: las rutas caen a
 * los `INITIAL_*` de `mockData.ts` (marcados con `source: 'demo'`) para poder
 * enseñar la interfaz sin bases de datos levantadas.
 *
 * En `NODE_ENV=production` `DEMO_MODE` se ignora siempre: aunque la variable
 * esté a `true`, las rutas responden 503 cuando la base de datos no está
 * disponible. Servir datos de ejemplo como si fueran reales en producción es un
 * fallo silencioso, no una funcionalidad; si la env var llega a producción se
 * deja constancia con un `warn` al arrancar.
 */
const demoSolicitado = process.env.DEMO_MODE === 'true';
const enProduccion = process.env.NODE_ENV === 'production';

export const DEMO_MODE = demoSolicitado && !enProduccion;

if (demoSolicitado && enProduccion) {
  logger.warn('demo_mode.ignorado_en_produccion', {
    detalle:
      'DEMO_MODE=true se ignora en producción: las rutas devuelven 503 en vez de datos de ejemplo.',
  });
}

/** Respuesta estándar para "la base de datos no está disponible". */
export function dbUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: 'Base de datos no disponible. Inténtalo de nuevo en unos momentos.',
      code: 'DB_UNAVAILABLE',
    },
    { status: 503 }
  );
}
