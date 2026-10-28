import type { SocialChannel } from '@/types';
import { sendTextMessage, normalizePhone, sendMediaMessage } from '@/lib/whatsappService';

/**
 * Forma del resultado que devuelve el cliente de WhatsApp.
 *
 * Campos opcionales en un solo objeto en vez de una union discriminada: el
 * proyecto compila con `strict: false`, y sin `strictNullChecks` TypeScript no
 * estrecha uniones por el discriminante, asi que una union daria errores al
 * leer `.error` dentro del propio `if (!res.ok)`.
 */
type WhatsAppResult = {
  ok: boolean;
  data?: { messageId?: string; chatId?: string };
  error?: string;
  status?: number;
};

/**
 * Registro de canales de difusion.
 *
 * Whato es un CRM omnicanal: la misma campana puede salir por WhatsApp,
 * Instagram, X, Messenger o email. Cada canal se diferencia en tres cosas y
 * SOLO en tres cosas:
 *
 *   1. de que campo del contacto sale la direccion (telefono / @handle / email)
 *   2. si hay transporte conectado ahora mismo
 *   3. a que ritmo se puede enviar sin que el proveedor corte
 *
 * Todo lo demas (resolver la audiencia, la maquina de estados, el recuento de
 * metricas) es identico para los cinco. Por eso el resto de la logica de
 * campana no conoce ningun canal concreto: pide el adaptador aqui y lo usa.
 * Conectar Instagram manana = rellenar su `send` en este archivo, sin tocar
 * ninguna otra linea del sistema.
 */

/**
 * Resultado de un intento de envio individual, siempre explicito: nunca se
 * asume que algo salio bien por ausencia de excepcion.
 *
 * `retriable` distingue un fallo del proveedor (cortado, saturado) de un fallo
 * del destinatario (numero invalido): el primero se puede reintentar, el
 * segundo no tiene sentido repetirlo.
 */
export interface SendOutcome {
  ok: boolean;
  providerId?: string;
  error?: string;
  retriable?: boolean;
}

export interface ChannelAdapter {
  id: SocialChannel;
  label: string;
  /** Campo del contacto que hace de direccion en este canal. */
  addressField: 'phone' | 'handle' | 'email';
  /** Extrae y normaliza la direccion; null si el contacto no es alcanzable. */
  resolveAddress(contact: ContactAddressFields): string | null;
  /** Si el canal admite adjuntar imagen al mensaje. */
  supportsMedia: boolean;
  /** true si el transporte esta configurado y se puede enviar de verdad. */
  isConnected(): boolean;
  /** Pausa entre envios consecutivos, en ms (limite del proveedor). */
  throttleMs: number;
  send(address: string, text: string, imageUrl?: string): Promise<SendOutcome>;
}

/** Subconjunto del contacto que necesita el registro para resolver direccion. */
export interface ContactAddressFields {
  phone?: string | null;
  handle?: string | null;
  email?: string | null;
}

const MAX_CAPTIONS = 1000;


