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
import type { Contact, Conversation, SocialChannel } from '@/types';
import { requireUserPermission } from '@/lib/auth';
import { formatTimeFromIso } from '@/lib/time';
import { interactiveToText, parseInteractive } from '@/lib/whatsappInteractive';

// Logica compartida de recepcion de mensajes entrantes.
//
// La consumen dos rutas:
//   - POST /api/whatsapp/incoming  (el navegador, con x-api-key)
//   - POST /api/whatsapp/webhook   (el servicio local de WhatsApp, server-to-server)
// Ambas garantizan que cada mensaje quede guardado como contacto + conversacion
// (Postgres) y como mensaje (MongoDB), para que aparezca en los chats recientes
// aunque el CRM se recargue o el navegador estuviera cerrado.
//
// Aunque la ruta viva bajo /api/whatsapp, el payload acepta `channel` para que
// las integraciones omnicanal (Instagram, Messenger, X, email) reutilicen el
// mismo punto de entrada sin que el servidor las etiquete como WhatsApp.

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
  // Canal de origen. Si falta se asume WhatsApp, que es el comportamiento
  // historico de este endpoint.
  channel?: SocialChannel;
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
  rawMessage?: unknown;
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

/** Nombre visible de cada canal, para notas y etiquetas de respaldo. */
const CHANNEL_LABEL: Record<SocialChannel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  twitter: 'X/Twitter',
  messenger: 'Messenger',
  email: 'Email',
};

/**
 * Limpia el identificador publico de una red social.
 *
 * En WhatsApp `from` es un telefono/JID; en Instagram, Messenger y X es un
 * @usuario o un id numerico; en email, una direccion. Se conservan los
 * caracteres que forman parte de un handle valido y se descarta el resto para
 * que un valor con HTML o espacios no acabe guardado tal cual en la ficha.
 */
function sanitizeHandle(raw: string, channel: SocialChannel): string {
  const base = String(raw ?? '').trim().replace(/^@+/, '');
  if (channel === 'email') {
    return base.toLowerCase().replace(/[^a-z0-9@._+-]/gi, '').slice(0, 120);
  }
  return base.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64);
}

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
  if (limpio === 'Desconocido') return false;
  // "Contacto WhatsApp", "Contacto Instagram"... son etiquetas de respaldo,
  // no nombres: no deben generar iniciales.
  if (/^Contacto\b/.test(limpio)) return false;
  if (limpio.startsWith('+')) return false;
  if (/^Cliente \d+$/.test(limpio)) return false;
  return /^\p{L}/u.test(limpio);
}

