import { NextRequest, NextResponse } from 'next/server';
import { requireUserPermission } from '@/lib/auth';
import { connectToPostgres } from '@/lib/postgres';
import { captureException, logger, motivo } from '@/lib/logger';
import { dbUnavailableResponse } from '@/lib/demo';
import { launchCampaign } from '@/lib/services/campaignService';
import { despacharConCerrojo } from '@/lib/services/campaignScheduler';

/**
 * POST /api/campaigns/[id]/send
 *
 * Lanza una campana ya guardada. No recibe cuerpo: es una ORDEN sobre un
 * recurso existente, no un formulario. Todo lo que se envia sale de lo que ya
 * esta en la base de datos, de modo que lo que el usuario confirmo en la
 * previsualizacion es exactamente lo que se manda.
 *
 * Responde en cuanto la audiencia esta materializada y la campana marcada como
 * `running`; el envio real continua despues. Asi la interfaz no se queda
 * bloqueada varios minutos esperando a que salgan cientos de mensajes.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Enviar una difusion masiva es irreversible: exige permiso de escritura.
  // Mismo guardian que el resto de /api/campaigns: la sesion del usuario
  // (cabecera x-verified-user-id que pone el middleware), no una API key.
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const { id } = await ctx.params;

    const db = await connectToPostgres();
    if (!db) return dbUnavailableResponse();

    const resultado = await launchCampaign(db, id);

    if (!resultado.ok) {
      // Cada motivo tiene su codigo HTTP: no encontrado, estado incompatible
      // (409 = conflicto con el estado actual) o audiencia vacia (422 = los
      // datos son correctos pero el envio no tiene sentido).
      const estados = {
        NOT_FOUND: 404,
        INVALID_STATE: 409,
        EMPTY_AUDIENCE: 422,
        BAD_CHANNEL: 422,
      } as const;

      return NextResponse.json(
        { success: false, error: resultado.message, code: resultado.code },
        { status: estados[resultado.code] }
      );
    }

    // El despacho se deja corriendo sin bloquear la respuesta. Si el proceso
    // se corta a mitad, los destinatarios ya estan guardados como 'pending':
    // el worker (`campaignScheduler`) los retoma en el siguiente tick sin
    // reenviar a nadie, porque el indice unico (campaignId, contactId) impide
    // duplicarlos.
    //
    // Pasa por `despacharConCerrojo` y no por `dispatchCampaign` directamente
    // para compartir cerrojo con el worker: sin eso, el tick del minuto
    // siguiente veria esta campana como `running` con pendientes, empezaria un
    // segundo despacho en paralelo y ambos leerian el mismo lote.
    void despacharConCerrojo(db, id).catch((error) => {
      captureException(error, { route: '/api/campaigns/[id]/send', fase: 'dispatch' });
      logger.error('Fallo el despacho de la campana', { campaignId: id, motivo: motivo(error) });
    });

    return NextResponse.json({
      success: true,
      source: 'postgres',
      data: {
        campaignId: id,
        recipientCount: resultado.recipientCount,
        excluded: resultado.skipped,
        status: 'running',
      },
    });
  } catch (error: unknown) {
    const errorId = captureException(error, { route: '/api/campaigns/[id]/send', method: 'POST' });
    logger.error('Error in POST /api/campaigns/[id]/send', { motivo: motivo(error) });
    return NextResponse.json(
      { success: false, error: 'No se pudo lanzar la campana', errorId },
      { status: 500 }
    );
  }
}
