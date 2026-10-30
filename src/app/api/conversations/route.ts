import { NextRequest, NextResponse } from 'next/server';
import { connectToPostgres } from '@/lib/postgres';
import { captureException } from '@/lib/logger';
import {
  listConversations,
  upsertConversation,
  updateConversation,
  deleteConversation,
} from '@/lib/repositories/conversationRepo';
import { INITIAL_CONVERSATIONS } from '@/mockData';
import { DEMO_MODE, dbUnavailableResponse } from '@/lib/demo';
import { conversationCreateSchema, conversationUpdateSchema, primerErrorDeZod } from '@/lib/schemas';
import { logger, motivo } from '@/lib/logger';
import { requireUserPermission } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const denied = await requireUserPermission(req, 'read');
  if (denied) return denied;

  try {
    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, source: 'demo', data: INITIAL_CONVERSATIONS });
      }
      return dbUnavailableResponse();
    }

    const { searchParams } = new URL(req.url);
    const conversations = await listConversations(db, { channel: searchParams.get('channel') });

    if (conversations.length === 0 && DEMO_MODE) {
      return NextResponse.json({ success: true, source: 'demo', data: INITIAL_CONVERSATIONS });
    }
    return NextResponse.json({ success: true, source: 'postgres', data: conversations });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/conversations', method: 'GET' });
    logger.error('Error in GET /api/conversations', { motivo: motivo(error) });
    if (DEMO_MODE) {
      return NextResponse.json({ success: true, source: 'demo', data: INITIAL_CONVERSATIONS });
    }
    return NextResponse.json(
      { success: false, error: 'No se pudieron obtener las conversaciones', errorId },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = conversationCreateSchema.safeParse(body);
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

    const convId = parsed.data.id || `conv_${Date.now()}`;
    const saved = await upsertConversation(db, convId, parsed.data);
    return NextResponse.json({ success: true, source: 'postgres', data: saved });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/conversations', method: 'POST' });
    logger.error('Error in POST /api/conversations', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = conversationUpdateSchema.safeParse(body);
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

    const updated = await updateConversation(db, parsed.data.id, parsed.data);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Conversación no encontrada' }, { status: 404 });
    }
    return NextResponse.json({ success: true, source: 'postgres', data: updated });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/conversations', method: 'PUT' });
    logger.error('Error in PUT /api/conversations', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireUserPermission(req, 'delete')
  if (denied) return denied

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ success: false, error: 'ID requerido' }, { status: 400 })

    const db = await connectToPostgres()
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, source: 'demo', message: 'Conversación eliminada' });
      }
      return dbUnavailableResponse();
    }

    await deleteConversation(db, id)
    return NextResponse.json({ success: true, message: 'Conversación eliminada' });

  } catch (error) {
    const errorId = captureException(error, { route: '/api/conversations', method: 'DELETE' })
    logger.error('ERROR in DELETE /api/conversations', { motivo: motivo(error) })
    return NextResponse.json({ success: false, error: 'Error interno en el servidor: ', errorId }, { status: 500 })
  }

}