import { InteractiveContent } from "./lib/whatsappInteractive";

export type SocialChannel = 'whatsapp' | 'instagram' | 'twitter' | 'messenger' | 'email';

export type LeadSentiment = 'positive' | 'neutral' | 'urgent' | 'churn_risk';

export type PipelineStage = 'lead' | 'qualified' | 'negotiation' | 'closed_won' | 'closed_lost';

export const ROLES = ['Administrador', 'Empleado'] as const

export type Role = typeof ROLES[number]

export interface ContactInteractions {
  firstReply?: boolean; // 1era Interacción: Respuesta positiva -> Pasa a Cualificados (Rojo)
  appointmentConfirmed?: boolean; // 2da Interacción: Confirmación de Cita -> Pasa a Negociación (Amarillo)
  proposalSent?: boolean; // 3ra Interacción: Propuesta/Cotización
  dealClosed?: boolean; // 4ta Interacción: Cierre/Pago
}

export interface PresetImage {
  id: string;
  name: string;
  url: string;
  type?: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface QuickReply {
  id: string;
  title: string;
  emoji?: string;
  text: string;
  imageUrl?: string;
  category?: 'saludo' | 'ventas' | 'precios' | 'soporte' | 'general';
}

export interface Contact {
  id: string;
  name: string;
  avatar: string;
  handle: string;
  phone?: string;
  email?: string;
  channel: SocialChannel;
  tags: string[];
  sentiment: LeadSentiment;
  leadScore: number; // 0 to 100
  stage: PipelineStage;
  dealValue: number;
  notes: string;
  lastActive: string;
  location?: string;
  company?: string;
  customFields?: Record<string, string>;
  interactions?: ContactInteractions;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: 'contact' | 'agent' | 'bot';
  senderName?: string;
  text: string;
  timestamp: string;
  channel: SocialChannel;
  // 'failed' cubre el caso de que el mensaje se guarde pero no llegue a salir
  // al canal (sin credenciales o error del proveedor), para no dar por
  // enviado algo que el destinatario nunca recibio.
  status: 'sent' | 'delivered' | 'read' | 'failed';
  mediaUrl?: string;
  hasMedia?: boolean;
  mediaType?: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  media?: {
    mimetype: string;
    data: string;
    size?: number;
    filename?: string | null;
    width?: number;
    height?: number;
  };
  aiGenerated?: boolean;
  interactive?: InteractiveContent;
}

export interface Conversation {
  id: string;
  contactId: string;
  contact: Contact;
  channel: SocialChannel;
  unreadCount: number;
  lastMessage: string;
  lastMessageTime: string;
  status: 'open' | 'pending' | 'resolved';
  assignedAgent: string;
  summary?: string;
}

export interface Segment {
  id: string;
  name: string;
  description: string;
  channels: SocialChannel[];
  minScore?: number;
  tags?: string[];
  stages?: PipelineStage[];
  contactCount: number;
  createdAt: string;
}

// Ciclo de vida de una campana. Las transiciones validas entre estos estados
// las impone src/lib/services/campaignStatus.ts, no el front.
export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

// Estado de un destinatario dentro de una campana.
// 'skipped' = nunca se intento (sin direccion en ese canal, canal sin conectar).
export type RecipientStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped';

export interface Campaign {
  id: string;
  title: string;
  channel: SocialChannel;
  segmentId: string;
  segmentName: string;
  content: string;
  imageUrl?: string;
  status: CampaignStatus;
  sentCount: number;
  deliveredCount: number;
  openRate: number; // percentage
  clickRate: number; // percentage
  conversions: number;
  /** Texto libre heredado y decorativo. No dispara nada. Ver `scheduledAt`. */
  scheduledDate?: string;
  /**
   * Momento programado de lanzamiento, siempre en ISO UTC al salir de la API.
   * Es el que mira el worker. Al ENTRAR se acepta ademas una hora de pared
   * ("2026-09-25T14:30"), que el servidor interpreta en la zona del negocio.
   */
  scheduledAt?: string;
  launchedAt?: string;
  completedAt?: string;
  failureReason?: string;
  createdAt: string;
}

/** Un contacto excluido de la audiencia, con el motivo exacto. */
export interface AudienceExclusion {
  contactId: string;
  name: string;
  reason: 'sin_direccion' | 'baja_difusion' | 'otro_canal';
}

/** Lo que devuelve la previsualizacion antes de confirmar un envio. */
export interface CampaignPreview {
  campaignId: string;
  channel: SocialChannel;
  channelLabel: string;
  channelConnected: boolean;
  segmentId: string;
  segmentName: string;
  /** Contactos que SI recibiran el mensaje. */
  recipientCount: number;
  /** Excluidos agrupados por motivo. */
  excluded: { sinDireccion: number; bajaDifusion: number; otroCanal: number };
  /** Ejemplo real del mensaje ya personalizado, para revisarlo antes de enviar. */
  sampleName?: string;
  sampleMessage?: string;
  /** Avisos que deben verse en el dialogo de confirmacion. */
  warnings: string[];
}

export interface AutomationRule {
  id: string;
  name: string;
  triggerEvent: 'message_received' | 'lead_created' | 'tag_added' | 'stage_changed';
  conditionChannel?: SocialChannel;
  conditionKeyword?: string;
  actions: {
    type: 'send_ai_reply' | 'add_tag' | 'change_stage' | 'call_webhook' | 'assign_agent';
    targetValue: string;
  }[];
  enabled: boolean;
  triggerCount: number;
  lastTriggered?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  // La clave en texto plano solo existe en el momento de crearla; despues la UI
  // trabaja con `keyPreview`. En BD (Postgres) solo se guarda keyHash + keyPrefix.
  key?: string;
  keyPreview?: string;
  keyPrefix?: string;
  keyHash?: string;
  createdAt: string;
  lastUsed: string;
  permissions: string[];
}

export interface WebhookConfig {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
}

export interface WebhookLog {
  id: string;
  timestamp: string;
  event: string;
  statusCode: number;
  payload: Record<string, unknown>;
  durationMs: number;
}

export interface AnalyticsData {
  totalConversations: number;
  avgResponseTimeMin: number;
  leadConversionRate: number;
  campaignRoi: number;
  channelBreakdown: { channel: SocialChannel; count: number; color: string }[];
  monthlyConversions: { month: string; leads: number; closed: number }[];
  sentimentBreakdown: { sentiment: string; count: number; color: string }[];
}

export interface User {
    id: number,
    name: string,
    email: string,
    // La contrasena (su hash) nunca sale de la base: el repositorio la
    // omite al construir la respuesta y ningun consumidor la necesita.
    role: Role,
    avatarUrl: string,
    created_at: string,
    updated_at: string
    // sessions: Sessions[]
}