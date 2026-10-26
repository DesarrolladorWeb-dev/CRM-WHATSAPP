import { NextRequest, NextResponse } from 'next/server';
import { requireUserPermission } from '@/lib/auth';
import { connectToPostgres } from '@/lib/postgres';
import { captureException } from '@/lib/logger';
import {
  listCampaigns,
  upsertCampaign,
  updateCampaign,
  deleteCampaign,
  getCampaign,
} from '@/lib/repositories/campaignRepo';
import { INITIAL_CAMPAIGN } from '@/mockData';
import { DEMO_MODE, dbUnavailableResponse } from '@/lib/demo';
import { campaignCreateSchema, campaignUpdateSchema, primerErrorDeZod } from '@/lib/schemas';
import { logger, motivo } from '@/lib/logger';
import {
  puedeTransicionar,
  esEditable,
  puedeBorrarse,
  motivoTransicionInvalida,
} from '@/lib/services/campaignStatus';
import type { CampaignStatus } from '@/types';
import { parseScheduledAt, formatDateTime } from '@/lib/time';

/**
 * Margen hacia atras al programar una campana.
 *
 * El reloj del navegador y el del servidor no coinciden al segundo, asi que
 * programar «para dentro de un minuto» podria llegar aqui como una fecha ya
 * pasada y ser rechazada sin motivo aparente. Dos minutos absorben ese desfase
 * sin llegar a permitir programar para ayer.
 */
const MARGEN_PASADO_MS = 2 * 60 * 1000;

/**
 * Comprueba que la fecha de programacion tenga sentido.
 *
 * Programar para el pasado no se acepta: o es un error de quien lo escribe, o
 * es una forma indirecta de decir «envia ya», y para eso existe el boton de
 * disparar. Aceptarlo en silencio haria que el worker lo mandara todo en el
 * siguiente minuto, que casi nunca es lo que se queria.
 */
function fechaProgramadaInvalida(valor: string | null | undefined): string | null {
  if (!valor) return null;

  const fecha = parseScheduledAt(valor);
  if (!fecha) return 'La fecha de programacion no se entiende.';

  if (fecha.getTime() < Date.now() - MARGEN_PASADO_MS) {
    return `La fecha de programacion (${formatDateTime(fecha)}) ya pasó. Elige una futura.`;
  }

  return null;
}

