import { requireUserPermission } from "@/lib/auth";
import { buildInteractive, cloudConfigured, cloudSend } from "@/lib/whatsappCloud";
import { interactiveToText } from "@/lib/whatsappInteractive";
import { isLid, normalizePhone } from "@/lib/whatsappService";
import { NextRequest, NextResponse } from "next/server";


export async function POST(req: NextRequest) {

    const denied = await requireUserPermission(req, 'write');
    if (denied) return denied;


    if (!cloudConfigured()) {
        return NextResponse.json({ success: false, message: 'WhatsApp Cloud no configurado' }, { status: 503 });
    }

    const { phone, ...content } = await req.json().catch(() => ({}));
    if (!phone || !content?.body) {
        return NextResponse.json({ success: false, message: 'Faltan parámetros' }, { status: 400 });
    }

    if (isLid(phone)) {
        return NextResponse.json({ success: false, message: 'No se puede enviar mensajes a leads' }, { status: 422 });
    }

    const to = normalizePhone(phone);
    if (to.length < 8) {
        return NextResponse.json({ success: false, message: 'Número de teléfono inválido' }, { status: 422 });
    }

    const interactive = buildInteractive({ ...content, buttons: content.buttons ?? [] });

    const r = interactive
        ? await cloudSend(to, { type: "interactive", interactive })
        : await cloudSend(to, { type: "text", text: { body: interactiveToText(content), preview_url: false } });

    if (r.ok === false) {
        const fueraDeVentana = r.code === 131047;
        return NextResponse.json(
            {
                success: false,
                code: r.code,
                error: fueraDeVentana ? 'Han pasado más de 24 horas desde el último mensaje del cliente: hace falta una plantilla aprobada'
                    : r.error
            },
            { status: r.status || 502 });
    }

    return NextResponse.json({ success: true, messageId: r.messageId, degraded: !interactive });
}