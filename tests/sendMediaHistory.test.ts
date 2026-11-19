import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/whatsapp/send-media/route';
import { sendMediaMessage } from '@/lib/whatsappService';

const { create, saveMedia } = vi.hoisted(() => ({
  create: vi.fn(),
  saveMedia: vi.fn(),
}));

vi.mock('@/models/Message', () => ({ MessageModel: { create } }));
vi.mock('@/lib/mediaStorage', () => ({ saveMedia }));
vi.mock('@/lib/auth', () => ({ requireWriteAccess: async () => null }));
vi.mock('@/lib/mongodb', () => ({
  connectToDatabase: async () => ({}),
  isDbConnected: () => true,
}));
vi.mock('@/lib/postgres', () => ({ connectToPostgres: async () => null }));

const conversationId = 'conv_prueba';
const messageId = 'wa_prueba';
const phone = '51912345678';
const png = 'data:image/png;base64,cHJ1ZWJh';

function contestarEnvio() {
  const fetchSimulado = vi.fn(async () => Response.json({ success: true, messageId }));
  vi.stubGlobal('fetch', fetchSimulado);
  return fetchSimulado;
}

function enviarDesdeRuta(type: 'image' | 'document', media: string) {
  return POST(new NextRequest('http://localhost/api/whatsapp/send-media', {
    method: 'POST',
    body: JSON.stringify({ phone, conversationId, type, media }),
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('multimedia enviada por el chat', () => {
  it.each(['image', 'document'] as const)('envía %s por la ruta que guarda el historial', async (type) => {
    vi.stubGlobal('window', {});
    const fetchSimulado = contestarEnvio();
    await sendMediaMessage({ phone, type, media: png, conversationId });
    expect(fetchSimulado).toHaveBeenCalledWith('/api/whatsapp/send-media', expect.any(Object));
  });

  it('mantiene el puente para audio y video', async () => {
    vi.stubGlobal('window', {});
    const fetchSimulado = contestarEnvio();
    for (const type of ['audio', 'video'] as const) {
      await sendMediaMessage({ phone, type, media: 'datos', conversationId });
    }
    expect(fetchSimulado.mock.calls).toHaveLength(2);
    expect(fetchSimulado).toHaveBeenCalledWith('/api/wa-bridge/send-media', expect.any(Object));
  });

  it('guarda la imagen subida y devuelve el ID del mensaje', async () => {
    contestarEnvio();
    const url = '/api/media/conv_prueba/wa_prueba.png';
    saveMedia.mockResolvedValue({ url, mimetype: 'image/png', size: 6 });
    create.mockResolvedValue({ id: messageId });

    const res = await enviarDesdeRuta('image', png);
    expect(await res.json()).toMatchObject({ success: true, historyMessageId: messageId });
    expect(saveMedia).toHaveBeenCalledWith(expect.objectContaining({ conversationId, messageId, dataUrl: png }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ conversationId, mediaType: 'image', mediaUrl: url }));
  });

  it('conserva el enlace de una imagen enviada por URL', async () => {
    contestarEnvio();
    const mediaUrl = 'https://example.test/imagen.jpg';
    create.mockResolvedValue({ id: messageId });

    const res = await enviarDesdeRuta('image', mediaUrl);
    expect(await res.json()).toMatchObject({ success: true, historyMessageId: messageId });
    expect(saveMedia).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ mediaUrl }));
  });

  it('registra el PDF sin escribir el archivo', async () => {
    contestarEnvio();
    create.mockResolvedValue({ id: messageId });

    const res = await enviarDesdeRuta('document', 'data:application/pdf;base64,cHJ1ZWJh');
    expect(await res.json()).toMatchObject({ success: true, historyMessageId: messageId });
    expect(saveMedia).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'document', mediaUrl: undefined }));
  });

  it('distingue una imagen enviada de una imagen guardada', async () => {
    contestarEnvio();
    saveMedia.mockResolvedValue(null);

    const res = await enviarDesdeRuta('image', png);
    expect(await res.json()).toMatchObject({ success: true, historyMessageId: null });
    expect(create).not.toHaveBeenCalled();
  });
});
