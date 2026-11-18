import type { Message } from '@/types';

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
