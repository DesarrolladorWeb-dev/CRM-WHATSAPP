import type { PrismaClient, Prisma } from '../../generated/prisma/client';
import type { AudienceExclusion, SocialChannel } from '@/types';
import { getChannelAdapter, type ChannelAdapter } from './channels';

/**
 * Resolucion de audiencia: traduce un SEGMENTO (una receta: «score >= 70, en
 * negociacion, etiqueta VIP») en la LISTA REAL de contactos a los que se va a
 * escribir por un canal concreto.
 *
 * Es la pieza que conectaba dos modulos que hasta ahora vivian separados:
 * Segmentos guardaba los criterios y Campanas guardaba el `segmentId`, pero
 * nadie ejecutaba los criterios.
 *
 * En un CRM omnicanal la audiencia NO es solo «quien cumple los criterios»,
 * sino «quien cumple los criterios Y es alcanzable por este canal». Un
 * contacto que llego por Instagram no entra en una campana de WhatsApp aunque
 * tenga telefono: escribir a alguien por un canal en el que nunca te dio
 * conversacion es spam, y en WhatsApp concreto es motivo de bloqueo del numero.
 */

/** Contacto ya resuelto y listo para recibir el mensaje. */
export interface AudienceContact {
  id: string;
  name: string;
  company: string | null;
  channel: string;
  /** Direccion del contacto en el canal de la campana (telefono/@handle/email). */
  address: string;
}

export interface AudienceResult {
  segmentId: string;
  segmentName: string;
  channel: SocialChannel;
  adapter: ChannelAdapter;
  /** Contactos que SI van a recibir el mensaje. */
  recipients: AudienceContact[];
  /** Excluidos con el motivo exacto, para poder explicarlo en la interfaz. */
  excluded: AudienceExclusion[];
}

/** Campos del contacto que necesita la resolucion (evita traer la fila entera). */
const CAMPOS = {
  id: true,
  name: true,
  company: true,
  channel: true,
  phone: true,
  handle: true,
  email: true,
  optedOut: true,
} as const;

/**
 * Construye el filtro SQL a partir de los criterios del segmento.
 *
 * Los criterios son ACUMULATIVOS (AND): el contacto debe cumplirlos todos. Un
 * criterio vacio no filtra nada, es decir, un segmento sin criterios devuelve
 * toda la base — que es el comportamiento que espera el usuario cuando crea un
 * segmento «Todos».
 */
export function construirFiltro(segmento: {
  minScore: number | null;
  channels: { channel: string }[];
  stages: { stage: string }[];
  segmentTags: { tagId: string }[];
}): Prisma.ContactWhereInput {
  const where: Prisma.ContactWhereInput = {};

  if (segmento.minScore != null) {
    where.leadScore = { gte: segmento.minScore };
  }
  if (segmento.channels.length > 0) {
    where.channel = { in: segmento.channels.map((c) => c.channel) };
  }
  if (segmento.stages.length > 0) {
    where.stage = { in: segmento.stages.map((s) => s.stage) };
  }
  if (segmento.segmentTags.length > 0) {
    // `some` = basta con UNA de las etiquetas del segmento, no todas.
    where.contactTags = { some: { tagId: { in: segmento.segmentTags.map((t) => t.tagId) } } };
  }

  return where;
}

/**
 * Resuelve la audiencia de un segmento para un canal dado.
 *
 * Devuelve tanto los alcanzables como los excluidos: el usuario tiene derecho
 * a saber por que su segmento de 350 personas se queda en 312 antes de pulsar
 * «enviar».
 */
export async function resolveAudience(
  db: PrismaClient,
  segmentId: string,
  channel: string
): Promise<AudienceResult | null> {
  const adapter = getChannelAdapter(channel);
  if (!adapter) return null;

  const segmento = await db.segment.findUnique({
    where: { id: segmentId },
    include: { channels: true, stages: true, segmentTags: true },
  });
  if (!segmento) return null;

  const contactos = await db.contact.findMany({
    where: construirFiltro(segmento),
    select: CAMPOS,
    orderBy: { leadScore: 'desc' },
  });

  const recipients: AudienceContact[] = [];
  const excluded: AudienceExclusion[] = [];

  for (const c of contactos) {
    // 1. Baja de difusion: manda por encima de todo lo demas.
    if (c.optedOut) {
      excluded.push({ contactId: c.id, name: c.name, reason: 'baja_difusion' });
      continue;
    }

    // 2. El contacto debe pertenecer al canal por el que sale la campana.
    if (c.channel !== adapter.id) {
      excluded.push({ contactId: c.id, name: c.name, reason: 'otro_canal' });
      continue;
    }

    // 3. Debe tener una direccion utilizable en ese canal.
    const address = adapter.resolveAddress(c);
    if (!address) {
      excluded.push({ contactId: c.id, name: c.name, reason: 'sin_direccion' });
      continue;
    }

    recipients.push({
      id: c.id,
      name: c.name,
      company: c.company,
      channel: c.channel,
      address,
    });
  }

  return {
    segmentId: segmento.id,
    segmentName: segmento.name,
    channel: adapter.id,
    adapter,
    recipients,
    excluded,
  };
}

/**
 * Cuenta cuantos contactos cumple un segmento, sin resolver direcciones.
 *
 * Sirve para el `contactCount` del segmento, que hasta ahora era un numero
 * guardado a mano que nadie recalculaba.
 */
export async function countSegmentContacts(db: PrismaClient, segmentId: string): Promise<number> {
  const segmento = await db.segment.findUnique({
    where: { id: segmentId },
    include: { channels: true, stages: true, segmentTags: true },
  });
  if (!segmento) return 0;

  return db.contact.count({ where: construirFiltro(segmento) });
}

/**
 * Sustituye las variables de plantilla por los datos del contacto.
 *
 * Misma convencion que el Inbox y las respuestas rapidas — llave simple:
 * {nombre}, {empresa}, {canal}. Se mantiene igual a proposito: el usuario
 * escribe la misma sintaxis en los tres sitios.
 */
export function renderTemplate(plantilla: string, contacto: AudienceContact): string {
  return plantilla
    .replace(/{nombre}/g, contacto.name)
    .replace(/{empresa}/g, contacto.company || '')
    .replace(/{canal}/g, contacto.channel);
}

/** Agrupa los excluidos por motivo para mostrarlos resumidos. */
export function resumirExclusiones(excluded: AudienceExclusion[]): {
  sinDireccion: number;
  bajaDifusion: number;
  otroCanal: number;
} {
  return {
    sinDireccion: excluded.filter((e) => e.reason === 'sin_direccion').length,
    bajaDifusion: excluded.filter((e) => e.reason === 'baja_difusion').length,
    otroCanal: excluded.filter((e) => e.reason === 'otro_canal').length,
  };
}