export async function GET(req: NextRequest) {
  const denied = await requireUserPermission(req, 'read');
  if (denied) return denied;

  try {
    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, source: 'demo', data: INITIAL_CAMPAIGN });
      }
      return dbUnavailableResponse();
    }

    const campaigns = await listCampaigns(db);
    if (campaigns.length === 0 && DEMO_MODE) {
      return NextResponse.json({ success: true, source: 'demo', data: INITIAL_CAMPAIGN });
    }
    return NextResponse.json({ success: true, source: 'postgres', data: campaigns });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/campaigns', method: 'GET' });
    logger.error('Error in GET /api/campaigns', { motivo: motivo(error) });
    if (DEMO_MODE) {
      return NextResponse.json({ success: true, source: 'demo', data: INITIAL_CAMPAIGN });
    }
    return NextResponse.json(
      { success: false, error: 'No se pudieron obtener las campañas', errorId },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = campaignCreateSchema.safeParse(body);
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

    // Una campaña apunta a un segmento por clave foránea. Si el segmento no
    // existe en la base, el INSERT falla con P2003 y el usuario recibía un
    // «Error interno del servidor» que no explicaba nada. El caso típico: la
    // interfaz ofrece segmentos de los datos de ejemplo mientras la base está
    // vacía o sin sembrar.
    const segmento = await db.segment.findUnique({
      where: { id: parsed.data.segmentId },
      select: { id: true, name: true },
    });
    if (!segmento) {
      return NextResponse.json(
        {
          success: false,
          error: `El segmento «${parsed.data.segmentId}» no existe en la base de datos. Crea el segmento o ejecuta la carga inicial (npm run db:seed) antes de guardar la campaña.`,
          code: 'SEGMENT_NOT_FOUND',
        },
        { status: 422 }
      );
    }

    const fechaMal = fechaProgramadaInvalida(parsed.data.scheduledAt);
    if (fechaMal) {
      return NextResponse.json(
        { success: false, error: fechaMal, code: 'INVALID_SCHEDULE' },
        { status: 422 }
      );
    }

    const id = parsed.data.id || `camp_${Date.now()}`;

    // Una campana SIEMPRE nace como borrador. `running` deja de ser un valor
    // que el cliente pueda escribir: para enviar hay que pasar por
    // POST /api/campaigns/[id]/send, que es quien resuelve la audiencia y
    // registra los destinatarios. Guardar no es enviar.
    const saved = await upsertCampaign(db, id, {
      ...parsed.data,
      // El nombre del segmento lo pone el servidor, no el cliente: es una copia
      // desnormalizada y debe corresponder al segmento real.
      segmentName: segmento.name,
      status: parsed.data.status === 'scheduled' ? 'scheduled' : 'draft',
    });
    return NextResponse.json({ success: true, source: 'postgres', data: saved });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/campaigns', method: 'POST' });
    logger.error('Error in POST /api/campaigns', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = campaignUpdateSchema.safeParse(body);
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

    const actual = await getCampaign(db, parsed.data.id);
    if (!actual) {
      return NextResponse.json({ success: false, error: 'Campaña no encontrada' }, { status: 404 });
    }

    // Una campaña que ya salió no se puede reescribir. Sin esta comprobación
    // bastaba un PUT para devolver a 'running' una campaña completada y
    // reenviarla entera, o para cambiar el texto a mitad de envío y que media
    // audiencia recibiera un mensaje distinto a la otra media.
    const destino = (parsed.data.status ?? actual.status) as CampaignStatus;
    if (!puedeTransicionar(actual.status, destino)) {
      return NextResponse.json(
        {
          success: false,
          error: motivoTransicionInvalida(actual.status, destino),
          code: 'INVALID_TRANSITION',
        },
        { status: 409 }
      );
    }

    const fechaMal = fechaProgramadaInvalida(parsed.data.scheduledAt);
    if (fechaMal) {
      return NextResponse.json(
        { success: false, error: fechaMal, code: 'INVALID_SCHEDULE' },
        { status: 422 }
      );
    }

    // Dejar una campana en `scheduled` sin fecha la condena a no salir nunca:
    // el worker busca por `scheduledAt`. Aqui si se puede comprobar contra lo
    // ya guardado, cosa que el schema por si solo no puede hacer.
    const fechaResultante =
      parsed.data.scheduledAt !== undefined ? parsed.data.scheduledAt : actual.scheduledAt;
    if (destino === 'scheduled' && !fechaResultante) {
      return NextResponse.json(
        {
          success: false,
          error: 'Una campaña programada necesita fecha y hora de lanzamiento.',
          code: 'MISSING_SCHEDULE',
        },
        { status: 422 }
      );
    }

    const tocaContenido =
      parsed.data.content !== undefined ||
      parsed.data.segmentId !== undefined ||
      parsed.data.channel !== undefined ||
      parsed.data.imageUrl !== undefined ||
      // Reprogramar tambien es editar: cambiar la hora de una campana que ya
      // salio no significa nada, y en una `running` solo confundiria el
      // historico. `esEditable` ya restringe a draft/scheduled.
      parsed.data.scheduledAt !== undefined;

    if (tocaContenido && !esEditable(actual.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `El contenido de una campaña en estado «${actual.status}» ya no se puede modificar.`,
          code: 'NOT_EDITABLE',
        },
        { status: 409 }
      );
    }

    const updated = await updateCampaign(db, parsed.data.id, parsed.data);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Campaña no encontrada' }, { status: 404 });
    }
    return NextResponse.json({ success: true, source: 'postgres', data: updated });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/campaigns', method: 'PUT' });
    logger.error('Error in PUT /api/campaigns', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  // Borrar exige el permiso explicito 'delete' (no basta con 'write'). Las
  // credenciales de administrador y la master key lo satisfacen igualmente.
  const denied = await requireUserPermission(req, 'delete');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'ID requerido' }, { status: 400 });

    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, message: 'Campaña eliminada (demo)' });
      }
      return dbUnavailableResponse();
    }

    const existing = await getCampaign(db, id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Campaña no encontrada' }, { status: 404 });
    }

    // Borrar una campaña en vuelo dejaría el envío a medias y sin rastro de a
    // quién se le llegó a escribir. Primero hay que pausarla o esperar a que
    // termine.
    if (!puedeBorrarse(existing.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `No se puede eliminar una campaña en estado «${existing.status}». Pausala o espera a que termine.`,
          code: 'NOT_DELETABLE',
        },
        { status: 409 }
      );
    }

    await deleteCampaign(db, id);
    return NextResponse.json({ success: true, message: 'Campaña eliminada' });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/campaigns', method: 'DELETE' });
    logger.error('Error in DELETE /api/campaigns', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}