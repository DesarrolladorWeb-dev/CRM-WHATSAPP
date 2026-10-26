import { describe, it, expect } from 'vitest';
import { horaDeParedAUtc, formatWallClock, parseScheduledAt } from '@/lib/time';
import { campaignCreateSchema } from '@/lib/schemas';

describe('conversion de hora de pared', () => {
  it('interpreta 14:30 como hora de Lima, no del proceso', () => {
    // Lima es UTC-5 todo el ano: 14:30 en Lima = 19:30 UTC.
    expect(horaDeParedAUtc('2026-09-25T14:30').toISOString()).toBe('2026-09-25T19:30:00.000Z');
  });
  it('ida y vuelta', () => {
    expect(formatWallClock(new Date('2026-09-25T19:30:00Z'))).toBe('2026-09-25T14:30');
  });
  it('medianoche no se desplaza un dia', () => {
    expect(horaDeParedAUtc('2026-09-25T00:00').toISOString()).toBe('2026-09-25T05:00:00.000Z');
  });
  it('rechaza fechas que no existen', () => {
    expect(horaDeParedAUtc('2026-02-31T10:00')).toBeNull();
    expect(horaDeParedAUtc('mañana por la tarde')).toBeNull();
  });
  it('respeta un instante con zona explicita', () => {
    expect(parseScheduledAt('2026-09-25T19:30:00Z').toISOString()).toBe('2026-09-25T19:30:00.000Z');
    expect(parseScheduledAt('2026-09-25T14:30:00-05:00').toISOString()).toBe('2026-09-25T19:30:00.000Z');
  });
  it('rechaza un ISO sin zona y con segundos ambiguos', () => {
    expect(parseScheduledAt('2026-09-25T14:30:00.000')).toBeNull();
  });
  it('zona con horario de verano: usa el desfase correcto de cada fecha', () => {
    // Madrid: UTC+1 en invierno, UTC+2 en verano.
    expect(horaDeParedAUtc('2026-01-15T12:00', 'Europe/Madrid').toISOString()).toBe('2026-01-15T11:00:00.000Z');
    expect(horaDeParedAUtc('2026-07-15T12:00', 'Europe/Madrid').toISOString()).toBe('2026-07-15T10:00:00.000Z');
  });
});

describe('validacion de la campana programada', () => {
  const base = { title: 'Promo', segmentId: 'seg_1' };

  it('acepta una hora de pared', () => {
    const r = campaignCreateSchema.safeParse({
      ...base,
      status: 'scheduled',
      scheduledAt: '2026-12-25T14:30',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza una campana programada SIN fecha: nunca se lanzaria', () => {
    const r = campaignCreateSchema.safeParse({ ...base, status: 'scheduled' });
    expect(r.success).toBe(false);
  });

  it('rechaza texto libre como fecha (lo que se usaba antes)', () => {
    const r = campaignCreateSchema.safeParse({
      ...base,
      status: 'scheduled',
      scheduledAt: 'mañana por la tarde',
    });
    expect(r.success).toBe(false);
  });

  it('un borrador sin fecha sigue siendo valido', () => {
    expect(campaignCreateSchema.safeParse({ ...base, status: 'draft' }).success).toBe(true);
  });

  it('null desprograma y es un valor aceptado', () => {
    const r = campaignCreateSchema.safeParse({ ...base, status: 'draft', scheduledAt: null });
    expect(r.success).toBe(true);
  });
});
