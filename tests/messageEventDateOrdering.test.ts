import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message } from '@/types';

// El ingest importa medio backend (Postgres, Mongo, media...). Para este test
// solo interesan dos cosas: que el upsert guarde la fecha del EVENTO y que el
// orden cronologico use esa fecha y no la de insercion.
const { updateOne, bumpLastMessage, contactFindFirst, conversationFindFirst } = vi.hoisted(() => ({
  updateOne: vi.fn(),
  bumpLastMessage: vi.fn(),
  contactFindFirst: vi.fn(),
  conversationFindFirst: vi.fn(),
}));

vi.mock('@/models/Message', () => ({ MessageModel: { updateOne } }));

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

vi.mock('@/lib/mediaStorage', () => ({ saveMedia: vi.fn(async () => null) }));

vi.mock('@/lib/demo', () => ({
  DEMO_MODE: false,
  dbUnavailableResponse: vi.fn(),
}));

import { handleIncomingPayload } from '@/app/api/whatsapp/ingest';
import { sortMessagesChronologically } from '@/lib/messageOrdering';

/** Argumentos del `MessageModel.updateOne(filtro, update, opciones)` del ingest. */
type UpsertCall = [
  Record<string, unknown>,
  {
    $setOnInsert: { id: string; createdAt: Date; updatedAt: Date };
    $set?: Record<string, unknown>;
  },
  Record<string, unknown>,
];

// Instantes del EVENTO (segundos, como los manda WhatsApp), no de insercion.
const EVENTO_ANTIGUO = Date.parse('2026-11-10T10:00:00Z') / 1000;
const EVENTO_RECIENTE = Date.parse('2026-11-10T11:00:00Z') / 1000;

describe('orden por fecha del evento en WhatsApp', () => {
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
  });

  /** Ingesta un mensaje y devuelve los argumentos del upsert a Mongo. */
  async function ingestar(messageId: string, timestampSegundos: number) {
    const res = await handleIncomingPayload({
      messageId,
      from: '51953123123@s.whatsapp.net',
      fromName: 'Cliente',
      timestamp: timestampSegundos,
      text: `texto ${messageId}`,
    });

    const llamada = updateOne.mock.calls.at(-1);
    expect(res.status).toBe(200);
    expect(llamada).toBeDefined();
    return llamada as unknown as UpsertCall;
  }

  it('guarda createdAt/updatedAt con la fecha del evento y desactiva los timestamps de Mongoose', async () => {
    const [, update, opciones] = await ingestar('m_antiguo', EVENTO_ANTIGUO);

    expect(update.$setOnInsert.createdAt).toEqual(new Date(EVENTO_ANTIGUO * 1000));
    expect(update.$setOnInsert.updatedAt).toEqual(new Date(EVENTO_ANTIGUO * 1000));
    // Sin `timestamps: false`, Mongoose sobrescribe createdAt con Date.now().
    expect(opciones).toMatchObject({ upsert: true, timestamps: false });
  });

  it('un mensaje que llega tarde pero es anterior se ordena antes que uno mas nuevo', async () => {
    // Primero entra el mensaje reciente; despues se reprocesa uno antiguo
    // (buffer del servicio o webhook con retraso).
    await ingestar('m_reciente', EVENTO_RECIENTE);
    await ingestar('m_antiguo', EVENTO_ANTIGUO);

    // Lo que quedo guardado en Mongo, en el orden en que se inserto.
    const guardados: Message[] = (updateOne.mock.calls as unknown as UpsertCall[]).map(([, update]) => ({
      id: update.$setOnInsert.id,
      conversationId: 'conv_1',
      sender: 'contact',
      text: '',
      timestamp: '',
      channel: 'whatsapp',
      status: 'read',
      createdAt: (update.$setOnInsert.createdAt as Date).toISOString(),
    }));

    // Orden de insercion: el reciente primero. El orden visible (por la fecha
    // del evento) debe poner el antiguo delante.
    expect(guardados.map(m => m.id)).toEqual(['m_reciente', 'm_antiguo']);
    expect(sortMessagesChronologically(guardados).map(m => m.id)).toEqual([
      'm_antiguo',
      'm_reciente',
    ]);
  });
});
