import React from 'react';
import { Globe, Instagram } from 'lucide-react';
import { MessengerIcon, XBrandIcon } from './ChannelIcons';
import { formatContactOrigin } from '@/lib/contactOrigin';

interface ContactOriginBadgeProps {
  origin?: string | null;
}

export const ContactOriginBadge: React.FC<ContactOriginBadgeProps> = ({ origin }) => {
  const label = formatContactOrigin(origin);
  if (!label || !origin) return null;

  const normalizedOrigin = origin.trim().toLowerCase();
  const iconClassName = 'h-3 w-3 shrink-0';
  const badgeClassName = normalizedOrigin === 'instagram'
    ? 'border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900 dark:bg-pink-950/40 dark:text-pink-300'
    : ['facebook', 'facebook_comment', 'messenger'].includes(normalizedOrigin)
      ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300'
      : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
  const icon = ['facebook', 'facebook_comment', 'messenger'].includes(normalizedOrigin)
    ? <MessengerIcon className={iconClassName} />
    : normalizedOrigin === 'instagram'
      ? <Instagram className={iconClassName} />
      : normalizedOrigin === 'twitter'
        ? <XBrandIcon className={iconClassName} />
        : <Globe className={iconClassName} />;

  return (
    <span
      title={`Origen: ${label}`}
      aria-label={`Origen: ${label}`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold leading-none ${badgeClassName}`}
    >
      {icon}
      <span>Origen</span>
    </span>
  );
};
