import type { PrismaClient } from '../../generated/prisma/client';
import { logger, captureException, motivo } from '@/lib/logger';
import { launchCampaign, dispatchCampaign } from './campaignService';

/**
 * El worker de campanas: lo que hace que una campana programada SALGA SOLA.
 *
 * Antes de este archivo, `launchCampaign` solo se invocaba desde
 * `POST /api/campaigns/[id]/send`, que exige una sesion con permiso de
 * escritura. Traducido: una campana programada no se enviaba nunca — se
 * quedaba en `scheduled` esperando un clic que nadie iba a dar.
 *
 * Cada vuelta (un «tick») hace exactamente dos cosas:
 *
 *   1. LANZAR  — campanas en `scheduled` cuya hora ya paso.
 *   2. RETOMAR — campanas en `running` con destinatarios aun `pending`.
 *
 * El punto 2 no es un extra: `dispatchCampaign` corta a los 500 envios por
 * invocacion y se lanza sin esperar respuesta desde el route handler. Una
 * campana de 1.200 contactos dejaba 700 personas en `pending` para siempre, y
 * un reinicio del proceso a mitad de despacho hacia lo mismo con el resto.
 * Nadie las recogia. Ahora el tick las recoge.
 */

/** Cada cuanto despierta el worker. Un minuto es la resolucion de la UI. */
const INTERVALO_MS = 60_000;

/**
 * Cuantas campanas se atienden por tick, por tipo de tarea.
 *
 * Es un freno deliberado: si veinte campanas vencen a la misma hora, se
 * lanzan cinco ahora y el resto en los siguientes minutos, en vez de abrir
 * veinte despachos en paralelo contra el mismo canal de WhatsApp.
 */
const MAX_POR_TICK = 5;

/**
 * Margen de retraso tolerable para una campana vencida.
 *
 * Si el servidor estuvo caido un fin de semana, al arrancar hay campanas que
 * vencieron hace dias. Enviarlas de golpe significa mandar la promo del
 * viernes el lunes por la noche: el mensaje ya no es cierto y el cliente lo
 * recibe como spam. Pasado este margen la campana se marca `failed` con el
 * motivo a la vista, para que una persona decida si aun tiene sentido.
 */
const VENTANA_GRACIA_MS = 24 * 60 * 60 * 1000;

/**
 * Campanas que este proceso esta despachando AHORA MISMO.
 *
 * Sin esto, el tick de las 10:01 podria empezar a despachar una campana que el
 * tick de las 10:00 todavia no ha terminado, y ambos leerian el mismo lote de
 * `pending`: la misma persona recibiria el mensaje dos veces. `takePending` no
 * bloquea filas, asi que el cerrojo tiene que estar aqui.
 */
const enVuelo = new Set<string>();

/** Evita que dos ticks se solapen si uno tarda mas que el intervalo. */
let tickEnCurso = false;

/** Handle del temporizador, para poder pararlo en el apagado ordenado. */
let temporizador: ReturnType<typeof setInterval> | null = null;

/** Lo que hizo un tick. Se devuelve para poder verlo desde el endpoint y los tests. */
export interface TickResumen {
  lanzadas: number;
  retomadas: number;
  caducadas: number;
  errores: number;
  /** true si el tick no llego a correr porque ya habia otro en curso. */
  omitido?: boolean;
}

/**
 * Despacha una campana garantizando que no haya dos despachos simultaneos
 * sobre ella dentro de este proceso.
 *
 * Todo despacho —el del worker y el del boton «Disparar»— debe pasar por
 * aqui. Es la unica puerta, y por eso es el unico sitio donde hay que mirar
 * para responder «puede esta campana estar enviandose dos veces a la vez».
 */
export async function despacharConCerrojo(
  db: PrismaClient,
  campaignId: string
): Promise<void> {
  if (enVuelo.has(campaignId)) {
    logger.info('campaign.despacho_ya_en_curso', { campaignId });
    return;
  }

  enVuelo.add(campaignId);
  try {
    await dispatchCampaign(db, campaignId);
  } finally {
    // `finally` y no al final del `try`: si el despacho revienta, la campana
    // tiene que quedar liberada. Un cerrojo que no se suelta ante un error es
    // una campana que no se vuelve a enviar nunca.
    enVuelo.delete(campaignId);
  }
}

/**
 * Lanza las campanas cuya hora ya llego.
 *
 * Una campana sin `scheduledAt` no entra aqui jamas: la columna vieja
 * `scheduledDate` es texto libre y no se interpreta.
 */
