/**
 * Datos de ejemplo (fallback en memoria + estado inicial de la UI).
 *
 * FUENTE UNICA: src/seedData.json. Este archivo solo re-exporta ese JSON con los
 * tipos de la app. No edites los datos aqui; edita src/seedData.json (lo consumen
 * tambien scripts/seed-hybrid.ts y scripts/migrate.mjs).
 */
import seed from './seedData.json';
import type {
  Contact,
  Conversation,
  Message,
  Segment,
  Campaign,
  AutomationRule,
  ApiKey,
  WebhookConfig,
  WebhookLog,
  AnalyticsData,
  QuickReply,
  PresetImage,
  User
} from './types';

export const INITIAL_CONTACTS = seed.INITIAL_CONTACTS as unknown as Contact[];
export const INITIAL_MESSAGES = seed.INITIAL_MESSAGES as unknown as Record<string, Message[]>;
export const INITIAL_CONVERSATIONS = seed.INITIAL_CONVERSATIONS as unknown as Conversation[];
export const INITIAL_SEGMENTS = seed.INITIAL_SEGMENTS as unknown as Segment[];
export const INITIAL_CAMPAIGN = seed.INITIAL_CAMPAIGN as unknown as Campaign[];
export const INITIAL_AUTOMATIONS = seed.INITIAL_AUTOMATIONS as unknown as AutomationRule[];
export const INITIAL_API_KEYS = seed.INITIAL_API_KEYS as unknown as ApiKey[];
export const INITIAL_WEBHOOK = seed.INITIAL_WEBHOOK as unknown as WebhookConfig;
export const INITIAL_WEBHOOK_LOGS = seed.INITIAL_WEBHOOK_LOGS as unknown as WebhookLog[];
export const INITIAL_ANALYTICS = seed.INITIAL_ANALYTICS as unknown as AnalyticsData;
export const INITIAL_QUICK_REPLIES = seed.INITIAL_QUICK_REPLIES as unknown as QuickReply[];
export const INITIAL_PRESET_IMAGES = seed.INITIAL_PRESET_IMAGES as unknown as PresetImage[];
// Los usuarios semilla llevan la contrasena en texto plano: el seed la hashea
// antes de insertarla. No son un User de la API, que nunca expone ese campo.
export type SeedUser = Omit<User, 'created_at' | 'updated_at' | 'id'> & { password: string };
export const INITIAL_USERS = seed.INITIAL_USERS as unknown as SeedUser[];

