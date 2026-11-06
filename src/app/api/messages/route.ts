import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, isDbConnected } from "@/lib/mongodb";
import { MessageModel } from "@/models/Message";
import { connectToPostgres } from "@/lib/postgres";
import { bumpLastMessage } from "@/lib/repositories/conversationRepo";
import { INITIAL_MESSAGES } from "@/mockData";
import { DEMO_MODE, dbUnavailableResponse } from "@/lib/demo";
import { captureException } from "@/lib/logger";
import { logger, motivo } from "@/lib/logger";

import { requireUserPermission, requireWriteAccess } from "@/lib/auth";
import { primerErrorDeZod } from "@/lib/schemas";
import { saveMedia } from "@/lib/mediaStorage";
import { messageSchema } from "@/lib/validators";

// Los mensajes viven en MongoDB (alto volumen, append-only). La conversacion
// padre vive en Postgres: al insertar un mensaje se actualiza alli su resumen.

export async function GET(req: NextRequest) {
  const denied = await requireUserPermission(req, "read");
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    const db = await connectToDatabase().catch(() => null);
    if (!db || !isDbConnected()) {
      if (DEMO_MODE) {
        if (conversationId && INITIAL_MESSAGES[conversationId]) {
          return NextResponse.json({
            success: true,
            source: "demo",
            data: INITIAL_MESSAGES[conversationId],
          });
        }
        return NextResponse.json({
          success: true,
          source: "demo",
          data: INITIAL_MESSAGES,
        });
      }
      return dbUnavailableResponse();
    }

    if (conversationId) {
      const messages = await MessageModel.find({ conversationId })
        .sort({ createdAt: 1 })
        .lean();
      if ((!messages || messages.length === 0) && DEMO_MODE) {
        return NextResponse.json({
          success: true,
          source: "demo",
          data: INITIAL_MESSAGES[conversationId] || [],
        });
      }
      return NextResponse.json({
        success: true,
        source: "mongodb",
        data: messages,
      });
    }

    const allMessages = await MessageModel.find({})
      .sort({ createdAt: 1 })
      .lean();
    return NextResponse.json({
      success: true,
      source: "mongodb",
      data: allMessages,
    });
  } catch (error) {
    const errorId = captureException(error, {
      route: "/api/messages",
      method: "GET",
    });
    logger.error("Error in GET /api/messages", { motivo: motivo(error) });
    if (DEMO_MODE) {
      return NextResponse.json({
        success: true,
        source: "demo",
        data: INITIAL_MESSAGES,
      });
    }
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los mensajes", errorId },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  // Navegador (sesión JWT) o n8n (x-n8n-secret). Ver src/lib/auth.ts.
  const denied = await requireWriteAccess(req, "write");
  if (denied) return denied;

  try {
    const body = await req.json();
    const parsed = messageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: primerErrorDeZod(parsed.error),
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }
    const db = await connectToDatabase().catch(() => null);
    if (!db || !isDbConnected()) {
      if (DEMO_MODE) {
        return NextResponse.json({
          success: true,
          source: "demo",
          data: parsed.data,
        });
      }
      return dbUnavailableResponse();
    }

    const msgId = parsed.data.id || `m_${Date.now()}`;

    // La multimedia puede llegar de tres formas:
    //   - mediaUrl como data URL (lo que manda el navegador al adjuntar).
    //   - media.data como base64 crudo + media.mimetype (lo que manda n8n o
    //     cualquier integración que reutilice el modelo Message).
    //   - mediaUrl como URL http/https ya alojada (n8n, plantillas, etc.).
    //
    // Los dos primeros casos se escriben en disco y en Mongo solo queda
    // `/api/media/...`; el tercero se conserva tal cual. Antes solo se
    // procesaba el data URL de mediaUrl, así que un mensaje con `media`
    // (o con una URL remota) quedaba guardado con hasMedia pero sin nada
    // que pintar en el chat.
    let mediaUrl = parsed.data.mediaUrl;
    const mediaRecibida = parsed.data.media;

    // Compatibilidad: hay integraciones que mandan `media` como string
    // (URL o data URL) en vez del objeto { mimetype, data }. Se normaliza a
    // mediaUrl; si ya venía mediaUrl, ese tiene prioridad.
    if (typeof mediaRecibida === "string" && !mediaUrl) {
      mediaUrl = mediaRecibida;
    }
    let media =
      typeof mediaRecibida === "string" ? undefined : mediaRecibida;

    const dataUrlEnMediaUrl =
      typeof mediaUrl === "string" && mediaUrl.startsWith("data:");
    const base64EnMedia =
      !dataUrlEnMediaUrl &&
      typeof media?.data === "string" &&
      media.data.length > 0;

    if (dataUrlEnMediaUrl || base64EnMedia) {
      const saved = await saveMedia({
        conversationId: String(
          parsed.data.conversationId || "sin-conversacion",
        ),
        messageId: msgId,
        dataUrl: dataUrlEnMediaUrl ? mediaUrl || null : null,
        base64: base64EnMedia ? media!.data : null,
        mimetype: media?.mimetype,
      });
      if (saved) {
        mediaUrl = saved.url;
        media = {
          ...(media ?? { mimetype: saved.mimetype, data: "" }),
          mimetype: saved.mimetype,
          data: "",
          size: saved.size,
        };
      }
    }

    const tieneMedia = Boolean(mediaUrl || media?.data || parsed.data.hasMedia);
    const mediaType =
      parsed.data.mediaType ?? inferirMediaType(media?.mimetype || mediaUrl);

    const newMsg = await MessageModel.create({
      ...parsed.data,
      id: msgId,
      mediaUrl,
      media,
      hasMedia: tieneMedia,
      ...(mediaType ? { mediaType } : {}),
    });

    // Actualiza la conversacion padre en Postgres (referencia blanda entre motores).
    if (parsed.data.conversationId) {
      const pg = await connectToPostgres();
      if (pg) {
        await bumpLastMessage(pg, parsed.data.conversationId, {
          text: parsed.data.text || "[Imagen adjunta]",
          sender: parsed.data.sender,
        });
      }
    }

    // NOTA: el envio real al canal lo hace el navegador contra el servicio
    // local de WhatsApp (REST + Socket.IO, ver src/lib/whatsappService.ts).
    // Esta ruta solo persiste el mensaje en MongoDB; si el envio falla, la UI
    // marca el mensaje como 'failed' con el resultado que devolvio el servicio.
    return NextResponse.json({
      success: true,
      source: "mongodb",
      data: newMsg,
    });
  } catch (error) {
    const errorId = captureException(error, {
      route: "/api/messages",
      method: "POST",
    });
    logger.error("Error in POST /api/messages", { motivo: motivo(error) });
    return NextResponse.json(
      { success: false, error: "Error interno del servidor", errorId },
      { status: 500 },
    );
  }
}

