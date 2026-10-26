import { NextRequest, NextResponse } from 'next/server';
import { connectToPostgres } from '@/lib/postgres';
import { listTags, createTag, deleteTag } from '@/lib/repositories/tagRepo';
import { DEMO_MODE, dbUnavailableResponse } from '@/lib/demo';
import { tagCreateSchema, primerErrorDeZod } from '@/lib/schemas';
import { captureException } from '@/lib/logger';
import { logger, motivo } from '@/lib/logger';
import { requireUserPermission } from '@/lib/auth';

// Las etiquetas antes vivian embebidas en cada contacto/segmento. Ahora son una
// entidad propia (tabla `tags` + uniones contact_tags / segment_tags).

export async function GET(req: NextRequest) {
  const denied = await requireUserPermission(req, 'read');
  if (denied) return denied;

  try {
    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, source: 'demo', data: [] });
      }
      return dbUnavailableResponse();
    }
    return NextResponse.json({ success: true, source: 'postgres', data: await listTags(db) });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/tags', method: 'GET' });
    logger.error('Error in GET /api/tags', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'No se pudieron obtener las etiquetas', errorId }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = tagCreateSchema.safeParse(body);
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
    return NextResponse.json({ success: true, source: 'postgres', data: await createTag(db, parsed.data) });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/tags', method: 'POST' });
    logger.error('Error in POST /api/tags', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireUserPermission(req, 'delete');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'ID requerido' }, { status: 400 });

    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, message: 'Etiqueta eliminada (demo)' });
      }
      return dbUnavailableResponse();
    }
    await deleteTag(db, id);
    return NextResponse.json({ success: true, message: 'Etiqueta eliminada' });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/tags', method: 'DELETE' });
    logger.error('Error in DELETE /api/tags', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}