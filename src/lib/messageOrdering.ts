import type { Message } from '@/types';

export function getMessageEventDate(timestamp?: number, receivedAt?: string): Date {
  if (timestamp !== undefined && Number.isFinite(timestamp) && timestamp > 0) {
    return new Date(timestamp * 1000);
  }
  return receivedAt ? new Date(receivedAt) : new Date();
}

export function sortMessagesChronologically(messages: Message[]): Message[] {
  return messages
    .map((message, index) => ({ message, index, time: Date.parse(message.createdAt || '') }))
    .sort((a, b) => {
      const aHasTime = Number.isFinite(a.time);
      const bHasTime = Number.isFinite(b.time);
      if (aHasTime && bHasTime && a.time !== b.time) return a.time - b.time;
      if (aHasTime !== bHasTime) return aHasTime ? 1 : -1;
      return a.index - b.index;
    })
    .map(({ message }) => message);
}

export function mergeMessagesChronologically(messages: Message[]): Message[] {
  const messagesById = new Map<string, Message>();
  for (const message of messages) {
    messagesById.set(message.id, message);
  }
  return sortMessagesChronologically([...messagesById.values()]);
}