/**
 * Deduce el tipo de multimedia cuando la integración no manda `mediaType`.
 * Se apoya en el mimetype (data URL o media.mimetype) y, si no hay, en la
 * extensión de la URL. Sin esto, una imagen de n8n con `media` pero sin
 * `mediaType` se guardaba con hasMedia=true y no entraba en ninguna rama de
 * render del Inbox.
 */
function inferirMediaType(
  fuente: string | null | undefined,
): "image" | "audio" | "video" | "document" | "sticker" | undefined {
  const valor = String(fuente || "").trim().toLowerCase();
  if (!valor) return undefined;

  if (valor.startsWith("data:image/") || valor.startsWith("image/")) {
    return "image";
  }
  if (valor.startsWith("data:audio/") || valor.startsWith("audio/")) {
    return "audio";
  }
  if (valor.startsWith("data:video/") || valor.startsWith("video/")) {
    return "video";
  }

  // Para URLs sin mimetype, la extensión es la única pista fiable.
  const sinQuery = valor.split("?")[0].split("#")[0];
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(sinQuery)) return "image";
  if (/\.(ogg|opus|mp3|m4a|aac|wav)$/.test(sinQuery)) return "audio";
  if (/\.(mp4|3gp|webm)$/.test(sinQuery)) return "video";
  if (/\.(pdf|zip|docx?|xlsx?|pptx?|txt|json)$/.test(sinQuery)) {
    return "document";
  }
  return undefined;
}
