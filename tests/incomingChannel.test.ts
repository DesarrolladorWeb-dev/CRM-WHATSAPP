import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { handleIncomingPayload } from '@/app/api/whatsapp/ingest';
import { POST as webhookPOST } from '@/app/api/whatsapp/webhook/route';
import { connectToPostgres } from '@/lib/postgres';
import { connectToDatabase, isDbConnected } from '@/lib/mongodb';
import { MessageModel } from '@/models/Message';
import { upsertContact } from '@/lib/repositories/contactRepo';
import { upsertConversation, bumpLastMessage } from '@/lib/repositories/conversationRepo';

// Prueba de integracion del flujo de recepcion: se ejecuta el handler real y
// solo se sustituyen las fronteras (Postgres, Mongo y repositorios). Asi se
// verifica de punta a punta que el canal del payload llega al contacto, a la
// conversacion, al mensaje de Mongo y a la respuesta HTTP.

vi.mock('@/lib/auth', () => ({
  requireUserPermission: vi.fn(),
}));

vi.mock('@/lib/demo', () => ({
  DEMO_MODE: false,
  dbUnavailableResponse: () => {
    throw new Error('La prueba no deberia llegar al respaldo de base caida');
  },
}));

vi.mock('@/lib/postgres', () => ({
  connectToPostgres: vi.fn(),
}));

vi.mock('@/lib/mongodb', () => ({
  connectToDatabase: vi.fn(),
  isDbConnected: vi.fn(),
}));