async function aDataUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:image/')) return imageUrl

  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error (`No se pudo descargar la imagen (HTTP ${res.status})`)

  const mime = res.headers.get('content-type')?.split(';')[0] ?? ''

  if (!mime.startsWith('image/')) {
    throw new Error(`La URL no devuelve una imagen (${mime || 'Tipo desconocido'}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return `data:${mime};base64,${buf.toString('base64')}`
}

/** Canal que todavia no tiene transporte: nunca miente diciendo que envio. */
function sinTransporte(motivo: string): ChannelAdapter['send'] {
  return async () => ({ ok: false, error: motivo, retriable: false });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Quita el @ inicial y los espacios de un usuario de red social. */
function limpiarHandle(handle?: string | null): string | null {
  const limpio = (handle || '').trim().replace(/^@+/, '');
  return limpio.length > 0 ? limpio : null;
}

const whatsapp: ChannelAdapter = {
  id: 'whatsapp',
  label: 'WhatsApp',
  addressField: 'phone',
  resolveAddress(contact) {
    const handle = (contact.handle || '').trim()
    if (handle.endsWith('@lid')) return handle
    
    const digits = normalizePhone(contact.phone || '');
    // Un numero utilizable tiene al menos prefijo + numero. Por debajo de 8
    // digitos es basura de formulario, no un destino.
    return digits.length >= 8 ? digits : null;
  },
  supportsMedia: true,
  isConnected() {
    // Dos transportes posibles: la Cloud API de Meta (credenciales en el
    // entorno) o el servicio local de WhatsApp, que siempre tiene una URL por
    // defecto (localhost:3001). Como el segundo no se puede verificar sin
    // hacer una peticion, el canal se da por disponible y un fallo real de
    // conexion queda registrado como error del destinatario, no como una
    // campana entera rechazada.
    return true;
  },
  throttleMs: 250,
  async send(address, text, imageUrl) {

    let res: WhatsAppResult


    // const res: WhatsAppResult = imageUrl
    //   ? await sendProductInfo(address, { productName: text, imageData: imageUrl })
    //   : await sendTextMessage(address, text);

    if (!imageUrl) {
      res = await sendTextMessage(address, text)
    } else {
      let media: string

      try {
        media = await aDataUrl(imageUrl)
      } catch (e) {
        return {
          ok: false,
          error: `Imagen inválida ${e instanceof Error ? e.message : String(e)}`,
          retriable: false
        }
      }

      if (text.length > MAX_CAPTIONS) {
        res = await sendMediaMessage({ phone: address, type: 'image', media })
        if (res.ok) res = await sendTextMessage(address, text)
      } else {
        res = await sendMediaMessage({phone: address, type: 'image', media, caption: text})
      }
    }


    if (res.ok) return { ok: true, providerId: res.data?.messageId };
    // 0 = no se pudo ni abrir la conexion; 429/5xx = el proveedor pide esperar.
    const status = res.status ?? 0;
    const retriable = status === 0 || status === 429 || status >= 500;
    return { ok: false, error: res.error || 'Error desconocido del canal', retriable };
  },
};

const instagram: ChannelAdapter = {
  id: 'instagram',
  label: 'Instagram',
  addressField: 'handle',
  resolveAddress: (c) => limpiarHandle(c.handle),
  supportsMedia: true,
  isConnected: () => Boolean(process.env.INSTAGRAM_ACCESS_TOKEN),
  throttleMs: 1000,
  send: sinTransporte('Instagram no esta conectado todavia'),
};

const twitter: ChannelAdapter = {
  id: 'twitter',
  label: 'X / Twitter',
  addressField: 'handle',
  resolveAddress: (c) => limpiarHandle(c.handle),
  supportsMedia: true,
  isConnected: () => Boolean(process.env.TWITTER_ACCESS_TOKEN),
  throttleMs: 1000,
  send: sinTransporte('X/Twitter no esta conectado todavia'),
};

const messenger: ChannelAdapter = {
  id: 'messenger',
  label: 'Messenger',
  addressField: 'handle',
  resolveAddress: (c) => limpiarHandle(c.handle),
  supportsMedia: true,
  isConnected: () => Boolean(process.env.MESSENGER_PAGE_TOKEN),
  throttleMs: 500,
  send: sinTransporte('Messenger no esta conectado todavia'),
};

const email: ChannelAdapter = {
  id: 'email',
  label: 'Email',
  addressField: 'email',
  resolveAddress(contact) {
    const dir = (contact.email || '').trim().toLowerCase();
    return EMAIL_RE.test(dir) ? dir : null;
  },
  supportsMedia: true,
  isConnected: () => Boolean(process.env.SMTP_URL),
  throttleMs: 100,
  send: sinTransporte('El envio por email no esta configurado todavia'),
};

const REGISTRO: Record<SocialChannel, ChannelAdapter> = {
  whatsapp,
  instagram,
  twitter,
  messenger,
  email,
};

/** Adaptador de un canal, o null si el identificador no es un canal valido. */
export function getChannelAdapter(channel: string): ChannelAdapter | null {
  return REGISTRO[channel as SocialChannel] ?? null;
}

/** Los cinco canales, para pintar estado de conexion en la interfaz. */
export function listChannelAdapters(): ChannelAdapter[] {
  return Object.values(REGISTRO);
}
