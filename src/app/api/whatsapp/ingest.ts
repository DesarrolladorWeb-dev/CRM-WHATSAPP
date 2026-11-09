import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { connectToPostgres } from '@/lib/postgres';
import { connectToDatabase, isDbConnected } from '@/lib/mongodb';
import { MessageModel } from '@/models/Message';
import { upsertContact } from '@/lib/repositories/contactRepo';
import { upsertConversation, bumpLastMessage } from '@/lib/repositories/conversationRepo';
import { normalizePhone, formatPhoneDisplay } from '@/lib/whatsappService';
import { incomingPayloadSchema, primerErrorDeZod } from '@/lib/schemas';
import { avatarPara } from '@/lib/avatar';
import { DEMO_MODE, dbUnavailableResponse } from '@/lib/demo';
import { captureException, logger, motivo } from '@/lib/logger';
import { saveMedia, type SavedMedia } from '@/lib/mediaStorage';
import type { Contact, Conversation } from '@/types';
import { requireUserPermission } from '@/lib/auth';
import { formatTimeFromIso } from '@/lib/time';
import { interactiveToText, parseInteractive } from '@/lib/whatsappInteractive';

// Logica compartida de recepcion de mensajes entrantes de WhatsApp.
//
// La consumen dos rutas:
//   - POST /api/whatsapp/incoming  (el navegador, con x-api-key)
//   - POST /api/whatsapp/webhook   (el servicio local de WhatsApp, server-to-server)
// Ambas garantizan que cada mensaje quede guardado como contacto + conversacion
// (Postgres) y como mensaje (MongoDB), para que aparezca en los chats recientes
// aunque el CRM se recargue o el navegador estuviera cerrado.

export type MediaType = 'image' | 'audio' | 'video' | 'document' | 'sticker';

export interface MediaData {
  mimetype: string;
  data: string;
  size?: number;
  filename?: string | null;
  width?: number;
  height?: number;
}

export interface IncomingPayload {
  messageId?: string;
  from?: string;
  fromName?: string;
  timestamp?: number;
  text?: string;
  hasMedia?: boolean;
  mediaType?: MediaType;
  media?: MediaData;
  receivedAt?: string;
  // Campos adicionales para LIDs (Linked Identity de WhatsApp)
  isLid?: boolean;
  lidBase?: string;
  resolvedPhone?: string;
  rawMessage?: any
}

