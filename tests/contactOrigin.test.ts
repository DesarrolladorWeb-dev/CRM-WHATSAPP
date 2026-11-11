import { describe, expect, it } from 'vitest';
import {
  formatContactOrigin,
  originFromMessage,
  originMatchesChannelFilter,
} from '@/lib/contactOrigin';

describe('contact origin', () => {
  it('formats known platforms distinctly from the messaging channel', () => {
    expect(formatContactOrigin('facebook')).toBe('Facebook Messenger');
    expect(formatContactOrigin('whatsapp')).toBe('WhatsApp');
  });

  it('extracts platform metadata from a WhatsApp handoff message', () => {
    expect(originFromMessage('Hola, estoy interesado.\nPlataforma: Facebook')).toBe('facebook');
    expect(originFromMessage('Hola, Plataforma: facebook')).toBe('facebook');
    expect(originFromMessage('Hola, ¿precio?')).toBeUndefined();
  });

  it('matches Facebook-origin WhatsApp chats in the Messenger filter', () => {
    expect(originMatchesChannelFilter('messenger', 'facebook')).toBe(true);
    expect(originMatchesChannelFilter('messenger', 'facebook_comment')).toBe(true);
    expect(originMatchesChannelFilter('messenger', 'instagram')).toBe(false);
    expect(originMatchesChannelFilter('whatsapp', 'facebook')).toBe(false);
  });

  it('matches Instagram-origin WhatsApp chats in the Instagram filter', () => {
    expect(originMatchesChannelFilter('instagram', 'instagram')).toBe(true);
    expect(originMatchesChannelFilter('instagram', 'INSTAGRAM')).toBe(true);
    expect(originMatchesChannelFilter('instagram', 'facebook')).toBe(false);
  });

  it('matches only WhatsApp-origin contacts in the WhatsApp filter', () => {
    expect(originMatchesChannelFilter('whatsapp', 'whatsapp')).toBe(true);
    expect(originMatchesChannelFilter('whatsapp', 'facebook')).toBe(false);
    expect(originMatchesChannelFilter('whatsapp', null)).toBe(false);
  });

  it('uses the existing contact channel as origin for legacy contacts without origin', () => {
    expect(originMatchesChannelFilter('whatsapp', 'whatsapp')).toBe(true);
    expect(originMatchesChannelFilter('instagram', 'instagram')).toBe(true);
    expect(originMatchesChannelFilter('messenger', 'messenger')).toBe(true);
  });
});
