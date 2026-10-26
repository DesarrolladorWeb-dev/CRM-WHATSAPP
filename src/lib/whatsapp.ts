import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Cliente de WhatsApp Business Cloud API (Graph API de Meta).
 *
 * Las credenciales salen del entorno y ninguna se expone al navegador:
 *   WHATSAPP_ACCESS_TOKEN    token permanente de la app de Meta
 *   WHATSAPP_PHONE_NUMBER_ID id del numero emisor
 *   WHATSAPP_APP_SECRET      secreto de la app, para verificar la firma entrante
 *   WHATSAPP_VERIFY_TOKEN    cadena que elegimos nosotros, la usa Meta al dar de alta
 *   WHATSAPP_GRAPH_VERSION   version de la Graph API (por defecto v21.0)
 */

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

/** true si estan las credenciales minimas para enviar mensajes. */
export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/**
 * Verifica la firma X-Hub-Signature-256 que Meta adjunta a cada webhook.
 * Se calcula sobre el cuerpo CRUDO: si se re-serializa el JSON el hash cambia.
 * Devuelve false, nunca lanza, para que la ruta responda 401 sin filtrar detalle.
 */
export function verificarFirma(cuerpoCrudo: string, cabecera: string | null): boolean {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto || !cabecera || !cabecera.startsWith('sha256=')) return false;

  const esperado = createHmac('sha256', secreto).update(cuerpoCrudo, 'utf8').digest('hex');
  const recibido = cabecera.slice('sha256='.length);

  const a = Buffer.from(esperado, 'utf8');
  const b = Buffer.from(recibido, 'utf8');
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/** Comprueba el challenge del alta del webhook (GET de Meta). */
export function resolverChallenge(params: URLSearchParams): string | null {
  const modo = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;

  if (modo === 'subscribe' && esperado && token === esperado && challenge) {
    return challenge;
  }
  return null;
}

/** URL del endpoint de mensajes de la Graph API. */
export function urlMensajes(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return 'https://graph.facebook.com/' + GRAPH_VERSION + '/' + id + '/messages';
}

/** Resultado de un intento de envio. */
export type ResultadoEnvio =
  | { readonly ok: true; idExterno: string }
  | { readonly ok: false; motivo: 'sin_credenciales' | 'error_api'; detalle?: string };

/**
 * Envia un mensaje de texto por WhatsApp Business Cloud API.
 *
 * Devuelve un resultado explicito en vez de lanzar: quien llama decide que
 * hacer con el fallo. Si faltan credenciales no simula un envio exitoso, para
 * que la UI pueda avisar que el mensaje quedo guardado pero no salio.
 */
export async function enviarMensaje(
  telefono: string,
  texto: string
): Promise<ResultadoEnvio> {
  if (!isWhatsAppConfigured()) {
    return { ok: false, motivo: 'sin_credenciales' };
  }

  try {
    const res = await fetch(urlMensajes(), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.WHATSAPP_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telefono,
        type: 'text',
        text: { body: texto },
      }),
    });

    const datos = await res.json().catch(() => null);

    if (!res.ok) {
      return {
        ok: false,
        motivo: 'error_api',
        detalle: datos?.error?.message || 'HTTP ' + res.status,
      };
    }

    return { ok: true, idExterno: datos?.messages?.[0]?.id || '' };
  } catch (err) {
    return {
      ok: false,
      motivo: 'error_api',
      detalle: err instanceof Error ? err.message : 'fallo de red',
    };
  }
}
