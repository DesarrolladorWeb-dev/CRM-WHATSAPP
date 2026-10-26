import { NextResponse } from 'next/server';

/**
 * Healthcheck de liveness para balanceadores y orquestadores.
 * No exige credencial ni consulta las bases de datos: solo confirma que
 * el proceso responde. El estado detallado de las conexiones sigue en
 * /api/health, que si requiere API key.
 */
export async function GET() {
  return NextResponse.json(
    { status: 'ok', timestamp: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
