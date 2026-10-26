import { NextRequest, NextResponse } from 'next/server';
import { connectToPostgres } from '@/lib/postgres';
import { captureException, logger, motivo } from '@/lib/logger';
import { dbUnavailableResponse } from '@/lib/demo';
import { safeEqual } from '@/lib/apiKeySecurity';
import { ejecutarTick } from '@/lib/services/campaignScheduler';

/**
 * POST /api/campaigns/tick  (GET tambien, ver mas abajo)
 *
 * Fuerza una vuelta del worker de campanas: lanza las programadas que ya
 * vencieron y retoma las que quedaron a medias.
 *
 * En el despliegue normal (proceso Node persistente) no hace falta llamarla:
 * `instrumentation.ts` arranca el temporizador interno y esto ocurre solo cada
 * minuto. Este endpoint existe para tres casos:
 *
 *   - forzar un envio a mano sin esperar al minuto siguiente,
 *   - un cron externo (crontab, Vercel Cron, GitHub Actions) si algun dia se
 *     despliega en serverless, donde el proceso muere entre peticiones y el
 *     temporizador interno no llegaria a disparar nunca,
 *   - comprobar desde fuera que el worker hace lo que dice.
 *
 * No devuelve datos de negocio, solo cuantas campanas toco.
 */

/** Cabecera propia; tambien se acepta `Authorization: Bearer` (Vercel Cron). */
const CABECERA = 'x-cron-secret';

/**
 * Comprueba el secreto compartido.
 *
 * Esta ruta esta EXCEPTUADA de la sesion JWT en el middleware (un cron no
 * tiene sesion de usuario), asi que este es el unico guardian que tiene. De
 * ahi que falle cerrada: sin `CRON_SECRET` configurado no se ejecuta nada, en
 * vez de quedar abierta a cualquiera que descubra la URL. Disparar campanas
 * es irreversible: una ruta de despacho publica es una fuga de mensajes a
 * clientes reales.
 */
function credencialValida(req: NextRequest): { ok: boolean; status?: number; error?: string } {
  const secreto = process.env.CRON_SECRET;

  if (!secreto) {
    return {
      ok: false,
      status: 503,
      error:
        'CRON_SECRET no esta configurado: el disparador externo de campanas esta deshabilitado.',
    };
  }

  const cabecera = req.headers.get(CABECERA);
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const recibido = cabecera || bearer;

  // `safeEqual` compara en tiempo constante, el mismo helper que usan las API
  // keys: comparar con `===` filtra el secreto caracter a caracter.
  if (!recibido || !safeEqual(recibido, secreto)) {
    return { ok: false, status: 401, error: 'Credencial de cron invalida.' };
  }

  return { ok: true };
}

async function manejar(req: NextRequest) {
  const cred = credencialValida(req);
  if (!cred.ok) {
    // Se registra el intento: alguien llamando a esta ruta sin el secreto
    // correcto es informacion que se quiere ver en el log.
    logger.warn('campaign.tick_rechazado', { status: cred.status });
    return NextResponse.json({ success: false, error: cred.error }, { status: cred.status });
  }

  try {
    const db = await connectToPostgres();
    if (!db) return dbUnavailableResponse();

    const resumen = await ejecutarTick(db);

    return NextResponse.json({ success: true, source: 'postgres', data: resumen });
  } catch (error: unknown) {
    const errorId = captureException(error, { route: '/api/campaigns/tick' });
    logger.error('Error en el tick de campanas', { motivo: motivo(error) });
    return NextResponse.json(
      { success: false, error: 'No se pudo ejecutar el tick de campanas', errorId },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return manejar(req);
}

/**
 * GET hace lo mismo que POST, a proposito.
 *
 * Un GET que provoca envios no es idempotente y normalmente estaria mal, pero
 * varios servicios de cron (Vercel Cron entre ellos) solo saben hacer GET. La
 * alternativa seria no poder programar campanas en esos entornos. El riesgo de
 * que un rastreador lo dispare por accidente es nulo: sin el secreto correcto
 * la ruta responde 401 sin tocar la base de datos.
 */
export async function GET(req: NextRequest) {
  return manejar(req);
}
