import { NextRequest, NextResponse } from "next/server";
import { handleIncomingPayload } from "../../ingest";
import crypto from "crypto";

export async function GET(req: NextRequest) {

    const p = new URL(req.url).searchParams;

    if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) {
        return new NextResponse(p.get('hub.challenge') || '', { status: 200 });
    }
    return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {

    const raw = await req.text();

    const sig = req.headers.get('x-hub-signature-256') || '';

    const expected = 'sha256=' + crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET || '').update(raw).digest('hex');
    const valido = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));

    if (!valido) return new NextResponse('Firma inválida', { status: 401 });

    const body = JSON.parse(raw);

    for (const entry of body.entry || []) {

        for (const change of entry.changes || []) {
            const value = change.value ?? {};

            for (const m of value.messages || []) {
                const nombre = value.contacts?.find(c => c.wa_id === m.from)?.profile?.name;

                const texto =
                    m.type === 'text' ? m.text?.body
                        : m.type === 'interactive' ? (m.interactive.button_reply?.title ?? m.interactive.list_reply?.title)
                            : m.type === 'button' ? m.button?.text
                                : '';

                await handleIncomingPayload({
                    messageId: m.id,
                    from: m.from,
                    fromName: nombre,
                    timestamp: Number(m.timestamp),
                    text: texto || '',
                    hasMedia: false,
                    receivedAt: new Date(Number(m.timestamp) * 1000).toISOString(),
                    isLid: false,
                    resolvedPhone: m.from,

                }).catch(() => null)
            }

            for (const status of value.statuses || []) {

                if (status.status === 'failed') {
                    const err = status.errors?.[0]
                    console.error(`Mensaje ${status.id} a ${status.recipient_id} falló: ${err?.title || err?.message} (${err?.code})`);
                } else if (status.status === 'delivered') {

                    console.log(`Mensaje ${status.id} a ${status.recipient_id} entregado`);
                }
            }
        }

    }

    return NextResponse.json({ success: true });
}