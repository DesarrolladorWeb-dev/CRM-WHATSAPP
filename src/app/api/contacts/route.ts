import { NextRequest, NextResponse } from 'next/server';
import { connectToPostgres } from '@/lib/postgres';
import { captureException } from '@/lib/logger';
import {
  listContacts,
  upsertContact,
  updateContact,
  deleteContacts,
  getContact,
} from '@/lib/repositories/contactRepo';
import type { PrismaClient } from '@/generated/prisma/client';
import { INITIAL_CONTACTS } from '@/mockData';
import { DEMO_MODE, dbUnavailableResponse } from '@/lib/demo';
import { contactCreateSchema, contactUpdateSchema, primerErrorDeZod } from '@/lib/schemas';
import { logger, motivo } from '@/lib/logger';
import { requireUserPermission } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const denied = await requireUserPermission(req, 'read');
  if (denied) return denied;

  try {
    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, source: 'demo', data: INITIAL_CONTACTS });
      }
      return dbUnavailableResponse();
    }

    const { searchParams } = new URL(req.url);
    const contacts = await listContacts(db, {
      channel: searchParams.get('channel'),
      stage: searchParams.get('stage'),
    });

    if (contacts.length === 0 && DEMO_MODE) {
      return NextResponse.json({ success: true, source: 'demo', data: INITIAL_CONTACTS });
    }
    return NextResponse.json({ success: true, source: 'postgres', data: contacts });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/contacts', method: 'GET' });
    logger.error('Error in GET /api/contacts', { motivo: motivo(error) });
    if (DEMO_MODE) {
      return NextResponse.json({ success: true, source: 'demo', data: INITIAL_CONTACTS });
    }
    return NextResponse.json(
      { success: false, error: 'No se pudieron obtener los contactos', errorId },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  // Se sacan del try porque el catch de P2002 los necesita para poder decir
  // QUE choco: sin esto solo queda "Error interno del servidor".
  let parsed: ReturnType<typeof contactCreateSchema.safeParse> | null = null;
  let db: PrismaClient | null = null;

  try {
    const body = await req.json();
    const resultado = contactCreateSchema.safeParse(body);
    if (!resultado.success) {
      return NextResponse.json(
        { success: false, error: primerErrorDeZod(resultado.error), details: resultado.error.flatten() },
        { status: 400 }
      );
    }
    parsed = resultado;

    db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, source: 'demo', data: parsed.data });
      }
      return dbUnavailableResponse();
    }

    // El id SIEMPRE lo genera el servidor. Aceptar el del clienteconvertia
    // un POST en un sobrescritura: `{"id":"c_wa_51...","name":"Yo"}` se
    // llevaba por delante el contacto de otro con su conversacion, sus tags
    // y su historial. Para actualizar existe PUT, que si valida que exista.
    const contactId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { id: _ignorado, ...datos } = parsed.data;
    const saved = await upsertContact(db, contactId, datos);
    return NextResponse.json({ success: true, source: 'postgres', data: saved });
  } catch (error) {
    // `handle` es unico en Postgres. Registrar dos veces el mismo telefono (o
    // el mismo correo) es lo mas normal del mundo y caia en el 500 generico:
    // "Error interno del servidor", que ni insinua que el problema es que ese
    // contacto ya existe.
    if (esViolacionDeUnicidad(error) && parsed && db) {
      const { id: _i, ...resto } = parsed.data;
      const yaExiste = await buscarPorHandleOCorreo(db, resto);
      return NextResponse.json(
        {
          success: false,
          error: yaExiste
            ? `Ya existe un contacto con ese ${resto.phone ? 'teléfono' : 'correo'}: "${yaExiste.name}". Búscalo en el CRM o actualiza ese contacto en vez de crear otro.`
            : 'Ya existe un contacto con esos datos.',
        },
        { status: 409 }
      );
    }
    const errorId = captureException(error, { route: '/api/contacts', method: 'POST' });
    logger.error('Error in POST /api/contacts', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}

/** P2002 de Prisma: indice unico violado. */
function esViolacionDeUnicidad(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'P2002';
}

/**
 * Que contacto tiene ya ese telefono o correo.
 *
 * No se puede confiar en el indice para saber cual de los dos campos choco, asi
 * que se buscan los dos y se devuelve el que coincida.
 */
async function buscarPorHandleOCorreo(
  db: PrismaClient,
  datos: { handle?: string; phone?: string; email?: string }
): Promise<{ name: string } | null> {
  const found = await getContact(db, datos.handle || '__no_existe__');
  if (found) return found;
  if (datos.phone) {
    const porTelefono = await listContacts(db);
    const coincidencia = porTelefono.find((c) => c.phone && c.phone === datos.phone);
    if (coincidencia) return coincidencia;
  }
  return null;
}

export async function PUT(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = contactUpdateSchema.safeParse(body);
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

    const updated = await updateContact(db, parsed.data.id, parsed.data);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Contacto no encontrado' }, { status: 404 });
    }
    return NextResponse.json({ success: true, source: 'postgres', data: updated });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/contacts', method: 'PUT' });
    logger.error('Error in PUT /api/contacts', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await requireUserPermission(req, 'delete');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    let ids: string[] = id ? [id] : [];

    if (!id) {
      const body = await req.json().catch(() => null);
      if (Array.isArray(body?.ids)) {
        ids = body.ids.filter((x: unknown): x is string => typeof x === 'string' && x.length > 0);
      }
    }

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: 'ID requerido' }, { status: 400 });
    }
    if (ids.length > 100) {
      return NextResponse.json({ success: false, error: 'Maximo 100 contactos por solicitud' }, { status: 400 });
    }

    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, message: 'Contactos eliminados (demo)' });
      }
      return dbUnavailableResponse();
    }
    const count = await deleteContacts(db, ids);

    return NextResponse.json({ success: true, message: 'Contactos eliminados', count });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/contacts', method: 'DELETE' });
    logger.error('Error in DELETE /api/contacts', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}