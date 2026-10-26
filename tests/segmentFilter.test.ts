import { describe, it, expect } from 'vitest';
import { construirFiltro } from '@/lib/services/audienceService';

/**
 * `construirFiltro` es la regla que decide que contactos caen dentro de un
 * segmento. De ella sale el `contactCount` que se pinta en las tarjetas y en
 * el selector de campañas, asi que cualquier desajuste se ve en la UI.
 */
describe('construirFiltro — criterios del segmento', () => {
  it('un segmento sin criterios no filtra nada', () => {
    const where = construirFiltro({ minScore: null, channels: [], stages: [], segmentTags: [] });
    expect(where).toEqual({});
  });

  it('acumula minScore, channels, stages y tags con AND', () => {
    const where = construirFiltro({
      minScore: 70,
      channels: [{ channel: 'whatsapp' }],
      stages: [{ stage: 'lead' }],
      segmentTags: [{ tagId: 't1' }],
    });
    expect(where.leadScore).toEqual({ gte: 70 });
    expect(where.channel).toEqual({ in: ['whatsapp'] });
    expect(where.stage).toEqual({ in: ['lead'] });
    expect(where.contactTags).toEqual({ some: { tagId: { in: ['t1'] } } });
  });

  it('NO excluye a los contactos con optedOut (a diferencia del preview de campaña)', () => {
    const where = construirFiltro({
      minScore: null,
      channels: [{ channel: 'whatsapp' }],
      stages: [],
      segmentTags: [],
    });
    // Documenta la diferencia con resolveAudience, que si filtra optedOut.
    expect(where.optedOut).toBeUndefined();
  });
});