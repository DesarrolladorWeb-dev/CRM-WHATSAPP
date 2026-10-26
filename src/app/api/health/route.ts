import { NextResponse } from 'next/server';
import { connectToDatabase, isDbConnected } from '@/lib/mongodb';
import { isPostgresConnected } from '@/lib/postgres';
import { isAiConfigured } from '@/lib/gemini';
import { captureException } from '@/lib/logger';

export async function GET() {
  try {
    await connectToDatabase().catch(() => null);
    const postgresConnected = await isPostgresConnected();
    const mongoDbConnected = isDbConnected();
    const healthy = postgresConnected && mongoDbConnected;

    return NextResponse.json(
      {
        status: healthy ? 'ok' : 'degraded',
        app: 'XIO CRM',
        framework: 'Next.js Full Stack (App Router)',
        timestamp: new Date().toISOString(),
        serverAiEnabled: isAiConfigured(),
        postgresConnected,
        mongoDbConnected,
        version: '1.0.0',
      },
      {
        // Un orquestador debe re-consultar en cada probe, nunca servir cache.
        status: healthy ? 200 : 503,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (err) {
    const errorId = captureException(err, { route: '/api/health' });
    return NextResponse.json(
      { status: 'error', error: 'No se pudo evaluar el estado del servidor', errorId },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}