/**
 * Seed del hibrido Whato CRM: reparte src/seedData.json entre Postgres (nucleo
 * relacional, via Prisma) y MongoDB (mensajes y bitacora de webhooks, via driver
 * nativo). Reemplaza a scripts/migrate.mjs para el modelo de dos bases.
 *
 * Uso:  npm run db:seed
 * Es .ts y corre con tsx porque el cliente de Prisma 7 se genera en TypeScript
 * con imports sin extension, que Node por si solo no puede resolver.
 * Requiere DATABASE_URL (Postgres) y, opcionalmente, MONGODB_URI en .env / .env.local
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHmac, randomBytes } from 'crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const salt = parseInt(process.env.SALT_ROUNDS, 10) || 10


// ---- Carga de variables de entorno (.env.local tiene prioridad) --------------
function loadEnv() {
  for (const file of ['.env', '.env.local']) {
    const p = path.join(rootDir, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?([^"'\r\n]*)["']?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}
loadEnv();

const seed = JSON.parse(fs.readFileSync(path.join(rootDir, 'src', 'seedData.json'), 'utf-8'));

// ---- API Keys: mismo esquema que src/lib/apiKeySecurity.ts ------------------
function hashApiKey(rawKey) {
  const secret = process.env.API_KEY_HASH_SECRET || process.env.API_MASTER_KEY || 'dev-only-insecure-api-key-pepper';
  return createHmac('sha256', secret).update(rawKey).digest('hex');
}
function generateApiKey() {
  const rawKey = 'scrm_live_' + randomBytes(24).toString('hex');
  return { rawKey, keyHash: hashApiKey(rawKey), keyPrefix: rawKey.slice(0, 14) };
}

const TAG_PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#ec4899', '#14b8a6'];
function toDate(v) {
  const d = v ? new Date(v) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

async function seedPostgres() {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL no definido: se omite el seed de Postgres.');
    return;
  }
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  const prisma = new PrismaClient({adapter});
  try {
    console.log('Postgres: limpiando tablas...');
    // Orden hijo -> padre (aunque hay onDelete: Cascade, se limpia explicito).
    await prisma.$transaction([
      prisma.automationAction.deleteMany(),
      prisma.automationRule.deleteMany(),
      prisma.campaign.deleteMany(),
      prisma.segmentTag.deleteMany(),
      prisma.segmentStage.deleteMany(),
      prisma.segmentChannel.deleteMany(),
      prisma.segment.deleteMany(),
      prisma.contactTag.deleteMany(),
      prisma.contactInteraction.deleteMany(),
      prisma.conversation.deleteMany(),
      prisma.contact.deleteMany(),
      prisma.tag.deleteMany(),
      prisma.quickReply.deleteMany(),
      prisma.presetImage.deleteMany(),
      prisma.apiKey.deleteMany(),
      prisma.webhookConfig.deleteMany(),
    ]);

    const contacts = seed.INITIAL_CONTACTS || [];
    const segments = seed.INITIAL_SEGMENTS || [];
    const campaigns = seed.INITIAL_CAMPAIGN || [];
    const conversations = seed.INITIAL_CONVERSATIONS || [];
    const automations = seed.INITIAL_AUTOMATIONS || [];
    const quickReplies = seed.INITIAL_QUICK_REPLIES || [];
    const presetImages = seed.INITIAL_PRESET_IMAGES || [];
    const apiKeys = seed.INITIAL_API_KEYS || [];
    const webhook = seed.INITIAL_WEBHOOK;
    const users = seed.INITIAL_USERS || [];

    // --- Tags (derivadas de contactos y segmentos) ---
    const tagNames = Array.from(
      new Set([
        ...contacts.flatMap((c) => c.tags || []),
        ...segments.flatMap((s) => s.tags || []),
      ].map((t) => String(t).trim()).filter(Boolean))
    );
    await prisma.tag.createMany({
      data: tagNames.map((name, i) => ({ name, color: TAG_PALETTE[i % TAG_PALETTE.length] })),
    });
    const tagRows = await prisma.tag.findMany();
    const tagIdByName = new Map(tagRows.map((t) => [t.name, t.id]));

    // --- Contacts + interactions + contact_tags ---
    for (const c of contacts) {
      await prisma.contact.create({
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
        await prisma.contactInteraction.create({
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
        if (tagId) await prisma.contactTag.create({ data: { contactId: c.id, tagId } });
      }
    }

    // Los usuarios NO se borran al principio del seed (a diferencia del resto
    // de tablas), asi que un `create` fallaba con P2002 al re-sembrar: el email
    // es unico. Y como esto ocurre ANTES de crear los segmentos, el seed se
    // abortaba a medias y dejaba la base sin segmentos, que es justo lo que
    // rompe el guardado de campanas. Con `upsert` el seed es idempotente y
    // conserva la cuenta con la que ya has iniciado sesion.
    for (const u of users) {
      const password = await bcrypt.hash(u.password, salt)
      await prisma.user.upsert({
        where: { email: u.email },
        update: {
          name: u.name,
          role: u.role,
          avatarUrl: u.avatarUrl
        },
        create: {
          name: u.name,
          password,
          email: u.email,
          role: u.role,
          avatarUrl: u.avatarUrl
        }
      })
    }

    // --- Segments + join tables ---
    for (const s of segments) {
      await prisma.segment.create({
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
        await prisma.segmentChannel.create({ data: { segmentId: s.id, channel } });
      }
      for (const stage of s.stages || []) {
        await prisma.segmentStage.create({ data: { segmentId: s.id, stage } });
      }
      for (const name of s.tags || []) {
        const tagId = tagIdByName.get(String(name).trim());
        if (tagId) await prisma.segmentTag.create({ data: { segmentId: s.id, tagId } });
      }
    }

    // --- Campaigns ---
    for (const c of campaigns) {
      await prisma.campaign.create({
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

    // --- Conversations (se descarta el objeto contact embebido del seed) ---
    for (const v of conversations) {
      await prisma.conversation.create({
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

    // --- Automation rules + actions ---
    for (const r of automations) {
      await prisma.automationRule.create({
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

    // --- Quick replies ---
    for (const q of quickReplies) {
      await prisma.quickReply.create({
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

    // --- Preset images ---
    for (const p of presetImages) {
      await prisma.presetImage.create({
        data: { name: p.name, url: p.url, type: p.type || 'general' },
      });
    }

    // --- API Keys (se genera una clave real por entrada; solo se guarda el hash) ---
    const clavesGeneradas = [];
    for (const k of apiKeys) {
      const g = generateApiKey();
      clavesGeneradas.push({ name: k.name, key: g.rawKey });
      await prisma.apiKey.create({
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

    // --- Webhook config (fila unica 'default') ---
    if (webhook) {
      await prisma.webhookConfig.create({
        data: {
          id: 'default',
          url: webhook.url || '',
          secret: webhook.secret || '',
          events: webhook.events || [],
          active: webhook.active ?? true,
        },
      });
    }

    console.log('Postgres: seed completado');
    console.log(`   contacts=${contacts.length} tags=${tagNames.length} segments=${segments.length} campaigns=${campaigns.length} conversations=${conversations.length} automations=${automations.length} quickReplies=${quickReplies.length} presetImages=${presetImages.length} apiKeys=${apiKeys.length} users=${users.length}`);
    if (clavesGeneradas.length) {
      console.log('\n   API Keys de ejemplo (solo se muestran ahora, guardalas):');
      for (const c of clavesGeneradas) console.log(`     - ${c.name}: ${c.key}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function seedMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('MONGODB_URI no definido: se omite el seed de MongoDB.');
    return;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection.db;
    console.log('MongoDB: limpiando colecciones messages y webhooklogs...');
    await Promise.allSettled([
      db.collection('messages').deleteMany({}),
      db.collection('webhooklogs').deleteMany({}),
    ]);

    const messages = Object.values(seed.INITIAL_MESSAGES || {}).flat();
    if (messages.length) await db.collection('messages').insertMany(JSON.parse(JSON.stringify(messages)));

    const logs = seed.INITIAL_WEBHOOK_LOGS || [];
    if (logs.length) await db.collection('webhooklogs').insertMany(JSON.parse(JSON.stringify(logs)));

    console.log(`MongoDB: seed completado (messages=${messages.length} webhookLogs=${logs.length})`);
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  await seedPostgres();
  await seedMongo();
  console.log('\nSeed hibrido finalizado.');
}

main().catch((err) => {
  console.error('Error en el seed hibrido:', err);
  process.exit(1);
});
