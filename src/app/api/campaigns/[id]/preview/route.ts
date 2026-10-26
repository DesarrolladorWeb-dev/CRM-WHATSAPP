import { NextRequest, NextResponse } from 'next/server';
import { requireUserPermission } from '@/lib/auth';
import { connectToPostgres } from '@/lib/postgres';
import { captureException, logger, motivo } from '@/lib/logger';
import { dbUnavailableResponse } from '@/lib/demo';
import { previewCampaign } from '@/lib/services/campaignService';

/**
 * GET /api/campaigns/[id]/preview
 *
 * Calcula la audiencia real de una campana SIN enviar nada. Es el paso previo
 * obligatorio al envio: devuelve a cuantas personas va a llegar, por que se
 * excluye al resto y como queda el mensaje ya personalizado.
 *
 * Es de solo lectura, por eso pide permiso 'read': consultar a quien llegaria
 * una campana no deberia exigir permiso de escritura.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Mismo guardian que el resto de /api/campaigns: la sesion del usuario
  // (cabecera x-verified-user-id que pone el middleware), no una API key.
  const denied = await requireUserPermission(req, 'read');
  if (denied) return denied;

  try {
    const { id } = await ctx.params;

    const db = await connectToPostgres();
    if (!db) return dbUnavailableResponse();

    const preview = await previewCampaign(db, id);
    if (!preview) {
      return NextResponse.json(
        { success: false, error: 'Campana o segmento no encontrados' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, source: 'postgres', data: preview });
  } catch (error: unknown) {
    const errorId = captureException(error, {
      route: '/api/campaigns/[id]/preview',
      method: 'GET',
    });
    logger.error('Error in GET /api/campaigns/[id]/preview', { motivo: motivo(error) });
    return NextResponse.json(
      { success: false, error: 'No se pudo calcular la audiencia', errorId },
      { status: 500 }
    );
  }
}