function sanitizeName(raw: string | undefined, fallback: string): string {
  const cleaned = String(raw ?? '')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[^a-zA-ZÀ-ÿ0-9\s'’-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
  return cleaned || fallback;
}

/** Etiqueta para un contacto del que WhatsApp no publica ningun nombre. */
const SIN_NOMBRE = 'Contacto WhatsApp';

/**
 * Si el nombre identifica a una persona o es solo un marcador de posicion.
 *
 * Lo necesitan los avatares: de "Davy" salen unas iniciales con sentido, pero
 * de "+51 953 740 108" o "Contacto WhatsApp" saldrian "5" y "CW", que no
 * significan nada y encima harian que dos desconocidos distintos parezcan el
 * mismo contacto. Esos llevan silueta generica.
 *
 * Tambien cubre a los contactos creados antes de este cambio, que se llaman
 * "Desconocido" o "Cliente 51953740108" y siguen en la base.
 */
function esNombreReal(nombre: string | null | undefined): boolean {
  const limpio = String(nombre ?? '').trim();
  if (!limpio) return false;
  if (limpio === SIN_NOMBRE || limpio === 'Desconocido') return false;
  if (limpio.startsWith('+')) return false;
  if (/^Cliente \d+$/.test(limpio)) return false;
  return /^\p{L}/u.test(limpio);
}

/**
 * Como se llama un contacto que llega por WhatsApp.
 *
 * `fromName` es el pushName: el nombre que cada persona pone en SU propio
 * WhatsApp, no la agenda de nadie. Llega vacio a menudo (cuentas sin nombre
 * configurado, canales, mensajes reenviados), y entonces hay que degradar con
 * cabeza en vez de escribir "Desconocido" en la ficha:
 *
 *   1. El nombre que publique la persona.
 *   2. Su telefono formateado, "+51 953 740 108", que identifica igual de bien.
 *   3. Una etiqueta neutra, solo cuando no hay ni nombre ni telefono.
 *
 * El caso 3 son los LID sin resolver: WhatsApp identifica a esa cuenta con un
 * id opaco ("105450053869643@lid") y no entrega el telefono. Ese id NO se
 * muestra ni se formatea como numero: parece un telefono, no lo es, y alguien
 * acabaria intentando llamar ahi.
 *
 * Devuelve tambien si el nombre identifica de verdad a alguien, porque de eso
 * depende que el avatar lleve iniciales o la silueta generica.
 */
function resolverNombre(
  fromName: string | undefined,
  telefono: string | null
): { nombre: string; tieneNombre: boolean } {
  const propuesto = sanitizeName(fromName, '');
  if (propuesto) return { nombre: propuesto, tieneNombre: true };

  if (telefono) return { nombre: formatPhoneDisplay(telefono), tieneNombre: false };

  return { nombre: SIN_NOMBRE, tieneNombre: false };
}

function displayTime(iso: string | undefined): string {
  return formatTimeFromIso(iso);
}

/** Contorno API completo de un contacto (con defaults) para la UI. */
function contactToApi(row: {
  id: string;
  name: string;
  handle: string;
  phone?: string | null;
  sentiment?: string | null;
  leadScore?: number | null;
  stage?: string | null;
  dealValue?: number | null;
  notes?: string | null;
  lastActive?: string | null;
  company?: string | null;
  avatarUrl?: string | null;
  avatar?: string;
}): Contact {
  return {
    id: row.id,
    name: row.name,
    // Sin avatar guardado se genera uno local a partir del nombre. Hace falta
    // la comprobacion porque por aqui pasan tambien los contactos creados antes
    // de este cambio, que no tienen `avatarUrl` en la base.
    avatar: row.avatarUrl || row.avatar || avatarPara(row.name || row.id, esNombreReal(row.name)),
    handle: row.handle,
    phone: row.phone ?? undefined,
    channel: 'whatsapp',
    tags: [],
    sentiment: 'neutral',
    leadScore: row.leadScore ?? 50,
    stage: (row.stage as Contact['stage']) ?? 'lead',
    dealValue: row.dealValue ?? 0,
    notes: row.notes ?? '',
    lastActive: row.lastActive ?? 'Ahora',
    company: row.company ?? undefined,
  };
}

/** Valida la credencial del navegador (x-api-key con write) o del webhook (?secret=). */
export async function authorizeIncoming(req: NextRequest): Promise<NextResponse | null> {
  const denied = await requireUserPermission(req, 'write');
  if (!denied) return null;

  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (secret) {
    const provided = new URL(req.url).searchParams.get('secret') || '';
    
    // Comparar usando hashes para evitar timing attacks y problemas de longitud
    const providedHash = createHash('sha256').update(provided).digest();
    const secretHash = createHash('sha256').update(secret).digest();
    
    if (timingSafeEqual(providedHash, secretHash)) return null;
  }
  return denied;
}

/** Procesa un mensaje entrante y lo persiste (Postgres + MongoDB). */
export async function handleIncomingPayload(body: IncomingPayload): Promise<NextResponse> {
  // El unico chequeo que hacia esta funcion hasta ahora era `typeof body ===
  // 'object'` en el route handler. Por aqui entraban mensajes de 100 MB (que
  // esquivaban el max(5000) de messageSchema, porque ese schema solo corre en
  // POST /api/messages), telefonos con HTML dentro que acaban en
  // campaign_recipients.address, y nombres de 50.000 caracteres truncados en
  // silencio a 50.
  //
  // Se valida aqui y no en los routes para que las dos entradas (navegador y
  // webhook) compartan exactamente la misma regla.
  const parseo = incomingPayloadSchema.safeParse(body);
  if (!parseo.success) {
    logger.warn('Payload entrante de WhatsApp rechazado', {
      motivo: parseo.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' | '),
    });
    return NextResponse.json(
      { success: false, error: primerErrorDeZod(parseo.error), details: parseo.error.flatten() },
      { status: 400 }
    );
  }
  body = parseo.data;

  try {
    const messageId = String(body.messageId || `m_inc_${Date.now()}`);
    const phone = normalizePhone(body.from || body.fromName || '');
    if (!phone) {
      return NextResponse.json({ success: false, error: 'Falta el numero del remitente' }, { status: 400 });
    }

    const interactive = parseInteractive(body.rawMessage)
    const text = String(body.text || '') || (interactive ? interactiveToText(interactive): '');
    const receivedAt = body.receivedAt ? new Date(body.receivedAt) : new Date();
    const timestampLbl = displayTime(body.receivedAt);

    // Determinar el identificador único del contacto
    // Si es un LID, usar el lidBase como handle único
    // Si no, usar el phone normalizado
    const isLid = body.isLid || false;
    const lidBase = body.lidBase || null;
    const resolvedPhone = body.resolvedPhone || null;

    // El handle único del contacto: si es LID, guardar el JID completo (ej: "273404951326886@lid")
    // para que al enviar se detecte que es un LID y se use directamente
    const contactHandle = isLid && body.from ? body.from : phone;

    // El telefono del contacto. Para un LID solo vale el numero que haya
    // resuelto el servicio: `phone` seria entonces el id opaco del LID, que
    // tiene pinta de telefono (15 digitos) pero no lo es. Guardarlo en la
    // columna `phone` llenaba la ficha de numeros inexistentes y rompia la
    // busqueda por telefono, que es como se deduplican los contactos.
    //
    // Sin `resolvedPhone`, `phone` viene de normalizePhone(), que solo le
    // quita el sufijo @s.whatsapp.net y deja los digitos pelados CON codigo
    // de pais: `51987654321`. Con `resolvedPhone`, en cambio, llega ya
    // normalizado: `+51987654321`. Los dos caminos guardaban formatos
    // distintos en la MISMA columna, y como upsertContact() deduplica con
    // `findFirst({ where: { phone } })` (comparacion exacta de texto), el
    // mismo cliente se guardaba dos veces: una con '+' y otra sin el, segun
    // por que entrada llegara el mensaje.
    //
    // Se le antepone el '+' y ya. NO se pasa por normalizarTelefonoPeru(): esa
    // funcion espera los 9 digitos locales y antepone el +51, asi que con los
    // 11 digitos que ya traen codigo de pais devolveria cadena vacia y el
    // contacto se guardaria SIN telefono. Ademas, anteponerlo a mano respeta
    // el codigo de pais que venga, que es lo que necesita un numero de otro
    // pais.
    const contactPhone = resolvedPhone || (!isLid && phone.length >= 10 ? `+${phone}` : null);

    const { nombre: name, tieneNombre } = resolverNombre(body.fromName, contactPhone);
    const avatar = avatarPara(name, tieneNombre);

    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, source: 'demo', data: { incomingId: messageId, phone, name, text } });
      }
      return dbUnavailableResponse();
    }

    // 1. Contacto: reutilizar el existente por handle/telefono o crear nuevo.
    // Buscar por handle O por phone (si el phone parece un número válido)
    let contact: Parameters<typeof contactToApi>[0] | null = null;
    
    // Primero intentar buscar por handle exacto
    contact = await db.contact.findFirst({
      where: { handle: contactHandle },
    });
    
    // Si no se encontró por handle y tenemos un phone válido, buscar por phone
    if (!contact && contactPhone) {
      contact = await db.contact.findFirst({
        where: { phone: contactPhone },
      });
    }
    
    let isNewContact = false;
    if (!contact) {
      // Crear nuevo contacto
      // Si es LID y no tenemos número resuelto, guardar el LID como handle
      // y dejar phone vacío (se actualizará cuando se resuelva el número)
      contact = await upsertContact(db, `c_wa_${phone}_${isLid ? 'lid' : 'num'}`, {
        name,
        avatar,
        handle: contactHandle,
        phone: contactPhone,
        channel: 'whatsapp',
        sentiment: 'neutral',
        leadScore: 50,
        stage: 'lead',
        dealValue: 0,
        notes: isLid 
          ? `Contacto creado desde WhatsApp (LID: ${lidBase}). El número real aún no se ha resuelto.`
          : 'Contacto creado automaticamente desde WhatsApp.',
        lastActive: 'Ahora',
        company: '',
      });
      isNewContact = true;
    } else {
      // Si el contacto ya existe pero no tiene phone y tenemos uno resuelto, actualizarlo
      if (!contact.phone && contactPhone) {
        await db.contact.update({
          where: { id: contact.id },
          data: { phone: contactPhone },
        });
        contact.phone = contactPhone;
      }
      // Si el contacto ya existe pero su handle es solo dígitos (sin @lid) y el incoming es LID,
      // actualizar el handle para incluir @lid (necesario para enviar mensajes)
      if (isLid && contact.handle && !contact.handle.includes('@lid')) {
        await db.contact.update({
          where: { id: contact.id },
          data: { handle: contactHandle },
        });
        contact.handle = contactHandle;
      }
      // Si el contacto ya existe pero no tiene handle y tenemos el LID, actualizarlo
      if (!contact.handle && isLid && body.from) {
        await db.contact.update({
          where: { id: contact.id },
          data: { handle: contactHandle },
        });
        contact.handle = contactHandle;
      }
    }

    // 2. Conversacion: una por contacto en el canal whatsapp.
    let conversation: {
      id: string;
      contactId: string;
      channel: string;
      unreadCount: number;
      lastMessage: string;
      lastMessageTime: string;
      status: string;
      assignedAgent: string;
    } | null = await db.conversation.findFirst({
      where: { contactId: contact.id, channel: 'whatsapp' },
      orderBy: { updatedAt: 'desc' },
    });
    let isNewConversation = false;
    const mediaLabel = body.hasMedia ? getMediaLabel(body.mediaType) : '';
    const lastMsgText = text || mediaLabel || '[Mensaje]';
    if (!conversation) {
      conversation = await upsertConversation(db, `conv_wa_${phone}_${isLid ? 'lid' : 'num'}`, {
        contactId: contact.id,
        channel: 'whatsapp',
        unreadCount: 0,
        lastMessage: lastMsgText,
        lastMessageTime: timestampLbl,
        status: 'open',
        assignedAgent: 'Asesor Whato',
      });
      isNewConversation = true;
    }

    // 3. Actualizar el resumen de la conversacion (lastMessage + no leidos).
    await bumpLastMessage(db, conversation.id, {
      text: lastMsgText,
      sender: 'contact',
    });

    // 4. Mensaje en MongoDB (upsert por id: el polling inicial y el socket
    // pueden entregar el mismo messageId dos veces).
    let mongoConnected = false;
    try {
      const mongo = await connectToDatabase();
      mongoConnected = !!mongo && isDbConnected();
    } catch {
      mongoConnected = false;
    }
    let savedMediaUrl: string | undefined;
    if (mongoConnected) {
      const updateFields: Record<string, unknown> = {
        hasMedia: body.hasMedia || false,
      };
      
      if (body.hasMedia && body.mediaType) {
        updateFields.mediaType = body.mediaType;
      }
      
      if (body.hasMedia && body.media) {
        const esDataUrl = body.media.data.startsWith('data:');
        const saved: SavedMedia | null = await saveMedia({
          conversationId: conversation.id,
          messageId,
          dataUrl: esDataUrl ? body.media.data : null,
          base64: esDataUrl ? null : body.media.data,
          mimetype: body.media.mimetype,
        });

        if (saved) {
          // El binario vive en disco; en Mongo solo queda la URL y los metadatos.
          updateFields.mediaUrl = saved.url;
          savedMediaUrl = saved.url;
          updateFields.media = {
            mimetype: saved.mimetype,
            data: '',
            size: saved.size,
            filename: body.media.filename,
            width: body.media.width,
            height: body.media.height,
          };
        } else {
          // Sin disco disponible: se conserva el base64 inline (legacy).
          updateFields.media = {
            mimetype: body.media.mimetype,
            data: body.media.data,
            size: body.media.size,
            filename: body.media.filename,
            width: body.media.width,
            height: body.media.height,
          };
        }
      }

      await MessageModel.updateOne(
        { id: messageId },
        {
          $setOnInsert: {
            id: messageId,
            conversationId: conversation.id,
            sender: 'contact',
            senderName: name,
            // text,
            timestamp: timestampLbl,
            channel: 'whatsapp',
            status: 'read',
            createdAt: receivedAt,
          },
          $set: {...updateFields, ...(text ? {text}: {}), ...(interactive ? { interactive }: {})},
        },
        { upsert: true }
      );
    }

    const contactApi = contactToApi(contact);
    const conversationApi: Conversation = {
      id: conversation.id,
      contactId: conversation.contactId,
      contact: contactApi,
      channel: 'whatsapp',
      unreadCount: (conversation.unreadCount || 0) + 1,
      lastMessage: lastMsgText,
      lastMessageTime: 'Ahora',
      status: conversation.status as Conversation['status'],
      assignedAgent: conversation.assignedAgent,
    };

    return NextResponse.json({
      success: true,
      source: 'postgres',
      data: {
        incomingId: messageId,
        contact: contactApi,
        conversation: conversationApi,
        message: {
          id: messageId,
          conversationId: conversation.id,
          sender: 'contact',
          senderName: name,
          text,
          timestamp: timestampLbl,
          channel: 'whatsapp',
          status: 'read',
          hasMedia: body.hasMedia || false,
          mediaType: body.mediaType,
          media: body.media,
          mediaUrl: savedMediaUrl,
          interactive: interactive ?? undefined
        },
        phone: isLid ? lidBase : phone,
        contactPhone,
        isLid,
        isNewContact,
        isNewConversation,
        messageSavedInMongo: mongoConnected,
      },
    });
  } catch (error) {
    const errorId = captureException(error, { route: 'whatsapp/incoming', method: 'POST' });
    logger.error('Error in whatsapp incoming', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}

function getMediaLabel(mediaType?: string): string {
  switch (mediaType) {
    case 'image': return '📷 Imagen';
    case 'audio': return '🎵 Audio';
    case 'video': return '🎬 Video';
    case 'document': return '📄 Documento';
    case 'sticker': return '🏷️ Sticker';
    default: return '📎 Archivo';
  }
}

export { sanitizeName, displayTime };
