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

    // La multimedia viaja como data URL (data:...;base64,...): se escribe en
    // disco y en Mongo solo se guarda la URL /api/media/... El binario no
    // viaja en el JSON de lectura, que es lo que hace lento abrir un chat.
    if (
      typeof parsed.data.mediaUrl === "string" &&
      parsed.data.mediaUrl.startsWith("data:")
    ) {
      const saved = await saveMedia({
        conversationId: String(
          parsed.data.conversationId || "sin-conversacion",
        ),
        messageId: msgId,
        dataUrl: parsed.data.mediaUrl,
      });
      if (saved) parsed.data.mediaUrl = saved.url;
    }

    const newMsg = await MessageModel.create({ ...parsed.data, id: msgId });

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
