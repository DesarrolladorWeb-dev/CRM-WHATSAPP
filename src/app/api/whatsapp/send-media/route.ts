import { NextRequest, NextResponse } from 'next/server';
import { requireWriteAccess } from '@/lib/auth';
import {
  normalizePhone,
  sendMediaMessage,
  type SendMediaOptions,
  type MediaType,
} from '@/lib/whatsappService';
import { connectToPostgres } from '@/lib/postgres';
import { connectToDatabase, isDbConnected } from '@/lib/mongodb';
import { MessageModel } from '@/models/Message';
import { logger, motivo } from '@/lib/logger';
import { saveMedia } from '@/lib/mediaStorage';
import { formatTime } from '@/lib/time';

export async function POST(req: NextRequest) {
  // Navegador (sesión JWT) o n8n (x-n8n-secret, ver MACHINE_PATHS en lib/auth).
  const denied = await requireWriteAccess(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Cuerpo de solicitud inválido' },
        { status: 400 }
      );
    }

    const { phone, type, media, caption, filename, mimetype, conversationId } = body;

    if (!phone || !type || !media) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos: phone, type, media' },
        { status: 400 }
      );
    }

    const validTypes: MediaType[] = ['image', 'audio', 'video', 'document', 'sticker'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: `Tipo inválido. Tipos permitidos: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const options: SendMediaOptions = {
      phone,
      type,
      media,
      caption,
      filename,
      mimetype,
    };

    const result = await sendMediaMessage(options);

    if (!result.ok) {
      const errorMsg = 'error' in result ? result.error : 'Error desconocido';
      const errorStatus = 'status' in result ? result.status : 500;
      logger.error('whatsapp.send-media.error', { error: errorMsg });
      return NextResponse.json(
        { success: false, error: errorMsg },
        { status: errorStatus || 500 }
      );
    }

    const conversationIdDelChat =
      typeof conversationId === 'string' ? conversationId.trim() : '';
    const guardarSoloMetadatos = type === 'document' && !!conversationIdDelChat;
    const guardarImagenDelChat = type === 'image' && !!conversationIdDelChat;
    const confirmaHistorial = guardarSoloMetadatos || guardarImagenDelChat;
    // null indica que WhatsApp confirmó el envío, pero falta el registro en Mongo.
    let historyMessageId: string | null = null;

    let mongoConnected = false;
    try {
      const mongo = await connectToDatabase();
      mongoConnected = !!mongo && isDbConnected();
    } catch {
      mongoConnected = false;
    }

    if (mongoConnected) {
      let targetConversationId = conversationIdDelChat || undefined;

      // Las llamadas antiguas (p. ej. n8n) pueden no traer conversationId.
      // El CRM sí lo envía, así que no dependemos de inferirlo por teléfono.
      if (!targetConversationId) {
        const db = await connectToPostgres();
        if (db) {
          // Buscar conversación activa para este contacto. El teléfono puede
          // llegar como JID, con '+' o como dígitos pelados; antes se comparaba
          // texto exacto y una imagen enviada por n8n no encontraba su contacto.
          const phoneDigits = normalizePhone(phone);
          const phoneCandidates = Array.from(new Set([
            phone,
            phoneDigits,
            phoneDigits ? `+${phoneDigits}` : '',
          ].filter(Boolean)));
          const contact = await db.contact.findFirst({
            where: {
              OR: [
                { phone: { in: phoneCandidates } },
                { handle: phone },
              ],
            },
          });

          if (contact) {
            const conversation = await db.conversation.findFirst({
              where: { contactId: contact.id, channel: 'whatsapp' },
              orderBy: { updatedAt: 'desc' },
            });
            targetConversationId = conversation?.id;
          }
        }
      }

      if (targetConversationId) {
        const msgId = result.data?.messageId || `m_sent_${Date.now()}`;
        const esDataUrl = typeof media === 'string' && media.startsWith('data:');
        const esUrlRemota = typeof media === 'string' && /^https?:\/\//i.test(media);
        const esBase64Crudo =
          typeof media === 'string' && !esDataUrl && !esUrlRemota && !!mimetype;
        // Para documentos subidos desde el CRM guardamos solo la tarjeta y sus
        // metadatos en Mongo. El archivo ya fue enviado a WhatsApp y no queda
        // guardado en el contenedor ni disponible para descargar en el CRM.
        const guardarBinario = !guardarSoloMetadatos;
        const saved = guardarBinario && (esDataUrl || esBase64Crudo)
          ? await saveMedia({
              conversationId: targetConversationId,
              messageId: msgId,
              dataUrl: esDataUrl ? media : null,
              base64: esBase64Crudo ? media : null,
              mimetype,
            })
          : null;
        const mediaUrl = saved?.url || (guardarBinario && esUrlRemota ? media : undefined);
        if (guardarImagenDelChat && !mediaUrl) {
          logger.error('whatsapp.send-media.history_error', { msgId, motivo: 'No se pudo guardar la imagen' });
          return NextResponse.json({ success: true, data: result.data, historyMessageId });
        }

        const mensajeGuardado = await MessageModel.create({
          id: msgId,
          conversationId: targetConversationId,
          sender: 'agent',
          senderName: confirmaHistorial ? 'Asistente XIO' : 'Agente',
          text: type === 'document' ? (caption || '') : (caption || (type === 'image' ? '' : `[${type.charAt(0).toUpperCase() + type.slice(1)} enviado]`)),
          timestamp: confirmaHistorial
            ? formatTime()
            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          channel: 'whatsapp',
          status: 'sent',
          hasMedia: true,
          mediaType: type,
          mediaUrl,
          media: {
            mimetype: saved?.mimetype || mimetype || 'application/octet-stream',
            data: '',
            size: saved?.size,
            filename: filename,
          },
        }).catch((error: unknown) => {
          if (!confirmaHistorial) throw error;
          logger.error('whatsapp.send-media.history_error', { msgId, motivo: motivo(error) });
          return null;
        });
        if (confirmaHistorial && mensajeGuardado) {
          historyMessageId = mensajeGuardado.id;
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      ...(confirmaHistorial ? { historyMessageId } : {}),
    });
  } catch (error) {
    logger.error('whatsapp.send-media.exception', { motivo: motivo(error) });
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