vi.mock('@/models/Message', () => ({
  MessageModel: {
    updateOne: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/contactRepo', () => ({
  upsertContact: vi.fn(),
}));

vi.mock('@/lib/repositories/conversationRepo', () => ({
  upsertConversation: vi.fn(),
  bumpLastMessage: vi.fn(),
}));

vi.mock('@/lib/mediaStorage', () => ({
  saveMedia: vi.fn(),
}));

type FakeDb = ReturnType<typeof crearDbFalsa>;

function crearDbFalsa() {
  return {
    contact: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    conversation: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

function contactoExistente(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c_viejo',
    name: 'Elena Rostova',
    handle: 'elena.rostova',
    phone: null,
    email: null,
    channel: 'whatsapp',
    sentiment: 'neutral',
    leadScore: 50,
    stage: 'lead',
    dealValue: 0,
    notes: '',
    lastActive: 'Ahora',
    company: '',
    avatarUrl: null,
    ...overrides,
  };
}

let db: FakeDb;

beforeEach(() => {
  vi.resetAllMocks();

  db = crearDbFalsa();
  vi.mocked(connectToPostgres).mockResolvedValue(db as never);

  vi.mocked(connectToDatabase).mockResolvedValue({} as never);
  vi.mocked(isDbConnected).mockReturnValue(true);

  vi.mocked(upsertContact).mockImplementation(async (_db, id, input) => ({
    id,
    name: input.name ?? id,
    avatar: input.avatar ?? '',
    handle: input.handle ?? id,
    phone: input.phone ?? undefined,
    email: input.email ?? undefined,
    channel: input.channel ?? 'whatsapp',
    tags: [],
    sentiment: 'neutral',
    leadScore: 50,
    stage: 'lead',
    dealValue: 0,
    notes: input.notes ?? '',
    lastActive: 'Ahora',
    company: '',
  } as never));

  vi.mocked(upsertConversation).mockImplementation(async (_db, id, input) => ({
    id,
    contactId: input.contactId ?? '',
    channel: input.channel ?? 'whatsapp',
    unreadCount: input.unreadCount ?? 0,
    lastMessage: input.lastMessage ?? '',
    lastMessageTime: input.lastMessageTime ?? '',
    status: input.status ?? 'open',
    assignedAgent: input.assignedAgent ?? '',
  } as never));

  vi.mocked(bumpLastMessage).mockResolvedValue(undefined);
});

describe('recepcion omnicanal de mensajes entrantes', () => {
  it('clasifica un mensaje de Instagram como Instagram en contacto, conversacion, mensaje y respuesta', async () => {
    const res = await handleIncomingPayload({
      channel: 'instagram',
      messageId: 'ig_1',
      from: 'elena.rostova',
      fromName: 'Elena Rostova',
      text: 'Hola desde Instagram',
      receivedAt: '2026-11-09T16:00:00.000Z',
    });

    expect(res.status).toBe(200);
    const payload = await res.json();

    expect(payload.data.channel).toBe('instagram');
    expect(payload.data.handle).toBe('elena.rostova');
    expect(payload.data.contact.channel).toBe('instagram');
    expect(payload.data.conversation.channel).toBe('instagram');
    expect(payload.data.message.channel).toBe('instagram');

    expect(upsertContact).toHaveBeenCalledWith(
      db,
      expect.stringMatching(/^c_instagram_/),
      expect.objectContaining({
        channel: 'instagram',
        handle: 'elena.rostova',
        name: 'Elena Rostova',
      })
    );

    expect(upsertConversation).toHaveBeenCalledWith(
      db,
      expect.stringMatching(/^conv_instagram_/),
      expect.objectContaining({ channel: 'instagram' })
    );

    expect(MessageModel.updateOne).toHaveBeenCalledWith(
      { id: 'ig_1' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ channel: 'instagram' }),
      }),
      { upsert: true }
    );
  });

  it('mantiene WhatsApp como canal por defecto y conserva el telefono', async () => {
    const res = await handleIncomingPayload({
      messageId: 'wa_1',
      from: '51987654321@s.whatsapp.net',
      fromName: 'Juan Perez',
      text: 'Hola desde WhatsApp',
    });

    expect(res.status).toBe(200);
    const payload = await res.json();

    expect(payload.data.channel).toBe('whatsapp');
    expect(payload.data.contact.channel).toBe('whatsapp');
    expect(payload.data.conversation.channel).toBe('whatsapp');
    expect(payload.data.message.channel).toBe('whatsapp');

    expect(upsertContact).toHaveBeenCalledWith(
      db,
      'c_wa_51987654321_num',
      expect.objectContaining({
        channel: 'whatsapp',
        handle: '51987654321',
        phone: '+51987654321',
      })
    );
    expect(upsertConversation).toHaveBeenCalledWith(
      db,
      'conv_wa_51987654321_num',
      expect.objectContaining({ channel: 'whatsapp' })
    );
  });

  it('acepta un ID numerico de Messenger sin intentar convertirlo en telefono', async () => {
    const res = await handleIncomingPayload({
      channel: 'messenger',
      messageId: 'ms_1',
      from: '17841400000000000',
      fromName: 'Cliente Messenger',
      text: 'Hola',
    });

    expect(res.status).toBe(200);
    const payload = await res.json();

    expect(payload.data.channel).toBe('messenger');
    expect(payload.data.contact.channel).toBe('messenger');
    expect(upsertContact).toHaveBeenCalledWith(
      db,
      expect.stringMatching(/^c_messenger_/),
      expect.objectContaining({
        channel: 'messenger',
        handle: '17841400000000000',
        phone: null,
      })
    );
  });

  it('guarda el correo como email y como handle cuando el canal es email', async () => {
    const res = await handleIncomingPayload({
      channel: 'email',
      messageId: 'mail_1',
      from: 'cliente@example.com',
      fromName: 'Cliente Email',
      text: 'Hola',
    });

    expect(res.status).toBe(200);
    const payload = await res.json();

    expect(payload.data.channel).toBe('email');
    expect(payload.data.contact.channel).toBe('email');
    expect(upsertContact).toHaveBeenCalledWith(
      db,
      expect.stringMatching(/^c_email_/),
      expect.objectContaining({
        channel: 'email',
        handle: 'cliente@example.com',
        email: 'cliente@example.com',
      })
    );
  });

  it('rechaza un canal desconocido sin escribir en la base', async () => {
    const res = await handleIncomingPayload({
      channel: 'telegram' as never,
      from: 'alguien',
      text: 'Hola',
    });

    expect(res.status).toBe(400);
    expect(upsertContact).not.toHaveBeenCalled();
    expect(upsertConversation).not.toHaveBeenCalled();
    expect(MessageModel.updateOne).not.toHaveBeenCalled();
  });

  it('corrige un contacto antiguo marcado como WhatsApp cuando llega por Instagram y no tiene telefono', async () => {
    db.contact.findFirst.mockResolvedValue(contactoExistente());

    const res = await handleIncomingPayload({
      channel: 'instagram',
      messageId: 'ig_2',
      from: 'elena.rostova',
      text: 'Hola de nuevo',
    });

    expect(res.status).toBe(200);
    const payload = await res.json();

    expect(upsertContact).not.toHaveBeenCalled();
    expect(db.contact.update).toHaveBeenCalledWith({
      where: { id: 'c_viejo' },
      data: { channel: 'instagram' },
    });
    expect(payload.data.contact.channel).toBe('instagram');
    expect(payload.data.conversation.channel).toBe('instagram');
    expect(upsertConversation).toHaveBeenCalledWith(
      db,
      'conv_instagram_c_viejo',
      expect.objectContaining({ channel: 'instagram', contactId: 'c_viejo' })
    );
  });

  it('no reescribe el canal de un contacto de WhatsApp real que si tiene telefono', async () => {
    db.contact.findFirst.mockResolvedValue(
      contactoExistente({
        id: 'c_wa_real',
        handle: '51987654321',
        phone: '+51987654321',
      })
    );

    const res = await handleIncomingPayload({
      channel: 'instagram',
      messageId: 'ig_3',
      from: 'elena.rostova',
      text: 'Hola',
    });

    expect(res.status).toBe(200);
    expect(db.contact.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { channel: 'instagram' } })
    );
  });

  it('el webhook HTTP acepta channel y lo propaga hasta la respuesta', async () => {
    const req = new NextRequest('http://localhost/api/whatsapp/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'twitter',
        messageId: 'tw_1',
        from: '@sofia_tech',
        fromName: 'Sofia',
        text: 'Hola desde X',
      }),
    });

    const res = await webhookPOST(req);

    expect(res.status).toBe(200);
    const payload = await res.json();

    expect(payload.data.channel).toBe('twitter');
    expect(payload.data.handle).toBe('sofia_tech');
    expect(payload.data.contact.channel).toBe('twitter');
    expect(payload.data.conversation.channel).toBe('twitter');
    expect(payload.data.message.channel).toBe('twitter');
    expect(upsertContact).toHaveBeenCalledWith(
      db,
      expect.stringMatching(/^c_twitter_/),
      expect.objectContaining({ channel: 'twitter', handle: 'sofia_tech' })
    );
  });
});
