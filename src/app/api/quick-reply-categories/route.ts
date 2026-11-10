import { NextRequest, NextResponse } from 'next/server';
import { connectToPostgres } from '@/lib/postgres';
import { captureException, logger, motivo } from '@/lib/logger';
import {
  createQuickReplyCategory,
  deleteQuickReplyCategory,
  listQuickReplyCategories,
  QuickReplyCategoryDefaultError,
  QuickReplyCategoryInUseError,
  QuickReplyCategoryNameExistsError,
  updateQuickReplyCategory,
} from '@/lib/repositories/quickReplyCategoryRepo';
import { DEMO_MODE, dbUnavailableResponse } from '@/lib/demo';
import {
  quickReplyCategoryCreateSchema,
  quickReplyCategoryUpdateSchema,
  primerErrorDeZod,
} from '@/lib/schemas';
import { requireUserPermission } from '@/lib/auth';

function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

export async function GET(req: NextRequest) {
  const denied = await requireUserPermission(req, 'read');
  if (denied) return denied;

  try {
    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) return NextResponse.json({ success: true, source: 'demo', data: [] });
      return dbUnavailableResponse();
    }
    return NextResponse.json({
      success: true,
      source: 'postgres',
      data: await listQuickReplyCategories(db),
    });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/quick-reply-categories', method: 'GET' });
    logger.error('Error in GET /api/quick-reply-categories', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'No se pudieron obtener las categorías', errorId }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = quickReplyCategoryCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: primerErrorDeZod(parsed.error), details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = await connectToPostgres();
    if (!db) return dbUnavailableResponse();

    const category = await createQuickReplyCategory(db, parsed.data);
    return NextResponse.json({ success: true, source: 'postgres', data: category }, { status: 201 });
  } catch (error) {
    if (error instanceof QuickReplyCategoryNameExistsError || prismaErrorCode(error) === 'P2002') {
      return NextResponse.json({ success: false, error: 'Ya existe una categoría con ese nombre' }, { status: 409 });
    }
    const errorId = captureException(error, { route: '/api/quick-reply-categories', method: 'POST' });
    logger.error('Error in POST /api/quick-reply-categories', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'No se pudo crear la categoría', errorId }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = quickReplyCategoryUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: primerErrorDeZod(parsed.error), details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = await connectToPostgres();
    if (!db) return dbUnavailableResponse();
    const { id, ...changes } = parsed.data;
    const category = await updateQuickReplyCategory(db, id, changes);
    return NextResponse.json({ success: true, source: 'postgres', data: category });
  } catch (error) {
    if (error instanceof QuickReplyCategoryNameExistsError || prismaErrorCode(error) === 'P2002') {
      return NextResponse.json({ success: false, error: 'Ya existe una categoría con ese nombre' }, { status: 409 });
    }
    if (prismaErrorCode(error) === 'P2025') {
      return NextResponse.json({ success: false, error: 'La categoría ya no existe' }, { status: 404 });
    }
    const errorId = captureException(error, { route: '/api/quick-reply-categories', method: 'PATCH' });
    logger.error('Error in PATCH /api/quick-reply-categories', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'No se pudo actualizar la categoría', errorId }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireUserPermission(req, 'delete');
  if (denied) return denied;

  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'ID requerido' }, { status: 400 });

    const db = await connectToPostgres();
    if (!db) return dbUnavailableResponse();
    await deleteQuickReplyCategory(db, id);
    return NextResponse.json({ success: true, message: 'Categoría eliminada' });
  } catch (error) {
    if (error instanceof QuickReplyCategoryDefaultError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    if (error instanceof QuickReplyCategoryInUseError || prismaErrorCode(error) === 'P2003') {
      const usageCount = error instanceof QuickReplyCategoryInUseError ? error.usageCount : undefined;
      return NextResponse.json(
        { success: false, error: 'No se puede eliminar una categoría que está asignada a plantillas', usageCount },
        { status: 409 }
      );
    }
    if (prismaErrorCode(error) === 'P2025') {
      return NextResponse.json({ success: false, error: 'La categoría ya no existe' }, { status: 404 });
    }
    const errorId = captureException(error, { route: '/api/quick-reply-categories', method: 'DELETE' });
    logger.error('Error in DELETE /api/quick-reply-categories', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'No se pudo eliminar la categoría', errorId }, { status: 500 });
  }
}
