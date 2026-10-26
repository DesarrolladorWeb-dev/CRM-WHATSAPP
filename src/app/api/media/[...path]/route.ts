import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { requireUserPermission } from '@/lib/auth';
import { resolveMediaPath, mimeForExt } from '@/lib/mediaStorage';

/**
 * Sirve la multimedia de los mensajes (imagenes, audio, video, documentos)
 * desde la carpeta persistente configurada con MEDIA_STORAGE_DIR.
 *
 * Los archivos NO son publicos: el middleware de /api/* exige la sesion del
 * usuario y aqui se comprueba ademas el permiso de lectura. La proteccion
 * contra path traversal vive en resolveMediaPath().
 *
 * GET /api/media/<conversationId>/<archivo>
 *   ?download=1  -> Content-Disposition: attachment (forzar descarga)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const denied = await requireUserPermission(req, 'read');
  if (denied) return denied;

  try {
    const { path: segments } = await params;
    const fullPath = resolveMediaPath(segments || []);
    if (!fullPath) {
      return NextResponse.json(
        { success: false, error: 'Ruta de media invalida' },
        { status: 400 }
      );
    }

    const data = await fs.readFile(fullPath);
    const filename = path.basename(fullPath);
    const ext = path.extname(fullPath);
    const forceDownload = new URL(req.url).searchParams.get('download') === '1';

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': mimeForExt(ext),
        'Content-Length': String(data.byteLength),
        'Content-Disposition': `${forceDownload ? 'attachment' : 'inline'}; filename="${filename}"`,
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Archivo no encontrado' },
      { status: 404 }
    );
  }
}