/**
 * Como se llama un contacto que llega por un canal.
 *
 * `fromName` es el nombre que publica la persona (pushName en WhatsApp). Llega
 * vacio a menudo (cuentas sin nombre configurado, canales, mensajes
 * reenviados), y entonces hay que degradar con cabeza en vez de escribir
 * "Desconocido" en la ficha:
 *
 *   1. El nombre que publique la persona.
 *   2. Su telefono formateado (WhatsApp) o su @usuario (resto de canales).
 *   3. Una etiqueta neutra, solo cuando no hay ni nombre ni identificador.
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
  telefono: string | null,
  handle: string | null,
  fallback: string
): { nombre: string; tieneNombre: boolean } {
  const propuesto = sanitizeName(fromName, '');
  if (propuesto) return { nombre: propuesto, tieneNombre: true };

  if (telefono) return { nombre: formatPhoneDisplay(telefono), tieneNombre: false };

  const usuario = String(handle ?? '').replace(/^@+/, '').trim();
  if (usuario) {
    return { nombre: usuario.slice(0, 50), tieneNombre: /^\p{L}/u.test(usuario) };
  }

  return { nombre: fallback, tieneNombre: false };
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
  email?: string | null;
  sentiment?: string | null;
  leadScore?: number | null;
  stage?: string | null;
  dealValue?: number | null;
  notes?: string | null;
  lastActive?: string | null;
  company?: string | null;
  avatarUrl?: string | null;
  avatar?: string;
  channel?: string | null;
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
    channel: (row.channel as SocialChannel) || 'whatsapp',
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
    logger.warn('Payload entrante rechazado', {
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
    const channel = (body.channel || 'whatsapp') as SocialChannel;
    const esWhatsApp = channel === 'whatsapp';
    const fromRaw = String(body.from || body.fromName || '').trim();

    // En WhatsApp `from` es un JID o un telefono. En el resto de canales es el
    // identificador publico de la persona (un @usuario, un id de la red o un
    // correo). normalizePhone() lo reduciria a digitos y perderia el handle,
    // asi que solo se aplica a WhatsApp.
    const phone = esWhatsApp ? normalizePhone(fromRaw) : '';
    const socialHandle = esWhatsApp ? '' : sanitizeHandle(fromRaw, channel);

    if (esWhatsApp && !phone) {
      return NextResponse.json({ success: false, error: 'Falta el numero del remitente' }, { status: 400 });
    }
    if (!esWhatsApp && !socialHandle) {
      return NextResponse.json(
        { success: false, error: `Falta el identificador del remitente para ${CHANNEL_LABEL[channel]}` },
        { status: 400 }
      );
    }

    const interactive = parseInteractive(body.rawMessage)
    const text = String(body.text || '') || (interactive ? interactiveToText(interactive): '');
    const receivedAt = body.receivedAt ? new Date(body.receivedAt) : new Date();
    const timestampLbl = displayTime(body.receivedAt);

    // Determinar el identificador único del contacto
    // Si es un LID, usar el lidBase como handle único
    // Si no, usar el phone normalizado (WhatsApp) o el handle social.
    const isLid = esWhatsApp && (body.isLid || false);
    const lidBase = esWhatsApp ? body.lidBase || null : null;
    const resolvedPhone = body.resolvedPhone || null;

    // El handle único del contacto: si es LID, guardar el JID completo (ej: "273404951326886@lid")
    // para que al enviar se detecte que es un LID y se use directamente.
    const contactHandle = esWhatsApp
      ? (isLid && body.from ? body.from : phone)
      : socialHandle;

    // En email el identificador es la propia direccion, asi que se guarda
    // tambien en la columna `email` para que la ficha quede completa.
    const contactEmail = channel === 'email' ? socialHandle : undefined;

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
    const contactPhone =
      resolvedPhone || (esWhatsApp && !isLid && phone.length >= 10 ? `+${phone}` : null);

    const { nombre: name, tieneNombre } = resolverNombre(
      body.fromName,
      contactPhone,
      esWhatsApp ? null : contactHandle,
      `Contacto ${CHANNEL_LABEL[channel]}`
    );
    const avatar = avatarPara(name, tieneNombre);

    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({
          success: true,
          source: 'demo',
          data: { incomingId: messageId, channel, handle: contactHandle, phone, name, text },
        });
      }
      return dbUnavailableResponse();
    }

    // 1. Contacto: reutilizar el existente por handle/telefono/email o crear uno
    // nuevo. En redes sociales el handle puede venir con o sin '@' segun la
    // integracion, asi que se buscan las dos formas antes de crear duplicados.
    let contact: Parameters<typeof contactToApi>[0] | null = null;

    const handleVariantes = Array.from(
      new Set([contactHandle, `@${contactHandle}`, contactHandle.replace(/^@+/, '')].filter(Boolean))
    );
    contact = await db.contact.findFirst({
      where: { handle: { in: handleVariantes } },
    });

    if (!contact && contactEmail) {
      contact = await db.contact.findFirst({ where: { email: contactEmail } });
    }

    // Si no se encontró por handle y tenemos un phone válido, buscar por phone
    if (!contact && contactPhone) {
      contact = await db.contact.findFirst({
        where: { phone: contactPhone },
      });
    }

    let isNewContact = false;
    if (!contact) {
      // Crear nuevo contacto.
      // Si es LID y no tenemos número resuelto, guardar el LID como handle
      // y dejar phone vacío (se actualizará cuando se resuelva el número).
      // En el resto de canales el id se deriva del canal + handle para que dos
      // personas distintas de la misma red no compartan ficha.
      const contactId = esWhatsApp
        ? `c_wa_${phone}_${isLid ? 'lid' : 'num'}`
        : `c_${channel}_${createHash('sha1')
            .update(`${channel}:${contactHandle}`)
            .digest('hex')
            .slice(0, 12)}`;

      contact = await upsertContact(db, contactId, {
        name,
        avatar,
        handle: contactHandle,
        phone: contactPhone,
        email: contactEmail,
        channel,
        sentiment: 'neutral',
        leadScore: 50,
        stage: 'lead',
        dealValue: 0,
        notes: isLid
          ? `Contacto creado desde WhatsApp (LID: ${lidBase}). El número real aún no se ha resuelto.`
          : `Contacto creado automaticamente desde ${CHANNEL_LABEL[channel]}.`,
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
      // Lo mismo con el email cuando el mensaje entra por ese canal.
      if (!contact.email && contactEmail) {
        await db.contact.update({
          where: { id: contact.id },
          data: { email: contactEmail },
        });
        contact.email = contactEmail;
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
      // Contactos creados antes de este arreglo pudieron quedar marcados como
      // WhatsApp aunque su primer mensaje llegara por otra red. Se corrige solo
      // cuando la ficha no tiene telefono (un contacto real de WhatsApp siempre
      // lo tiene o es un LID), para no reescribir el canal de quien de verdad
      // usa WhatsApp.
      if (
        !esWhatsApp &&
        contact.channel === 'whatsapp' &&
        !contact.phone &&
        !String(contact.handle || '').endsWith('@lid')
      ) {
        await db.contact.update({ where: { id: contact.id }, data: { channel } });
        contact.channel = channel;
      }
    }

    // 2. Conversacion: una por contacto y canal.
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
      where: { contactId: contact.id, channel },
      orderBy: { updatedAt: 'desc' },
    });
    let isNewConversation = false;
    const mediaLabel = body.hasMedia ? getMediaLabel(body.mediaType) : '';
    const lastMsgText = text || mediaLabel || '[Mensaje]';
    if (!conversation) {
      // El id de WhatsApp conserva el formato historico (conv_wa_...) para no
      // duplicar conversaciones ya existentes. El resto de canales usa un id
      // estable derivado del contacto, de modo que cada red tenga su propio hilo.
      const conversationId = esWhatsApp
        ? `conv_wa_${phone}_${isLid ? 'lid' : 'num'}`
        : `conv_${channel}_${contact.id}`;

      conversation = await upsertConversation(db, conversationId, {
        contactId: contact.id,
        channel,
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
            channel,
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
      channel,
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
          channel,
          status: 'read',
          hasMedia: body.hasMedia || false,
          mediaType: body.mediaType,
          media: body.media,
          mediaUrl: savedMediaUrl,
          interactive: interactive ?? undefined
        },
        channel,
        handle: contactHandle,
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
