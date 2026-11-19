import { describe, it, expect, vi, beforeEach } from 'vitest';

// El ingest arrastra medio backend: aqui solo interesa como trata la multimedia
// que llega como URL (stickers) en vez de base64.
const { updateOne, findOne, saveMedia, bumpLastMessage, contactFindFirst, conversationFindFirst } = vi.hoisted(() => ({
  updateOne: vi.fn(),
  findOne: vi.fn(),
  saveMedia: vi.fn(),
  bumpLastMessage: vi.fn(),
  contactFindFirst: vi.fn(),
  conversationFindFirst: vi.fn(),
}));

vi.mock('@/models/Message', () => ({ MessageModel: { updateOne, findOne } }));

vi.mock('@/lib/mongodb', () => ({
  connectToDatabase: vi.fn(async () => ({})),
  isDbConnected: () => true,
}));

vi.mock('@/lib/postgres', () => ({
  connectToPostgres: vi.fn(async () => ({
    contact: { findFirst: contactFindFirst, update: vi.fn() },
    conversation: { findFirst: conversationFindFirst },
  })),
}));

vi.mock('@/lib/repositories/contactRepo', () => ({ upsertContact: vi.fn() }));

vi.mock('@/lib/repositories/conversationRepo', () => ({
  upsertConversation: vi.fn(),
  bumpLastMessage,
}));

vi.mock('@/lib/auth', () => ({ requireWriteAccess: vi.fn(async () => null) }));

vi.mock('@/lib/mediaStorage', () => ({ saveMedia }));

vi.mock('@/lib/demo', () => ({
  DEMO_MODE: false,
  dbUnavailableResponse: vi.fn(),
}));

import { handleIncomingPayload, type IncomingPayload } from '@/app/api/whatsapp/ingest';

/** Argumentos del `MessageModel.updateOne(filtro, update, opciones)` del ingest. */
type UpsertUpdate = { $set: Record<string, unknown>; $setOnInsert?: Record<string, unknown> };
type UpsertCall = [Record<string, unknown>, UpsertUpdate, Record<string, unknown>];

function ultimoUpsert(): { filtro: Record<string, unknown>; update: UpsertUpdate; opciones: Record<string, unknown> } {
  const llamada = updateOne.mock.calls.at(-1) as unknown as UpsertCall;
  expect(llamada).toBeDefined();
  return { filtro: llamada[0], update: llamada[1], opciones: llamada[2] };
}

async function ingestar(extra: Partial<IncomingPayload> = {}) {
  const res = await handleIncomingPayload({
    messageId: 'm_sticker_1',
    from: '51953123123@s.whatsapp.net',
    fromName: 'Cliente',
    timestamp: Date.parse('2026-11-10T10:00:00Z') / 1000,
    ...extra,
  });
  expect(res.status).toBe(200);
  return res.json() as Promise<{
    data: { message: { mediaUrl?: string; hasMedia?: boolean; mediaType?: string } };
  }>;
}

/** Simula `MessageModel.findOne(...).select(...).lean()`. */
function documentoGuardado(doc: unknown) {
  findOne.mockReturnValue({ select: () => ({ lean: async () => doc }) });
}

describe('media entrante servida por URL (stickers)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    contactFindFirst.mockResolvedValue({
      id: 'c_1',
      name: 'Cliente',
      handle: '51953123123',
      phone: '+51953123123',
      origin: 'whatsapp',
      sentiment: 'neutral',
      leadScore: 50,
      stage: 'lead',
      dealValue: 0,
      notes: '',
      lastActive: 'Ahora',
      company: '',
    });

    conversationFindFirst.mockResolvedValue({
      id: 'conv_1',
      contactId: 'c_1',
      channel: 'whatsapp',
      unreadCount: 0,
      lastMessage: '',
      lastMessageTime: 'Ahora',
      status: 'open',
      assignedAgent: 'Asesor Whato',
    });

    updateOne.mockResolvedValue({ upsertedCount: 1 });
    documentoGuardado(null);
  });

  it('guarda la URL del sticker y lo marca con multimedia', async () => {
    await ingestar({
      hasMedia: true,
      mediaType: 'sticker',
      mediaUrl: 'https://wa.ejemplo.com/media/sticker-1.webp',
    });

    const { update } = ultimoUpsert();
    expect(update.$set.mediaUrl).toBe('https://wa.ejemplo.com/media/sticker-1.webp');
    expect(update.$set.hasMedia).toBe(true);
    expect(update.$set.mediaType).toBe('sticker');
    // No hay binario que escribir en disco.
    expect(saveMedia).not.toHaveBeenCalled();
  });

  it('acepta la URL metida en media.data en vez de base64', async () => {
    await ingestar({
      hasMedia: true,
      mediaType: 'sticker',
      media: {
        mimetype: 'image/webp',
        data: 'https://wa.ejemplo.com/media/sticker-2.webp',
      },
    });

    const { update } = ultimoUpsert();
    expect(update.$set.mediaUrl).toBe('https://wa.ejemplo.com/media/sticker-2.webp');
    expect(update.$set.hasMedia).toBe(true);
    // Lo importante: no se base64-decodifica la URL y se escribe un archivo corrupto.
    expect(saveMedia).not.toHaveBeenCalled();
  });

  it('acepta mediaInfo, que el servicio manda junto a media', async () => {
    // Payload real del servicio (whatsapp.service.js -> sendToWebhook): ademas
    // de `media` incluye `mediaInfo`. Con el schema en `.strict()` y el campo
    // sin declarar, todo mensaje con multimedia respondia 400 y no se guardaba
    // ni el mensaje ni el archivo.
    await ingestar({
      hasMedia: true,
      mediaType: 'image',
      mediaInfo: {
        mimetype: 'image/jpeg',
        fileName: null,
        caption: null,
        width: 1080,
        height: 1350,
        seconds: null,
      },
      media: {
        mimetype: 'image/jpeg',
        data: Buffer.from('imagen').toString('base64'),
      },
    });

    const { update } = ultimoUpsert();
    expect(update.$set.hasMedia).toBe(true);
    expect(update.$set.mediaType).toBe('image');
  });

  it('descarta esquemas que el navegador no cargaria', async () => {
    await ingestar({
      hasMedia: true,
      mediaType: 'sticker',
      mediaUrl: 'javascript:alert(1)',
    });

    const { update } = ultimoUpsert();
    expect(update.$set.mediaUrl).toBeUndefined();
    // `hasMedia` sigue viniendo del service; lo que se descarta es la fuente.
    expect(update.$set.hasMedia).toBe(true);
  });

  it('devuelve la mediaUrl que ya guardo el webhook', async () => {
    // El evento de socket llega sin binario; el webhook lo guardo antes.
    documentoGuardado({ mediaUrl: '/api/media/conv_1/m_sticker_1.webp' });

    const payload = await ingestar({ hasMedia: true, mediaType: 'sticker' });

    expect(payload.data.message.mediaUrl).toBe('/api/media/conv_1/m_sticker_1.webp');
    // No se reescribe la fuente: solo se devuelve la que ya estaba.
    const { update } = ultimoUpsert();
    expect(update.$set.mediaUrl).toBeUndefined();
  });
});
