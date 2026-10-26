import type { PrismaClient } from '../../generated/prisma/client';
import type { CampaignPreview, CampaignStatus } from '@/types';
import { logger, motivo } from '@/lib/logger';
import {
  resolveAudience,
  renderTemplate,
  resumirExclusiones,
  type AudienceContact,
} from './audienceService';
import { puedeLanzarse, esTerminal } from './campaignStatus';
import { getChannelAdapter } from './channels';
import {
  materializeRecipients,
  takePending,
  markSent,
  markNotSent,
  syncCampaignCounters,
  hasPending,
} from '@/lib/repositories/campaignRecipientRepo';

/**
 * Orquestacion de una campana: previsualizar, lanzar y despachar.
 *
 * Aqui viven las reglas de negocio que antes no existian en ninguna parte. El
 * route handler solo traduce HTTP; el repositorio solo habla con Postgres;
 * este archivo es el que DECIDE.
 */

/** Cuantos destinatarios se procesan por vuelta del bucle de despacho. */
const TAMANO_LOTE = 50;

/** Tope de envios por invocacion, para no agotar el tiempo de la funcion. */
const MAX_POR_INVOCACION = 500;

/** Por que no se pudo lanzar una campana. */
export type LaunchErrorCode = 'NOT_FOUND' | 'INVALID_STATE' | 'EMPTY_AUDIENCE' | 'BAD_CHANNEL';

/**
 * Resultado de intentar lanzar una campana.
 *
 * Campos opcionales en un solo objeto (no una union discriminada) porque el
 * proyecto compila con `strict: false` y sin `strictNullChecks` TypeScript no
 * estrecha uniones por su discriminante.
 */
export interface LaunchResult {
  ok: boolean;
  recipientCount?: number;
  skipped?: number;
  code?: LaunchErrorCode;
  message?: string;
}

/**
 * Previsualiza el envio SIN mandar nada.
 *
 * Es el paso que faltaba entre «rellenar el formulario» y «disparar»: el
 * usuario ve a cuantas personas reales va a escribir, por que se excluye al
 * resto y como queda el mensaje ya personalizado.
 */
export async function previewCampaign(
  db: PrismaClient,
  campaignId: string
): Promise<CampaignPreview | null> {
  const campana = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campana) return null;

  const audiencia = await resolveAudience(db, campana.segmentId, campana.channel);
  if (!audiencia) return null;

  const excluded = resumirExclusiones(audiencia.excluded);
  const warnings: string[] = [];

  if (!audiencia.adapter.isConnected()) {
    warnings.push(
      `El canal ${audiencia.adapter.label} no esta conectado: los mensajes se registraran como omitidos, no se enviaran.`
    );
  }
  if (audiencia.recipients.length === 0) {
    warnings.push('Ningun contacto de este segmento es alcanzable por este canal.');
  }
  if (excluded.otroCanal > 0) {
    warnings.push(
      `${excluded.otroCanal} contacto(s) del segmento usan otro canal y no recibiran esta campana.`
    );
  }
  if (excluded.bajaDifusion > 0) {
    warnings.push(`${excluded.bajaDifusion} contacto(s) se dieron de baja de las campanas.`);
  }
  if (!campana.content.trim()) {
    warnings.push('La campana no tiene contenido.');
  }
  if (esTerminal(campana.status as CampaignStatus)) {
    warnings.push(`Esta campana ya esta en estado «${campana.status}» y no se puede relanzar.`);
  }

  const muestra = audiencia.recipients[0];

  return {
    campaignId: campana.id,
    channel: audiencia.channel,
    channelLabel: audiencia.adapter.label,
    channelConnected: audiencia.adapter.isConnected(),
    segmentId: audiencia.segmentId,
    segmentName: audiencia.segmentName,
    recipientCount: audiencia.recipients.length,
    excluded,
    sampleName: muestra?.name,
    sampleMessage: muestra ? renderTemplate(campana.content, muestra) : undefined,
    warnings,
  };
}

/**
 * Lanza una campana.
 *
 * Solo materializa la audiencia y deja la campana en `running`; el envio real
 * lo hace `dispatchCampaign`. Separarlos es lo que permite responder al
 * navegador en milisegundos aunque el envio dure minutos.
 */
export async function launchCampaign(
  db: PrismaClient,
  campaignId: string
): Promise<LaunchResult> {
  const campana = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campana) {
    return { ok: false, code: 'NOT_FOUND', message: 'Campana no encontrada' };
  }

  // LA regla que impide el doble envio. Todo lo demas de este archivo es
  // logistica; esto es lo que protege al cliente de recibir la misma promo
  // dos veces.
  const estado = campana.status as CampaignStatus;
  if (!puedeLanzarse(estado)) {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: esTerminal(estado)
        ? `La campana ya esta en estado «${estado}»: no se puede relanzar.`
        : `Una campana en estado «${estado}» no se puede lanzar.`,
    };
  }

  const audiencia = await resolveAudience(db, campana.segmentId, campana.channel);
  if (!audiencia) {
    return {
      ok: false,
      code: 'BAD_CHANNEL',
      message: 'El segmento o el canal de la campana no son validos.',
    };
  }

  if (audiencia.recipients.length === 0) {
    // No se marca como 'failed': el usuario puede corregir el segmento y
    // volver a intentarlo, asi que la campana sigue siendo un borrador.
    return {
      ok: false,
      code: 'EMPTY_AUDIENCE',
      message: `Ningun contacto del segmento «${audiencia.segmentName}» es alcanzable por ${audiencia.adapter.label}.`,
    };
  }

  const creados = await materializeRecipients(
    db,
    campana.id,
    audiencia.channel,
    audiencia.recipients
  );

  await db.campaign.update({
    where: { id: campana.id },
    data: {
      status: 'running',
      launchedAt: new Date(),
      failureReason: null,
      segmentName: audiencia.segmentName,
    },
  });

  logger.info('campaign.lanzada', {
    campaignId: campana.id,
    canal: audiencia.channel,
    destinatarios: creados,
  });

  return {
    ok: true,
    recipientCount: creados,
    skipped: audiencia.excluded.length,
  };
}

