import { NextRequest, NextResponse } from 'next/server';
import { connectToPostgres } from '@/lib/postgres';
import { connectToDatabase, isDbConnected } from '@/lib/mongodb';
import { MessageModel } from '@/models/Message';
import { INITIAL_ANALYTICS } from '@/mockData';
import { DEMO_MODE, dbUnavailableResponse } from '@/lib/demo';
import { SocialChannel } from '@/types';
import { captureException } from '@/lib/logger';
import { logger, motivo } from '@/lib/logger';
import { requireUserPermission } from '@/lib/auth';

const CHANNEL_COLORS: Record<SocialChannel, string> = {
  whatsapp: '#22c55e',
  instagram: '#e1306c',
  twitter: '#1da1f2',
  messenger: '#0084ff',
  email: '#ea4335',
};

const SENTIMENT_META: Record<string, { label: string; color: string }> = {
  positive: { label: 'Positivo', color: '#10b981' },
  neutral: { label: 'Neutral', color: '#6b7280' },
  urgent: { label: 'Urgente', color: '#f59e0b' },
  churn_risk: { label: 'Riesgo Churn', color: '#ef4444' },
};

const MONTH_LABELS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

interface MessageForResponseTime {
  conversationId: string;
  sender: string;
  createdAt: Date;
}

// Promedio de minutos entre un mensaje de contacto y la siguiente respuesta de agente/bot en la misma conversación.
function computeAvgResponseTimeMin(messages: MessageForResponseTime[]): number {
  const byConversation = new Map<string, MessageForResponseTime[]>();
  for (const m of messages) {
    const arr = byConversation.get(m.conversationId) || [];
    arr.push(m);
    byConversation.set(m.conversationId, arr);
  }

  const deltasMin: number[] = [];
  for (const msgs of byConversation.values()) {
    msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (let i = 1; i < msgs.length; i++) {
      const prev = msgs[i - 1];
      const curr = msgs[i];
      if (prev.sender === 'contact' && (curr.sender === 'agent' || curr.sender === 'bot')) {
        const deltaMin = (new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime()) / 60000;
        if (deltaMin >= 0 && deltaMin <= 24 * 60) deltasMin.push(deltaMin);
      }
    }
  }

  if (deltasMin.length === 0) return 0;
  return Math.round((deltasMin.reduce((a, b) => a + b, 0) / deltasMin.length) * 10) / 10;
}

function monthBucketKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

async function loadMessagesForResponseTime(): Promise<MessageForResponseTime[]> {
  const mongo = await connectToDatabase().catch(() => null);
  if (!mongo || !isDbConnected()) return [];
  const rows = await MessageModel.find({}, { conversationId: 1, sender: 1, createdAt: 1 }).lean();
  return rows as unknown as MessageForResponseTime[];
}

export async function GET(req: NextRequest) {
  const denied = await requireUserPermission(req, 'read');
  if (denied) return denied;

  try {
    const db = await connectToPostgres();
    if (!db) {
      if (DEMO_MODE) {
        return NextResponse.json({ success: true, source: 'demo', data: INITIAL_ANALYTICS });
      }
      return dbUnavailableResponse();
    }

    // Core relacional en Postgres; los mensajes (para el tiempo de respuesta) en Mongo.
    const [contacts, conversations, campaigns, messages] = await Promise.all([
      db.contact.findMany({ select: { channel: true, sentiment: true, stage: true, createdAt: true } }),
      db.conversation.findMany({ select: { id: true } }),
      db.campaign.findMany({ select: { sentCount: true, conversions: true } }),
      loadMessagesForResponseTime(),
    ]);

    if (
      contacts.length === 0 &&
      conversations.length === 0 &&
      campaigns.length === 0 &&
      DEMO_MODE
    ) {
      return NextResponse.json({ success: true, source: 'demo', data: INITIAL_ANALYTICS });
    }

    const totalConversations = conversations.length;
    const avgResponseTimeMin = computeAvgResponseTimeMin(messages);

    const closedWon = contacts.filter((c) => c.stage === 'closed_won').length;
    const leadConversionRate = contacts.length > 0 ? Math.round((closedWon / contacts.length) * 1000) / 10 : 0;

    const campaignsWithSends = campaigns.filter((c) => c.sentCount > 0);
    const campaignRoi =
      campaignsWithSends.length > 0
        ? Math.round(
            (campaignsWithSends.reduce((sum, c) => sum + (c.conversions / c.sentCount) * 100, 0) /
              campaignsWithSends.length) *
              10
          ) / 10
        : 0;

    const channelBreakdown = (Object.keys(CHANNEL_COLORS) as SocialChannel[]).map((channel) => ({
      channel,
      count: contacts.filter((c) => c.channel === channel).length,
      color: CHANNEL_COLORS[channel],
    }));

    const sentimentBreakdown = Object.entries(SENTIMENT_META).map(([key, meta]) => ({
      sentiment: meta.label,
      count: contacts.filter((c) => c.sentiment === key).length,
      color: meta.color,
    }));

    const buckets = new Map<string, { date: Date; leads: number; closed: number }>();
    for (const c of contacts) {
      const created = new Date(c.createdAt);
      if (Number.isNaN(created.getTime())) continue;
      const key = monthBucketKey(created);
      const bucket = buckets.get(key) || {
        date: new Date(created.getFullYear(), created.getMonth(), 1),
        leads: 0,
        closed: 0,
      };
      bucket.leads += 1;
      if (c.stage === 'closed_won') bucket.closed += 1;
      buckets.set(key, bucket);
    }
    const monthlyConversions = Array.from(buckets.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(-6)
      .map((b) => ({ month: MONTH_LABELS_ES[b.date.getMonth()], leads: b.leads, closed: b.closed }));

    const data = {
      totalConversations,
      avgResponseTimeMin,
      leadConversionRate,
      campaignRoi,
      channelBreakdown,
      monthlyConversions,
      sentimentBreakdown,
    };

    return NextResponse.json({ success: true, source: 'postgres', data });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/analytics', method: 'GET' });
    logger.error('Error in GET /api/analytics', { motivo: motivo(error) });
    if (DEMO_MODE) {
      return NextResponse.json({ success: true, source: 'demo', data: INITIAL_ANALYTICS });
    }
    return NextResponse.json(
      { success: false, error: 'No se pudieron calcular las métricas', errorId },
      { status: 500 }
    );
  }
}