async function lanzarVencidas(db: PrismaClient, ahora: Date, resumen: TickResumen): Promise<void> {
  const vencidas = await db.campaign.findMany({
    where: {
      status: 'scheduled',
      scheduledAt: { not: null, lte: ahora },
    },
    orderBy: { scheduledAt: 'asc' },
    take: MAX_POR_TICK,
    select: { id: true, title: true, scheduledAt: true },
  });

  for (const campana of vencidas) {
    const retraso = ahora.getTime() - campana.scheduledAt.getTime();

    if (retraso > VENTANA_GRACIA_MS) {
      await db.campaign.update({
        where: { id: campana.id },
        data: {
          status: 'failed',
          failureReason:
            `No se envio a su hora (${campana.scheduledAt.toISOString()}) y ya han pasado ` +
            `mas de ${Math.round(VENTANA_GRACIA_MS / 3600000)} horas. ` +
            `Revisa el contenido y reprogramala si sigue teniendo sentido.`,
        },
      });
      resumen.caducadas += 1;
      logger.warn('campaign.vencida_fuera_de_plazo', {
        campaignId: campana.id,
        programada: campana.scheduledAt.toISOString(),
        retrasoHoras: Math.round(retraso / 3600000),
      });
      continue;
    }

    try {
      const res = await launchCampaign(db, campana.id);

      if (!res.ok) {
        // La campana no puede salir (segmento vacio, canal invalido). Se marca
        // `failed` en vez de dejarla en `scheduled`: si no, el worker la
        // reintentaria cada minuto para siempre, llenando el log y sin que el
        // usuario llegue a enterarse nunca de que algo va mal. En `failed` el
        // motivo se ve en la interfaz.
        await db.campaign.update({
          where: { id: campana.id },
          data: { status: 'failed', failureReason: res.message ?? 'No se pudo lanzar.' },
        });
        resumen.errores += 1;
        logger.warn('campaign.programada_no_lanzable', {
          campaignId: campana.id,
          code: res.code,
          motivo: res.message,
        });
        continue;
      }

      resumen.lanzadas += 1;
      logger.info('campaign.lanzada_por_worker', {
        campaignId: campana.id,
        destinatarios: res.recipientCount,
        retrasoSegundos: Math.round(retraso / 1000),
      });

      await despacharConCerrojo(db, campana.id);
    } catch (error) {
      // Un fallo en una campana no puede impedir que salgan las demas.
      resumen.errores += 1;
      captureException(error, { worker: 'campaignScheduler', fase: 'lanzar', campaignId: campana.id });
      logger.error('Fallo al lanzar campana programada', {
        campaignId: campana.id,
        motivo: motivo(error),
      });
    }
  }
}

/**
 * Retoma campanas `running` que se quedaron con destinatarios sin procesar.
 *
 * Cubre los dos agujeros del envio manual: audiencias mayores que el tope por
 * invocacion, y procesos que murieron a mitad de despacho.
 */
async function retomarAtascadas(db: PrismaClient, resumen: TickResumen): Promise<void> {
  const atascadas = await db.campaign.findMany({
    where: {
      status: 'running',
      recipients: { some: { status: 'pending' } },
      // Las que este proceso ya esta despachando no son «atascadas»: estan
      // trabajando. El cerrojo las rechazaria igualmente, pero filtrar aqui
      // ahorra la consulta y mantiene limpio el contador del resumen.
      id: { notIn: [...enVuelo] },
    },
    orderBy: { launchedAt: 'asc' },
    take: MAX_POR_TICK,
    select: { id: true },
  });

  for (const campana of atascadas) {
    try {
      await despacharConCerrojo(db, campana.id);
      resumen.retomadas += 1;
    } catch (error) {
      resumen.errores += 1;
      captureException(error, { worker: 'campaignScheduler', fase: 'retomar', campaignId: campana.id });
      logger.error('Fallo al retomar campana', { campaignId: campana.id, motivo: motivo(error) });
    }
  }
}

/**
 * Una vuelta completa del worker.
 *
 * Exportada a proposito: el endpoint `/api/campaigns/tick` y los tests la
 * llaman directamente, sin depender del temporizador.
 */
export async function ejecutarTick(db: PrismaClient): Promise<TickResumen> {
  const resumen: TickResumen = { lanzadas: 0, retomadas: 0, caducadas: 0, errores: 0 };

  if (tickEnCurso) {
    // Un despacho largo puede durar mas de un minuto. Encadenar ticks
    // solapados solo multiplicaria la carga sobre el canal.
    return { ...resumen, omitido: true };
  }

  tickEnCurso = true;
  const inicio = Date.now();

  try {
    const ahora = new Date();
    await lanzarVencidas(db, ahora, resumen);
    await retomarAtascadas(db, resumen);
  } finally {
    tickEnCurso = false;
  }

  // Solo se registra cuando hubo algo que contar: un log cada minuto diciendo
  // «no hice nada» esconde los que si importan.
  if (resumen.lanzadas || resumen.retomadas || resumen.caducadas || resumen.errores) {
    logger.info('campaign.tick', { ...resumen, msTardados: Date.now() - inicio });
  }

  return resumen;
}

/**
 * Arranca el temporizador. Idempotente: llamarla dos veces no crea dos bucles.
 *
 * Solo tiene sentido con el modelo de despliegue que describe el README: un
 * proceso Node persistente (Docker/VPS con `npm start`). En serverless el
 * proceso muere entre peticiones y este intervalo no llegaria a disparar; ahi
 * hay que usar un cron externo contra `/api/campaigns/tick`.
 */
export function iniciarScheduler(): void {
  if (temporizador) return;

  temporizador = setInterval(() => {
    void (async () => {
      try {
        const { connectToPostgres } = await import('@/lib/postgres');
        const db = await connectToPostgres();
        // Sin Postgres la app arranca igual (modo demo): el worker
        // simplemente no tiene nada que hacer.
        if (!db) return;
        await ejecutarTick(db);
      } catch (error) {
        captureException(error, { worker: 'campaignScheduler', fase: 'tick' });
        logger.error('Fallo el tick de campanas', { motivo: motivo(error) });
      }
    })();
  }, INTERVALO_MS);

  // Sin `unref`, este intervalo mantendria vivo el proceso de Node por si
  // solo, y ni los tests ni un `docker stop` terminarian nunca.
  temporizador.unref?.();

  logger.info('campaign.scheduler_iniciado', { intervaloMs: INTERVALO_MS });
}

/** Para el temporizador (apagado ordenado y tests). */
export function detenerScheduler(): void {
  if (!temporizador) return;
  clearInterval(temporizador);
  temporizador = null;
  logger.info('campaign.scheduler_detenido');
}
