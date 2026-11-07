import { z } from 'zod';

export const messageSchema = z.object({
  id: z.string().max(64).optional(),
  conversationId: z.string().min(1, 'conversationId requerido').max(64),
  sender: z.enum(['contact', 'agent', 'bot'], { error: 'sender requerido' }),
  senderName: z.string().max(80).optional(),
  text: z.string().max(5000, 'texto excede 5000 caracteres').optional(),
  timestamp: z.string().max(40).optional(),
  channel: z.enum(['whatsapp', 'instagram', 'twitter', 'messenger', 'email']).optional(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']).optional(),
  hasMedia: z.boolean().optional(),
  mediaType: z.enum(['image', 'audio', 'video', 'document', 'sticker']).optional(),
  // Las dos formas en que un mensaje puede traer multimedia:
  //   - mediaUrl: URL (http/https) o data URL (`data:image/png;base64,...`).
  //   - media:    objeto con base64 crudo y mimetype, que es el formato que
  //               usa el resto de la app (y el que manda n8n cuando reutiliza
  //               el modelo Message en vez de una data URL).
  // Antes `media` no estaba declarado. Como zod descarta las claves
  // desconocidas, POST /api/messages respondía 200 pero guardaba el mensaje
  // sin el binario: en el chat quedaba una burbuja vacía y la imagen no
  // aparecía nunca.
  mediaUrl: z.string().max(20_000_000).optional(),
  media: z
    .union([
      z.object({
        mimetype: z.string().max(100).optional(),
        data: z.string().optional(),
        size: z.number().int().min(0).optional(),
        filename: z.string().max(200).nullable().optional(),
        width: z.number().int().min(0).optional(),
        height: z.number().int().min(0).optional(),
      }),
      // Algunas integraciones mandan `media` como URL suelta. Se acepta y se
      // trata igual que `mediaUrl`.
      z.string().max(20_000_000),
    ])
    .optional(),
  interactive: z.any().optional(), // Se puede mejorar con un esquema más específico si se conoce la estructura de los mensajes interactivos
});

// `contactSchema` vivia aqui y no lo importaba nadie. Ademas contradecía a
// `schemas.ts` (max 200 para el nombre, 'negative' como sentimiento, notas con
// tope de 5000), asi que cualquiera que lo leyera se llevaba una idea falsa
// de lo que el sistema acepta. El unico schema de contacto es
// `contactCreateSchema` / `contactUpdateSchema` de schemas.ts.
