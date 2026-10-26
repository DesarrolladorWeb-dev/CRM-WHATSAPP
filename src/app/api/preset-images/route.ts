import { NextRequest, NextResponse } from 'next/server';
import { connectToPostgres } from '@/lib/postgres';
import { captureException } from '@/lib/logger';
import {
  listPresetImages,
  createPresetImage,
  deletePresetImage,
} from '@/lib/repositories/presetImageRepo';
import { INITIAL_PRESET_IMAGES } from '@/mockData';
import { DEMO_MODE, dbUnavailableResponse } from '@/lib/demo';
import { presetImageCreateSchema, primerErrorDeZod } from '@/lib/schemas';
import { logger, motivo } from '@/lib/logger';
import { requireUserPermission } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const denied = await requireUserPermission(req, 'read');
  if (denied) return denied;

  try {
    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, source: 'demo', data: INITIAL_PRESET_IMAGES });
      }
      return dbUnavailableResponse();
    }

    const images = await listPresetImages(db);
    if (images.length === 0 && DEMO_MODE) {
      return NextResponse.json({ success: true, source: 'demo', data: INITIAL_PRESET_IMAGES });
    }
    return NextResponse.json({ success: true, source: 'postgres', data: images });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/preset-images', method: 'GET' });
    logger.error('Error in GET /api/preset-images', { motivo: motivo(error) });
    if (DEMO_MODE) {
      return NextResponse.json({ success: true, source: 'demo', data: INITIAL_PRESET_IMAGES });
    }
    return NextResponse.json(
      { success: false, error: 'No se pudieron obtener las imágenes de la galería', errorId },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = presetImageCreateSchema.safeParse(body);
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

    const saved = await createPresetImage(db, parsed.data);
    return NextResponse.json({ success: true, source: 'postgres', data: saved });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/preset-images', method: 'POST' });
    logger.error('Error in POST /api/preset-images', { motivo: motivo(error) });
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
        return NextResponse.json({ success: true, message: 'Imagen eliminada (demo)' });
      }
      return dbUnavailableResponse();
    }
    await deletePresetImage(db, id);

    return NextResponse.json({ success: true, message: 'Imagen eliminada' });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/preset-images', method: 'DELETE' });
    logger.error('Error in DELETE /api/preset-images', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}
