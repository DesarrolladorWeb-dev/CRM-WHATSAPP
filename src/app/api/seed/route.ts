import { NextRequest, NextResponse } from 'next/server';
import { connectToPostgres } from '@/lib/postgres';
import { connectToDatabase, isDbConnected } from '@/lib/mongodb';
import { MessageModel } from '@/models/Message';
import { WebhookLogModel } from '@/models/WebhookLog';
import { generateApiKey } from '@/lib/apiKeySecurity';
import { isSeedAllowed, seedRequiresConfirmation, SEED_CONFIRM_PHRASE } from '@/lib/seedGuard';
import { captureException } from '@/lib/logger';
import {
  INITIAL_CONTACTS,
  INITIAL_CONVERSATIONS,
  INITIAL_MESSAGES,
  INITIAL_SEGMENTS,
  INITIAL_CAMPAIGN,
  INITIAL_AUTOMATIONS,
  INITIAL_API_KEYS,
  INITIAL_QUICK_REPLIES,
  INITIAL_WEBHOOK_LOGS,
  INITIAL_WEBHOOK,
  INITIAL_PRESET_IMAGES,
  INITIAL_USERS,
} from '@/mockData';
import { logger, motivo } from '@/lib/logger';
import bcrypt from 'bcryptjs';

const TAG_PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#ec4899', '#14b8a6'];
const salt = parseInt(process.env.SALT_ROUNDS, 10) || 10

