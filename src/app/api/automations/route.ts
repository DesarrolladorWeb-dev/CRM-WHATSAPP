import { NextRequest, NextResponse } from 'next/server';
import { connectToPostgres } from '@/lib/postgres';
import { captureException } from '@/lib/logger';
import {
  listAutomations,
  upsertAutomation,
  updateAutomation,
  deleteAutomation,
} from '@/lib/repositories/automationRepo';
import { INITIAL_AUTOMATIONS } from '@/mockData';
import { DEMO_MODE, dbUnavailableResponse } from '@/lib/demo';
import { automationCreateSchema, automationUpdateSchema, primerErrorDeZod } from '@/lib/schemas';
import { logger, motivo } from '@/lib/logger';
import { requireUserPermission } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const denied = await requireUserPermission(req, 'read');
  if (denied) return denied;

  try {
    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, source: 'demo', data: INITIAL_AUTOMATIONS });
      }
      return dbUnavailableResponse();
    }

    const rules = await listAutomations(db);
    if (rules.length === 0 && DEMO_MODE) {
      return NextResponse.json({ success: true, source: 'demo', data: INITIAL_AUTOMATIONS });
    }
    return NextResponse.json({ success: true, source: 'postgres', data: rules });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/automations', method: 'GET' });
    logger.error('Error in GET /api/automations', { motivo: motivo(error) });
    if (DEMO_MODE) {
      return NextResponse.json({ success: true, source: 'demo', data: INITIAL_AUTOMATIONS });
    }
    return NextResponse.json(
      { success: false, error: 'No se pudieron obtener las automatizaciones', errorId },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = automationCreateSchema.safeParse(body);
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

    const id = parsed.data.id || `auto_${Date.now()}`;
    const saved = await upsertAutomation(db, id, parsed.data);
    return NextResponse.json({ success: true, source: 'postgres', data: saved });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/automations', method: 'POST' });
    logger.error('Error in POST /api/automations', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = automationUpdateSchema.safeParse(body);
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

    const updated = await updateAutomation(db, parsed.data.id, parsed.data);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Regla no encontrada' }, { status: 404 });
    }
    return NextResponse.json({ success: true, source: 'postgres', data: updated });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/automations', method: 'PUT' });
    logger.error('Error in PUT /api/automations', { motivo: motivo(error) });
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
        return NextResponse.json({ success: true, message: 'Regla eliminada (demo)' });
      }
      return dbUnavailableResponse();
    }
    await deleteAutomation(db, id);

    return NextResponse.json({ success: true, message: 'Regla eliminada' });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/automations', method: 'DELETE' });
    logger.error('Error in DELETE /api/automations', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}