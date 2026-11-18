import { describe, expect, it } from 'vitest';
import {
  getMessageEventDate,
  mergeMessagesChronologically,
  sortMessagesChronologically,
} from '@/lib/messageOrdering';
import type { Message } from '@/types';

describe('sortMessagesChronologically', () => {
  it('uses the WhatsApp event timestamp instead of a later processing time', () => {
    const messageDate = new Date('2026-11-18T20:56:00.000Z');
    const processedLater = '2026-11-18T22:13:00.000Z';

    expect(getMessageEventDate(messageDate.getTime() / 1000, processedLater))
      .toEqual(messageDate);
  });

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

  it('uses the live event timestamp when the history has an older copy of that message', () => {
    const storedSticker = {
      id: 'sticker',
      conversationId: 'conversation',
      sender: 'contact',
      text: '',
      timestamp: '17:11',
      channel: 'whatsapp',
      status: 'read',
      createdAt: '2026-11-18T22:11:10.000Z',
    } satisfies Message;
    const liveSticker = {
      ...storedSticker,
      createdAt: '2026-11-18T20:56:00.000Z',
    } satisfies Message;
    const laterText = {
      id: 'text',
      conversationId: 'conversation',
      sender: 'contact',
      text: 'hola',
      timestamp: '16:57',
      channel: 'whatsapp',
      status: 'read',
      createdAt: '2026-11-18T21:57:00.000Z',
    } satisfies Message;

    expect(mergeMessagesChronologically([storedSticker, laterText, liveSticker])
      .map((message) => message.id))
      .toEqual(['sticker', 'text']);
  });
});
