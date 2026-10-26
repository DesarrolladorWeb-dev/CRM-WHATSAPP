import type { PrismaClient, Prisma, Conversation as ConversationRow } from '../../generated/prisma/client';
import type { Conversation } from '@/types';

// La app recibe la conversacion sin el objeto `contact` embebido: page.tsx lo
// enlaza desde la lista de contactos usando contactId.
type ApiConversation = Omit<Conversation, 'contact'> & { createdAt?: Date; updatedAt?: Date };

function toApiConversation(row: ConversationRow): ApiConversation {
  return {
    id: row.id,
    contactId: row.contactId,
    channel: row.channel as Conversation['channel'],
    unreadCount: row.unreadCount,
    lastMessage: row.lastMessage,
    lastMessageTime: row.lastMessageTime,
    status: row.status as Conversation['status'],
    assignedAgent: row.assignedAgent,
    summary: row.summary ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type ConversationInput = Partial<Omit<Conversation, 'contact'>>;

function scalarData(input: ConversationInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (input.contactId !== undefined) data.contactId = input.contactId;
  if (input.channel !== undefined) data.channel = input.channel;
  if (input.unreadCount !== undefined) data.unreadCount = input.unreadCount;
  if (input.lastMessage !== undefined) data.lastMessage = input.lastMessage;
  if (input.lastMessageTime !== undefined) data.lastMessageTime = input.lastMessageTime;
  if (input.status !== undefined) data.status = input.status;
  if (input.assignedAgent !== undefined) data.assignedAgent = input.assignedAgent;
  if (input.summary !== undefined) data.summary = input.summary;
  return data;
}

export async function listConversations(
  db: PrismaClient,
  filter: { channel?: string | null } = {}
): Promise<ApiConversation[]> {
  const where: Prisma.ConversationWhereInput = {};
  if (filter.channel && filter.channel !== 'all') where.channel = filter.channel;
  const rows = await db.conversation.findMany({ where, orderBy: { updatedAt: 'desc' } });
  return rows.map(toApiConversation);
}

export async function getConversation(
  db: PrismaClient,
  id: string
): Promise<ApiConversation | null> {
  const row = await db.conversation.findUnique({ where: { id } });
  return row ? toApiConversation(row) : null;
}

export async function upsertConversation(
  db: PrismaClient,
  id: string,
  input: ConversationInput
): Promise<ApiConversation> {
  const scalar = scalarData(input);
  const row = await db.conversation.upsert({
    where: { id },
    update: scalar as Prisma.ConversationUpdateInput,
    create: {
      ...(scalar as Prisma.ConversationUncheckedCreateInput),
      id,
      contactId: input.contactId ?? '',
    },
  });
  return toApiConversation(row);
}

export async function updateConversation(
  db: PrismaClient,
  id: string,
  input: ConversationInput
): Promise<ApiConversation | null> {
  const exists = await db.conversation.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return null;
  const row = await db.conversation.update({
    where: { id },
    data: scalarData(input) as Prisma.ConversationUpdateInput,
  });
  return toApiConversation(row);
}

/**
 * Actualiza el ultimo mensaje de la conversacion padre al insertar un mensaje.
 * Un mensaje entrante ('contact') incrementa el contador de no leidos; uno
 * saliente lo pone a cero.
 */
export async function bumpLastMessage(
  db: PrismaClient,
  conversationId: string,
  opts: { text: string; sender: string }
): Promise<void> {
  const incoming = opts.sender === 'contact';
  await db.conversation
    .update({
      where: { id: conversationId },
      data: {
        lastMessage: opts.text || '[Imagen adjunta]',
        lastMessageTime: 'Ahora',
        unreadCount: incoming ? { increment: 1 } : 0,
      },
    })
    .catch(() => null);
}

export async function deleteConversation(db: PrismaClient, id: string): Promise<void>{
  await db.conversation.delete({where: {id}}).catch(()=> null)
}