import { NextRequest, NextResponse } from 'next/server';
import { connectToPostgres } from '@/lib/postgres';
import { captureException } from '@/lib/logger';
import {
  listQuickReplies,
  upsertQuickReply,
  deleteQuickReply,
} from '@/lib/repositories/quickReplyRepo';
import { INITIAL_QUICK_REPLIES } from '@/mockData';
import { DEMO_MODE, dbUnavailableResponse } from '@/lib/demo';
import { quickReplyCreateSchema, primerErrorDeZod } from '@/lib/schemas';
import { logger, motivo } from '@/lib/logger';
import { requireUserPermission } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const denied = await requireUserPermission(req, 'read');
  if (denied) return denied;

  try {
    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, source: 'demo', data: INITIAL_QUICK_REPLIES });
      }
      return dbUnavailableResponse();
    }

    const replies = await listQuickReplies(db);
    if (replies.length === 0 && DEMO_MODE) {
      return NextResponse.json({ success: true, source: 'demo', data: INITIAL_QUICK_REPLIES });
    }
    return NextResponse.json({ success: true, source: 'postgres', data: replies });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/quick-replies', method: 'GET' });
    logger.error('Error in GET /api/quick-replies', { motivo: motivo(error) });
    if (DEMO_MODE) {
      return NextResponse.json({ success: true, source: 'demo', data: INITIAL_QUICK_REPLIES });
    }
    return NextResponse.json(
      { success: false, error: 'No se pudieron obtener las respuestas rápidas', errorId },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = quickReplyCreateSchema.safeParse(body);
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

    const id = parsed.data.id || `qr_${Date.now()}`;
    const saved = await upsertQuickReply(db, id, parsed.data);
    return NextResponse.json({ success: true, source: 'postgres', data: saved });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/quick-replies', method: 'POST' });
    logger.error('Error in POST /api/quick-replies', { motivo: motivo(error) });
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
        return NextResponse.json({ success: true, message: 'Botón eliminado (demo)' });
      }
      return dbUnavailableResponse();
    }
    await deleteQuickReply(db, id);

    return NextResponse.json({ success: true, message: 'Botón eliminado' });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/quick-replies', method: 'DELETE' });
    logger.error('Error in DELETE /api/quick-replies', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}