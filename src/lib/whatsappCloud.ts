import { InteractiveContent } from "./whatsappInteractive";


const GRAPH = `https://graph.facebook.com/v21.0`;
const cut = (s: string | undefined, n: number) => (s ? s.slice(0, n) : undefined);


export function cloudConfigured(): boolean {
    return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

export function buildInteractive(c: InteractiveContent) {

    const common = {
        ...(c.header ? { header: { type: "text", text: cut(c.header, 60) } } : {}),
        body: { text: cut(c.body, 1024) },
        ...(c.footer ? { footer: { text: cut(c.footer, 60) } } : {}),
    }

    if (c.buttons.length === 1 && c.buttons[0].kind === 'url' && c.buttons[0].url) {
        return {
            type: "cta_url",
            ...common,
            action: {
                name: "cta_url",
                parameters: { display_text: cut(c.buttons[0].label, 20), url: c.buttons[0].url }
            }
        }

    }


    const todosReply = c.buttons.length > 0 && c.buttons.every(b => b.kind === 'reply');
    if (todosReply && c.buttons.length <= 3) {
        return {
            type: "button",
            ...common,
            action: {
                buttons: c.buttons.map((b, i) => ({
                    type: "reply",
                    reply: { id: `btn_${i}`, title: cut(b.label, 20) }
                }))
            }
        }
    }

    return null;
}

export type CloudResult =
    | { ok: true, messageId?: string }
    | { ok: false, status: number, error: string, code?: number };


export async function cloudSend(to: string, payload: Record<string, unknown>): Promise<CloudResult> {

    try {
        const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...payload }),
            cache: "no-store"
        });

        const body = await res.json().catch(() => null);
        if (!res.ok) {
            return {
                ok: false,
                status: res.status,
                code: body?.error?.code,
                error: body?.error?.error_data?.details || body?.error?.message || `Http ${res.status}`
            }
        }
        return { ok: true, messageId: body?.messages?.[0]?.id };
    } catch (err) {
        return { ok: false, status: 0, error: (err as Error).message || 'Sin conexión a Meta' };
    }
}