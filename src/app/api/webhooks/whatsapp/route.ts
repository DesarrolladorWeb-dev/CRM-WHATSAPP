import { NextRequest, NextResponse } from 'next/server';
import { verificarFirma, resolverChallenge } from '@/lib/whatsapp';
import { logger, motivo } from '@/lib/logger';
import { connectToPostgres } from '@/lib/postgres';
import { applyDeliveryReceipt, syncCampaignCounters } from '@/lib/repositories/campaignRecipientRepo';
import type { RecipientStatus } from '@/types';

/**
 * Webhook de WhatsApp Business Cloud API.
 *
 * Meta llama aqui con su propia firma (X-Hub-Signature-256), no con nuestra
 * x-api-key, por eso la ruta esta exceptuada en el middleware. La autenticidad
 * se verifica con el HMAC contra WHATSAPP_APP_SECRET.
 *
 * GET  -> handshake de alta: Meta manda hub.challenge y hay que devolverlo.
 * POST -> eventos entrantes (mensajes, estados de entrega).
 */

export async function GET(req: NextRequest) {
  const challenge = resolverChallenge(req.nextUrl.searchParams);

  if (!challenge) {
    logger.warn('whatsapp.webhook.challenge_rechazado');
    return new NextResponse('Forbidden', { status: 403 });
  }

  logger.info('whatsapp.webhook.verificado');
  return new NextResponse(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export async function POST(req: NextRequest) {
  // El cuerpo se lee crudo: la firma se calcula sobre los bytes exactos que
  // envio Meta, asi que re-serializar el JSON invalidaria el hash.
  const crudo = await req.text();

  if (!verificarFirma(crudo, req.headers.get('x-hub-signature-256'))) {
    logger.warn('whatsapp.webhook.firma_invalida');
    return NextResponse.json({ success: false }, { status: 401 });
  }

  let evento: EventoWebhook;
  try {
    evento = JSON.parse(crudo);
  } catch {
    logger.warn('whatsapp.webhook.cuerpo_no_json');
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const entradas = Array.isArray(evento?.entry) ? evento.entry.length : 0;
  logger.info('whatsapp.webhook.recibido', { entradas });

  // Los acuses de entrega/lectura son lo que convierte las metricas de
  // campana en telemetria real: sin ellos solo se sabe que el mensaje salio,
  // no que llegara ni que lo abrieran. Nunca hace fallar el webhook: Meta
  // reintenta si no recibe un 200 rapido.
  try {
    await procesarAcuses(evento);
  } catch (error) {
    logger.error('whatsapp.webhook.acuses_fallaron', { motivo: motivo(error) });
  }

  return NextResponse.json({ success: true });
}

/** Subconjunto del payload de Meta que se lee aqui. Todo opcional: no se confia en su forma. */
interface AcuseMeta {
  id?: string;
  status?: string;
  errors?: { title?: string; message?: string }[];
}

interface EventoWebhook {
  entry?: { changes?: { value?: { statuses?: AcuseMeta[] } }[] }[];
}

/** Estados de Meta que interesan, traducidos a los nuestros. */
const MAPA_ESTADOS: Record<string, Extract<RecipientStatus, 'delivered' | 'read' | 'failed'>> = {
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
};

/**
 * Recorre `entry[].changes[].value.statuses[]` y actualiza el destinatario que
 * corresponda por el id de mensaje del proveedor.
 *
 * Meta no garantiza el orden de los acuses, pero applyDeliveryReceipt() solo
 * deja avanzar el estado, asi que un 'delivered' que llega tarde no puede
 * pisar un 'read' ya registrado.
 */
async function procesarAcuses(evento: EventoWebhook): Promise<void> {
  const estados: (AcuseMeta & { id: string; status: string })[] = [];

  for (const entry of evento?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      for (const st of change?.value?.statuses ?? []) {
        if (st?.id && st.status && MAPA_ESTADOS[st.status]) estados.push({ ...st, id: st.id, status: st.status });
      }
    }
  }

  if (estados.length === 0) return;

  const db = await connectToPostgres();
  if (!db) {
    logger.warn('whatsapp.webhook.acuses_sin_base', { pendientes: estados.length });
    return;
  }

  let aplicados = 0;
  for (const st of estados) {
    const detalle = st?.errors?.[0]?.title || st?.errors?.[0]?.message;
    const ok = await applyDeliveryReceipt(db, st.id, MAPA_ESTADOS[st.status], detalle);
    if (ok) aplicados += 1;
  }

  if (aplicados === 0) return;

  // Se recalculan los contadores de las campanas tocadas. Se hace una sola vez
  // por campana al final, no por acuse, para no escribir la misma fila N veces.
  const afectadas = await db.campaignRecipient.findMany({
    where: { providerId: { in: estados.map((s) => s.id) } },
    select: { campaignId: true },
    distinct: ['campaignId'],
  });

  for (const { campaignId } of afectadas) {
    await syncCampaignCounters(db, campaignId);
  }

  logger.info('whatsapp.webhook.acuses_aplicados', {
    aplicados,
    campanas: afectadas.length,
  });
}
