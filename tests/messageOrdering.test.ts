import { describe, expect, it } from 'vitest';
import { sortMessagesChronologically } from '@/lib/messageOrdering';
import type { Message } from '@/types';

describe('sortMessagesChronologically', () => {
  it('keeps stickers in receive-time order when their upload finishes later', () => {
    const laterText = {
      id: 'text',
      conversationId: 'conversation',
      sender: 'contact',
      text: 'hola',
      timestamp: '16:30',
      channel: 'whatsapp',
      status: 'read',
      createdAt: '2026-11-18T16:30:02.000Z',
    } satisfies Message;
    const earlierSticker = {
      id: 'sticker',
      conversationId: 'conversation',
      sender: 'contact',
      text: '',
      timestamp: '16:30',
      channel: 'whatsapp',
      status: 'read',
      createdAt: '2026-11-18T16:30:01.000Z',
    } satisfies Message;

    expect(sortMessagesChronologically([laterText, earlierSticker]).map((message) => message.id))
      .toEqual(['sticker', 'text']);
  });
});