/** Pausa entre envios, respetando el limite del canal. */
function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Explica, en una frase, por que no salio ni un mensaje.
 *
 * El motivo real ya esta guardado: cada destinatario fallido lleva su propio
 * `error` («fetch failed», «numero no registrado en WhatsApp»...). El problema
 * era que nadie lo leia: la campana decia «Completada» y para saber que habia
 * pasado habia que entrar a la base de datos o a los logs del servidor.
 *
 * Se toma el error MAS REPETIDO porque cuando falla todo suele ser una unica
 * causa (el servicio caido, el token caducado), y esa es la que hay que
 * arreglar. Listar cien errores identicos no ayuda a nadie.
 */
async function motivoDelFracaso(
  db: PrismaClient,
  campaignId: string,
  canal: string,
  metricas: { total: number; failed: number; skipped: number }
): Promise<string> {
  const porError = await db.campaignRecipient.groupBy({
    by: ['error'],
    where: { campaignId, error: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { error: 'desc' } },
    take: 1,
  });

  const frecuente = porError[0];
  const cabecera = `No se envió ningún mensaje de ${metricas.total} destinatario(s) por ${canal}.`;

  if (!frecuente?.error) return cabecera;

  return `${cabecera} Motivo más frecuente (${frecuente._count._all} de ${metricas.failed + metricas.skipped}): ${frecuente.error}`;
}

/**
 * Despacha los destinatarios pendientes de una campana.
 *
 * Recorre en lotes, personaliza el mensaje por contacto y registra el
 * resultado de CADA envio. Nunca lanza: un fallo de un destinatario no puede
 * tumbar la campana entera.
 */
export async function dispatchCampaign(
  db: PrismaClient,
  campaignId: string
): Promise<{ enviados: number; fallidos: number; omitidos: number }> {
  const campana = await db.campaign.findUnique({ where: { id: campaignId } });
  const resumen = { enviados: 0, fallidos: 0, omitidos: 0 };
  if (!campana || campana.status !== 'running') return resumen;

  const adapter = getChannelAdapter(campana.channel);
  if (!adapter) return resumen;

  const conectado = adapter.isConnected();
  let procesados = 0;

  while (procesados < MAX_POR_INVOCACION) {
    const lote = await takePending(db, campaignId, TAMANO_LOTE);
    if (lote.length === 0) break;

    for (const destinatario of lote) {
      procesados += 1;

      // Canal sin transporte: se marca 'skipped', nunca 'sent'. Dar por
      // enviado algo que no salio es la peor mentira posible en un CRM.
      if (!conectado) {
        await markNotSent(db, destinatario.id, 'skipped', `${adapter.label} no esta conectado`);
        resumen.omitidos += 1;
        continue;
      }

      const contacto: AudienceContact = {
        id: destinatario.contactId,
        name: destinatario.contactName,
        company: destinatario.company,
        channel: adapter.id,
        address: destinatario.address,
      };
      const texto = renderTemplate(campana.content, contacto);

      try {
        const res = await adapter.send(
          destinatario.address,
          texto,
          adapter.supportsMedia ? campana.imageUrl ?? undefined : undefined
        );

        if (res.ok) {
          await markSent(db, destinatario.id, res.providerId);
          resumen.enviados += 1;
        } else {
          await markNotSent(db, destinatario.id, 'failed', res.error);
          resumen.fallidos += 1;
        }
      } catch (error) {
        // El adaptador no deberia lanzar, pero si lo hace el destinatario
        // queda marcado y el bucle continua con el siguiente.
        await markNotSent(db, destinatario.id, 'failed', motivo(error));
        resumen.fallidos += 1;
      }

      if (adapter.throttleMs > 0) await esperar(adapter.throttleMs);
    }
  }

  const quedanPendientes = await hasPending(db, campaignId);
  if (!quedanPendientes) {
    // Los contadores se recalculan ANTES de decidir el estado final: para
    // saber si la campana fue un exito hay que contar lo que realmente paso,
    // no lo que hizo esta invocacion. Una campana grande se despacha en varias
    // vueltas, y `resumen` solo conoce la ultima.
    const metricas = await syncCampaignCounters(db, campaignId);

    // Una campana en la que no salio NI UN mensaje no esta «completada»:
    // fracaso. Marcarla como completada es la peor mentira posible en un CRM
    // — la campana aparece en verde, con «Enviados: 0» en letra pequena, y
    // nadie se entera de que no llego a nadie hasta que el cliente pregunta
    // por que no recibio la promo.
    const fracasoTotal = metricas.sent === 0 && metricas.total > 0;

    await db.campaign.update({
      where: { id: campaignId },
      data: {
        status: fracasoTotal ? 'failed' : 'completed',
        completedAt: new Date(),
        failureReason: fracasoTotal
          ? await motivoDelFracaso(db, campaignId, adapter.label, metricas)
          : conectado
            ? null
            : `${adapter.label} no esta conectado`,
      },
    });
  } else {
    await syncCampaignCounters(db, campaignId);
  }

  logger.info('campaign.despachada', { campaignId, ...resumen, completada: !quedanPendientes });

  return resumen;
}
