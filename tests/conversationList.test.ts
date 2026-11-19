import { describe, it, expect } from 'vitest';
import { upsertConversationInList } from '@/lib/conversationList';
import type { Contact, Conversation } from '@/types';

const contacto: Contact = {
  id: 'c_1',
  name: 'Cliente',
  avatar: 'C',
  handle: '51953123123',
  phone: '+51953123123',
  channel: 'whatsapp',
  origin: 'whatsapp',
  tags: [],
  sentiment: 'neutral',
  leadScore: 50,
  stage: 'lead',
  dealValue: 0,
  notes: '',
  lastActive: 'Ahora',
  company: '',
};

function conversacion(id: string, extra: Partial<Conversation> = {}): Conversation {
  return {
    id,
    contactId: contacto.id,
    contact: contacto,
    channel: 'whatsapp',
    unreadCount: 0,
    lastMessage: '',
    lastMessageTime: 'Ahora',
    status: 'open',
    assignedAgent: 'Asesor Whato',
    ...extra,
  };
}

describe('upsertConversationInList', () => {
  it('inserta arriba la conversacion que no estaba en la lista', () => {
    const existente = conversacion('conv_vieja');
    const nueva = conversacion('conv_nueva', { unreadCount: 1, lastMessage: 'hola' });

    const { conversations, added } = upsertConversationInList([existente], nueva);

    expect(added).toBe(true);
    expect(conversations.map((c) => c.id)).toEqual(['conv_nueva', 'conv_vieja']);
    expect(conversations[0].unreadCount).toBe(1);
  });

  it('actualiza en su sitio la conversacion que ya existia', () => {
    const previa = conversacion('conv_1', { lastMessage: 'antes', unreadCount: 0 });

    const { conversations, added } = upsertConversationInList(
      [previa, conversacion('conv_2')],
      conversacion('conv_1', { lastMessage: 'despues', unreadCount: 2 })
    );

    expect(added).toBe(false);
    expect(conversations.map((c) => c.id)).toEqual(['conv_1', 'conv_2']);
    expect(conversations[0].lastMessage).toBe('despues');
    expect(conversations[0].unreadCount).toBe(2);
  });

  it('no muta la lista original', () => {
    const original = [conversacion('conv_1')];
    const copia = [...original];

    upsertConversationInList(original, conversacion('conv_2'));

    expect(original).toEqual(copia);
    expect(original).toHaveLength(1);
  });
});