function toDate(v?: string): Date {
  const d = v ? new Date(v) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

type Prisma = NonNullable<Awaited<ReturnType<typeof connectToPostgres>>>;

async function seedPostgres(db: Prisma) {
  await db.$transaction([
    db.automationAction.deleteMany(),
    db.automationRule.deleteMany(),
    db.campaign.deleteMany(),
    db.segmentTag.deleteMany(),
    db.segmentStage.deleteMany(),
    db.segmentChannel.deleteMany(),
    db.segment.deleteMany(),
    db.contactTag.deleteMany(),
    db.contactInteraction.deleteMany(),
    db.conversation.deleteMany(),
    db.contact.deleteMany(),
    db.tag.deleteMany(),
    db.quickReply.deleteMany(),
    db.presetImage.deleteMany(),
    db.apiKey.deleteMany(),
    db.webhookConfig.deleteMany(),
  ]);

  // Tags derivadas de contactos y segmentos
  const tagNames = Array.from(
    new Set(
      [
        ...INITIAL_CONTACTS.flatMap((c) => c.tags || []),
        ...INITIAL_SEGMENTS.flatMap((s) => s.tags || []),
      ]
        .map((t) => String(t).trim())
        .filter(Boolean)
    )
  );
  await db.tag.createMany({
    data: tagNames.map((name, i) => ({ name, color: TAG_PALETTE[i % TAG_PALETTE.length] })),
  });
  const tagRows = await db.tag.findMany();
  const tagIdByName = new Map(tagRows.map((t) => [t.name, t.id]));

  for (const c of INITIAL_CONTACTS) {
    await db.contact.create({
      data: {
        id: c.id,
        name: c.name,
        avatarUrl: c.avatar || '',
        handle: c.handle,
        phone: c.phone ?? null,
        email: c.email ?? null,
        channel: c.channel || 'whatsapp',
        sentiment: c.sentiment || 'neutral',
        leadScore: c.leadScore ?? 50,
        stage: c.stage || 'lead',
        dealValue: c.dealValue ?? 0,
        notes: c.notes || '',
        location: c.location ?? null,
        company: c.company ?? null,
        customFields: c.customFields ?? {},
        lastActive: c.lastActive || 'Ahora',
      },
    });
    if (c.interactions) {
      await db.contactInteraction.create({
        data: {
          contactId: c.id,
          firstReply: !!c.interactions.firstReply,
          appointmentConfirmed: !!c.interactions.appointmentConfirmed,
          proposalSent: !!c.interactions.proposalSent,
          dealClosed: !!c.interactions.dealClosed,
        },
      });
    }
    for (const name of c.tags || []) {
      const tagId = tagIdByName.get(String(name).trim());
      if (tagId) await db.contactTag.create({ data: { contactId: c.id, tagId } });
    }
  }

  for (const s of INITIAL_SEGMENTS) {
    await db.segment.create({
      data: {
        id: s.id,
        name: s.name,
        description: s.description || '',
        minScore: s.minScore ?? null,
        contactCount: s.contactCount ?? 0,
        createdAt: toDate(s.createdAt),
      },
    });
    for (const channel of s.channels || []) {
      await db.segmentChannel.create({ data: { segmentId: s.id, channel } });
    }
    for (const stage of s.stages || []) {
      await db.segmentStage.create({ data: { segmentId: s.id, stage } });
    }
    for (const name of s.tags || []) {
      const tagId = tagIdByName.get(String(name).trim());
      if (tagId) await db.segmentTag.create({ data: { segmentId: s.id, tagId } });
    }
  }

  for (const c of INITIAL_CAMPAIGN) {
    await db.campaign.create({
      data: {
        id: c.id,
        title: c.title,
        channel: c.channel || 'whatsapp',
        segmentId: c.segmentId,
        segmentName: c.segmentName || '',
        content: c.content || '',
        imageUrl: c.imageUrl ?? null,
        status: c.status || 'draft',
        sentCount: c.sentCount ?? 0,
        deliveredCount: c.deliveredCount ?? 0,
        openRate: c.openRate ?? 0,
        clickRate: c.clickRate ?? 0,
        conversions: c.conversions ?? 0,
        scheduledDate: c.scheduledDate ?? null,
        createdAt: toDate(c.createdAt),
      },
    });
  }

  for (const v of INITIAL_CONVERSATIONS) {
    await db.conversation.create({
      data: {
        id: v.id,
        contactId: v.contactId,
        channel: v.channel || 'whatsapp',
        unreadCount: v.unreadCount ?? 0,
        lastMessage: v.lastMessage || '',
        lastMessageTime: v.lastMessageTime || 'Ahora',
        status: v.status || 'open',
        assignedAgent: v.assignedAgent || 'Asesor Principal',
        summary: v.summary ?? null,
      },
    });
  }

  for (const u of INITIAL_USERS) {
    await db.user.create({
      data: {
        name: u.name,
        password: await bcrypt.hash(u.password, salt),
        email: u.email,
        role: u.role,
        avatarUrl: u.avatarUrl
      }
    })
  }

  for (const r of INITIAL_AUTOMATIONS) {
    await db.automationRule.create({
      data: {
        id: r.id,
        name: r.name,
        triggerEvent: r.triggerEvent,
        conditionChannel: r.conditionChannel ?? null,
        conditionKeyword: r.conditionKeyword ?? null,
        enabled: r.enabled ?? true,
        triggerCount: r.triggerCount ?? 0,
        lastTriggered: r.lastTriggered ?? null,
        actions: {
          create: (r.actions || []).map((a, i) => ({
            type: a.type,
            targetValue: a.targetValue,
            position: i,
          })),
        },
      },
    });
  }

  for (const q of INITIAL_QUICK_REPLIES) {
    await db.quickReply.create({
      data: {
        id: q.id,
        title: q.title,
        emoji: q.emoji || '',
        text: q.text || '',
        imageUrl: q.imageUrl ?? null,
        category: q.category || 'general',
      },
    });
  }

  for (const p of INITIAL_PRESET_IMAGES) {
    await db.presetImage.create({ data: { name: p.name, url: p.url, type: p.type || 'general' } });
  }

  const generatedKeys: { name: string; key: string }[] = [];
  for (const k of INITIAL_API_KEYS) {
    const g = generateApiKey();
    generatedKeys.push({ name: k.name, key: g.rawKey });
    await db.apiKey.create({
      data: {
        id: k.id,
        name: k.name,
        keyHash: g.keyHash,
        keyPrefix: g.keyPrefix,
        permissions: k.permissions || ['read'],
        lastUsed: k.lastUsed || 'Nunca',
        createdAt: toDate(k.createdAt),
      },
    });
  }

  if (INITIAL_WEBHOOK) {
    await db.webhookConfig.create({
      data: {
        id: 'default',
        url: INITIAL_WEBHOOK.url || '',
        secret: INITIAL_WEBHOOK.secret || '',
        events: INITIAL_WEBHOOK.events || [],
        active: INITIAL_WEBHOOK.active ?? true,
      },
    });
  }

  return { tags: tagNames.length, generatedKeys };
}

async function seedMongo() {
  const mongo = await connectToDatabase().catch(() => null);
  if (!mongo || !isDbConnected()) return { messages: 0, webhookLogs: 0, connected: false };

  await Promise.all([MessageModel.deleteMany({}), WebhookLogModel.deleteMany({})]);

  const flatMessages = Object.values(INITIAL_MESSAGES).flat();
  if (flatMessages.length) await MessageModel.insertMany(flatMessages);
  if (INITIAL_WEBHOOK_LOGS.length) await WebhookLogModel.insertMany(INITIAL_WEBHOOK_LOGS);

  return { messages: flatMessages.length, webhookLogs: INITIAL_WEBHOOK_LOGS.length, connected: true };
}

export async function POST(req: NextRequest) {
  // Esta ruta no usa la proteccion habitual por rol: se protege por entorno
  // (isSeedAllowed) mas una frase de confirmacion. Ver seedGuard.ts.

  // Defensa en profundidad: el middleware Edge ya bloquea esto segun entorno,
  // pero el handler no debe confiar solo en esa capa para una operacion que
  // borra y repuebla ambas bases de datos.
  if (!isSeedAllowed()) {
    return NextResponse.json(
      {
        success: false,
        error:
          'El endpoint de seed (destructivo) esta deshabilitado en produccion. Define ALLOW_DESTRUCTIVE_SEED=true para habilitarlo.',
      },
      { status: 403 }
    );
  }

  // En produccion (aun con el flag activo) exigimos una frase de confirmacion en
  // el body: evita ejecuciones accidentales o replays de una request antigua.
  if (seedRequiresConfirmation()) {
    let confirm: unknown;
    try {
      confirm = (await req.json())?.confirm;
    } catch {
      confirm = undefined;
    }
    if (confirm !== SEED_CONFIRM_PHRASE) {
      return NextResponse.json(
        {
          success: false,
          error: `Operacion destructiva: envia { "confirm": "${SEED_CONFIRM_PHRASE}" } en el body para confirmar.`,
        },
        { status: 400 }
      );
    }
  }

  try {
    const db = await connectToPostgres();
    if (!db) {
      return NextResponse.json(
        { success: false, message: 'No se pudo conectar a Postgres. Verifica DATABASE_URL.' },
        { status: 503 }
      );
    }

    const pg = await seedPostgres(db);
    const mongo = await seedMongo();

    return NextResponse.json({
      success: true,
      message: 'Bases de datos pobladas con los datos iniciales de XIO CRM',
      counts: {
        postgres: {
          contacts: INITIAL_CONTACTS.length,
          tags: pg.tags,
          segments: INITIAL_SEGMENTS.length,
          campaigns: INITIAL_CAMPAIGN.length,
          conversations: INITIAL_CONVERSATIONS.length,
          automations: INITIAL_AUTOMATIONS.length,
          quickReplies: INITIAL_QUICK_REPLIES.length,
          presetImages: INITIAL_PRESET_IMAGES.length,
          apiKeys: INITIAL_API_KEYS.length,
        },
        mongodb: mongo.connected
          ? { messages: mongo.messages, webhookLogs: mongo.webhookLogs }
          : 'no conectado (se omitio)',
      },
      // Las claves solo se muestran ahora: en BD queda unicamente su hash.
      generatedApiKeys: pg.generatedKeys,
    });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/seed', method: 'POST' });
    logger.error('Error in /api/seed', { motivo: motivo(error) });
    return NextResponse.json({ success: false, error: 'Error interno del servidor', errorId }, { status: 500 });
  }
}