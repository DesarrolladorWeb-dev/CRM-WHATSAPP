const ORIGIN_LABELS: Record<string, string> = {
  facebook: 'Facebook Messenger',
  facebook_comment: 'Facebook (comentario)',
  instagram: 'Instagram',
  threads: 'Threads',
  website: 'Sitio web',
  whatsapp: 'WhatsApp',
};

const CHANNEL_ORIGINS: Partial<Record<string, string[]>> = {
  whatsapp: ['whatsapp'],
  instagram: ['instagram'],
  twitter: ['twitter', 'threads'],
  messenger: ['facebook', 'facebook_comment', 'messenger'],
  email: ['email'],
};

export function formatContactOrigin(origin?: string | null): string | null {
  const value = origin?.trim();
  if (!value) return null;

  return ORIGIN_LABELS[value.toLowerCase()] ?? value;
}

export function originMatchesChannelFilter(channel: string, origin?: string | null): boolean {
  const normalizedOrigin = origin?.trim().toLowerCase();
  return Boolean(normalizedOrigin && CHANNEL_ORIGINS[channel]?.includes(normalizedOrigin));
}

export function originFromMessage(message: string): string | undefined {
  const match = message.match(/Plataforma\s*:\s*([^\r\n]+)/i);
  const origin = match?.[1]?.trim().toLowerCase();
  return origin ? origin.slice(0, 120) : undefined;
}
