import { NextRequest, NextResponse } from 'next/server';
import { connectToPostgres } from '@/lib/postgres';
import { captureException } from '@/lib/logger';
import {
  listSegments,
  upsertSegment,
  updateSegment,
  deleteSegment,
} from '@/lib/repositories/segmentRepo';
import { INITIAL_SEGMENTS } from '@/mockData';
import { DEMO_MODE, dbUnavailableResponse } from '@/lib/demo';
import { segmentCreateSchema, segmentUpdateSchema, primerErrorDeZod } from '@/lib/schemas';
import { logger, motivo } from '@/lib/logger';
import { requireUserPermission } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const denied = await requireUserPermission(req, 'read');
  if (denied) return denied;

  try {
    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, source: 'demo', data: INITIAL_SEGMENTS });
      }
      return dbUnavailableResponse();
    }

    const segments = await listSegments(db);
    if (segments.length === 0 && DEMO_MODE) {
      return NextResponse.json({ success: true, source: 'demo', data: INITIAL_SEGMENTS });
    }
    return NextResponse.json({ success: true, source: 'postgres', data: segments });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/segments', method: 'GET' });
    logger.error('Error in GET /api/segments', { motivo: motivo(error) });
    if (DEMO_MODE) {
      return NextResponse.json({ success: true, source: 'demo', data: INITIAL_SEGMENTS });
    }
    return NextResponse.json(
      { success: false, error: 'No se pudieron obtener los segmentos', errorId },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = segmentCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: primerErrorDeZod(parsed.error), details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, source: 'demo', data: parsed.data });
      }
      return dbUnavailableResponse();
    }

    const id = parsed.data.id || `seg_${Date.now()}`;
    const saved = await upsertSegment(db, id, parsed.data);
    return NextResponse.json({ success: true, source: 'postgres', data: saved });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/segments', method: 'POST' });
    logger.error('Error in POST /api/segments', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = segmentUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: primerErrorDeZod(parsed.error), details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, source: 'demo', data: parsed.data });
      }
      return dbUnavailableResponse();
    }

    const updated = await updateSegment(db, parsed.data.id, parsed.data);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Segmento no encontrado' }, { status: 404 });
    }
    return NextResponse.json({ success: true, source: 'postgres', data: updated });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/segments', method: 'PUT' });
    logger.error('Error in PUT /api/segments', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'ID requerido' }, { status: 400 });

    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, message: 'Segmento eliminado (demo)' });
      }
      return dbUnavailableResponse();
    }
    await deleteSegment(db, id);

    return NextResponse.json({ success: true, message: 'Segmento eliminado' });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/segments', method: 'DELETE' });
    logger.error('Error in DELETE /api/segments', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}