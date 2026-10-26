import { apiFetch } from "./apiClient";
import { InteractiveContent } from "./whatsappInteractive";


export async function sendInteractiveMessage(phone: string, content: InteractiveContent) {

    try {
        const res = await apiFetch(`/api/whatsapp/cloud/send-interactive`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, ...content })
        });

        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.success) {
            return { ok: false as const, status: res.status, error: body?.error || `HTTP ${res.status}` };
        }

        return { ok: true as const, data: { messageId: body?.messageId as string | undefined, degraded: !body.degraded } };

    } catch {
        return { ok: false as const, status: 0, error: 'No se pudo contactar con el servidor' };
    }
}