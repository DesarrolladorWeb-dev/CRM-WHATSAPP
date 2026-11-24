import type { Conversation } from '@/types';

/**
 * Inserta o actualiza una conversacion dentro de la lista del inbox.
 *
 * El servidor crea la conversacion en tres sitios que corren a la vez: el
 * webhook de WhatsApp, el POST del navegador y el sondeo periodico. Solo el
 * primero que llega obtiene `isNewConversation: true`; los demas reciben
 * `false` aunque en esta pestaña la conversacion todavia no exista. Con un
 * `map()` esa conversacion se descartaba en silencio y un chat de un contacto
 * nuevo no aparecia hasta recargar la pagina (la recarga si lo trae de
 * Postgres). Por eso aqui se hace upsert por id: si falta, entra arriba.
 */
export function upsertConversationInList(
  conversations: Conversation[],
  incoming: Conversation
): { conversations: Conversation[]; added: boolean } {
  const index = conversations.findIndex((conversation) => conversation.id === incoming.id);

  if (index === -1) {
    return { conversations: [incoming, ...conversations], added: true };
  }

  const next = conversations.slice();
  next[index] = { ...next[index], ...incoming };
  return { conversations: next, added: false };
}
