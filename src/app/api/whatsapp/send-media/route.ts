import { NextRequest, NextResponse } from 'next/server';
import { requireUserPermission } from '@/lib/auth';
import { sendMediaMessage, type SendMediaOptions, type MediaType } from '@/lib/whatsappService';
import { connectToPostgres } from '@/lib/postgres';
import { connectToDatabase, isDbConnected } from '@/lib/mongodb';
import { MessageModel } from '@/models/Message';
import { logger, motivo } from '@/lib/logger';
import { saveMedia } from '@/lib/mediaStorage';

export async function POST(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Cuerpo de solicitud inválido' },
        { status: 400 }
      );
    }

    const { phone, type, media, caption, filename, mimetype } = body;

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

    // Guardar el mensaje enviado en MongoDB
    let mongoConnected = false;
    try {
      const mongo = await connectToDatabase();
      mongoConnected = !!mongo && isDbConnected();
    } catch {
      mongoConnected = false;
    }

    if (mongoConnected && result.data) {
      const db = await connectToPostgres();
      if (db) {
        // Buscar conversación activa para este contacto
        const contact = await db.contact.findFirst({
          where: { phone: phone },
        });

        if (contact) {
          const conversation = await db.conversation.findFirst({
            where: { contactId: contact.id, channel: 'whatsapp' },
            orderBy: { updatedAt: 'desc' },
          });

        if (conversation) {
          // El binario (data URL) se escribe en disco; en Mongo solo quedan
          // la URL y los metadatos. Si el disco falla, se deja sin binario
          // como hasta ahora (el mensaje igual queda registrado).
          const msgId = result.data.messageId || `m_sent_${Date.now()}`;
          const esDataUrl = typeof media === 'string' && media.startsWith('data:');
          const saved = esDataUrl
            ? await saveMedia({
                conversationId: conversation.id,
                messageId: msgId,
                dataUrl: media,
                mimetype,
              })
            : null;

          await MessageModel.create({
            id: msgId,
            conversationId: conversation.id,
            sender: 'agent',
            senderName: 'Agente',
            text: caption || (type === 'image' ? '' : `[${type.charAt(0).toUpperCase() + type.slice(1)} enviado]`),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            channel: 'whatsapp',
            status: 'sent',
            hasMedia: true,
            mediaType: type,
            mediaUrl: saved?.url,
            media: {
              mimetype: saved?.mimetype || mimetype || 'application/octet-stream',
              data: '',
              size: saved?.size,
              filename: filename,
            },
          });
        }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    logger.error('whatsapp.send-media.exception', { motivo: motivo(error) });
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}