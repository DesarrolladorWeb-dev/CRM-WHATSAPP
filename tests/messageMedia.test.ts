import { describe, it, expect } from 'vitest';
import { messageSchema } from '@/lib/validators';

// Un mensaje de n8n puede traer la imagen de dos formas: como URL (a veces
// data URL) o como objeto `media` con base64 crudo. Antes `media` no estaba
// declarado en messageSchema y zod lo descartaba en silencio: POST
// /api/messages respondía 200 pero en Mongo quedaba un mensaje sin binario.
describe('POST /api/messages: multimedia de integraciones', () => {
  const base = {
    conversationId: 'conv_wa_51987654321_num',
    sender: 'bot' as const,
    senderName: 'Asistente XIO',
    text: '',
  };

  it('conserva media con base64 crudo y mimetype', () => {
    const parsed = messageSchema.safeParse({
      ...base,
      hasMedia: true,
      mediaType: 'image',
      media: {
        mimetype: 'image/png',
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      },
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const media = parsed.data.media;
      expect(typeof media).toBe('object');
      if (media && typeof media === 'object') {
        expect(media.mimetype).toBe('image/png');
        expect(media.data).toBeTruthy();
      }
    }
  });

  it('acepta mediaUrl remota y mediaUrl como data URL', () => {
    for (const mediaUrl of [
      'https://cdn.ejemplo.com/oferta.png',
      'data:image/png;base64,iVBORw0KGgo=',
    ]) {
      const parsed = messageSchema.safeParse({ ...base, mediaUrl });
      expect(parsed.success, mediaUrl).toBe(true);
      if (parsed.success) expect(parsed.data.mediaUrl).toBe(mediaUrl);
    }
  });

  it('acepta media como string (URL suelta) además de objeto', () => {
    const parsed = messageSchema.safeParse({
      ...base,
      media: 'https://cdn.ejemplo.com/oferta.png',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.media).toBe('https://cdn.ejemplo.com/oferta.png');
    }
  });

  it('sigue exigiendo conversationId y sender', () => {
    expect(messageSchema.safeParse({ text: 'hola' }).success).toBe(false);
    expect(
      messageSchema.safeParse({ conversationId: 'c1', sender: 'desconocido' })
        .success,
    ).toBe(false);
  });
});
