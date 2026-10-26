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
  mediaUrl: z.string().optional(),
  interactive: z.any().optional(), // Se puede mejorar con un esquema más específico si se conoce la estructura de los mensajes interactivos
});

// `contactSchema` vivia aqui y no lo importaba nadie. Ademas contradecía a
// `schemas.ts` (max 200 para el nombre, 'negative' como sentimiento, notas con
// tope de 5000), asi que cualquiera que lo leyera se llevaba una idea falsa
// de lo que el sistema acepta. El unico schema de contacto es
// `contactCreateSchema` / `contactUpdateSchema` de schemas.ts.
