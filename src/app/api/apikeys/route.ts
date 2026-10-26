import { NextRequest, NextResponse } from 'next/server';
import { connectToPostgres } from '@/lib/postgres';
import { listApiKeys, createApiKey, deleteApiKey } from '@/lib/repositories/apiKeyRepo';
import { DEMO_MODE, dbUnavailableResponse } from '@/lib/demo';
import { apiKeyCreateSchema, primerErrorDeZod } from '@/lib/schemas';
import { requireUserPermission } from '@/lib/auth';

// Listar solo expone metadata + un preview enmascarado (nunca la clave ni su
// hash), asi que basta con 'read', igual que el resto del dashboard.
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
    return NextResponse.json({ success: true, source: 'postgres', data: await listApiKeys(db) });
  } catch {
    return NextResponse.json(
      { success: false, error: 'No se pudieron obtener las claves API' },
      { status: 500 }
    );
  }
}

// Crear y revocar requieren 'admin': una clave con solo 'write' no debe poder
// auto-otorgarse una clave nueva con permisos mayores a los suyos (escalada de
// privilegios). Por diseno, la clave publica del frontend (NEXT_PUBLIC_API_KEY,
// visible en el bundle del navegador) nunca debe tener 'admin'.
export async function POST(req: NextRequest) {
  const denied = await requireUserPermission(req, 'admin');
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = apiKeyCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: primerErrorDeZod(parsed.error), details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const db = await connectToPostgres();
    if (!db) {
      return NextResponse.json(
        { success: false, error: 'No se pudo conectar a la base de datos: la clave no se genero' },
        { status: 503 }
      );
    }

    const created = await createApiKey(db, parsed.data);
    // Unico momento en el que la clave en texto plano viaja al cliente.
    return NextResponse.json(
      {
        success: true,
        data: created,
        message: 'Guarda esta clave ahora: no volvera a mostrarse completa.',
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo crear la clave API' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireUserPermission(req, 'admin');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'ID requerido' }, { status: 400 });

    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, message: 'Clave API revocada (demo)' });
      }
      return dbUnavailableResponse();
    }
    await deleteApiKey(db, id);
    return NextResponse.json({ success: true, message: 'Clave API revocada' });
  } catch {
    return NextResponse.json({ success: false, error: 'No se pudo revocar la clave API' }, { status: 500 });
  }
}
