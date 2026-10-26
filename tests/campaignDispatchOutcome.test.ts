import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Como termina una campana cuando el envio sale mal.
 *
 * Una campana en la que no salio NI UN mensaje aparecia como «Completada»,
 * en verde, con un «Enviados: 0» en letra pequena que nadie mira. Nadie se
 * enteraba de que no habia llegado a nadie hasta que un cliente preguntaba
 * por que no recibio la promo. Estas pruebas fijan que un fracaso total se
 * llama fracaso y explica su causa.
 */
const takePending = vi.fn();
const markSent = vi.fn();
const markNotSent = vi.fn();
const hasPending = vi.fn();
const syncCampaignCounters = vi.fn();

vi.mock('@/lib/repositories/campaignRecipientRepo', () => ({
  materializeRecipients: vi.fn(),
  takePending: (...a: unknown[]) => takePending(...a),
  markSent: (...a: unknown[]) => markSent(...a),
  markNotSent: (...a: unknown[]) => markNotSent(...a),
  syncCampaignCounters: (...a: unknown[]) => syncCampaignCounters(...a),
  hasPending: (...a: unknown[]) => hasPending(...a),
}));

const { dispatchCampaign } = await import('@/lib/services/campaignService');

/** Base de datos de mentira: registra el estado final de la campana. */
function fakeDb(errorMasFrecuente: string | null, cuantos = 3) {
  const updates: Array<Record<string, unknown>> = [];
  return {
    updates,
    campaign: {
      findUnique: vi.fn(async () => ({
        id: 'c1', status: 'running', channel: 'whatsapp', content: 'Hola', imageUrl: null,
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return {};
      }),
    },
    campaignRecipient: {
      groupBy: vi.fn(async () =>
        errorMasFrecuente ? [{ error: errorMasFrecuente, _count: { _all: cuantos } }] : []
      ),
    },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  takePending.mockResolvedValue([]); // sin pendientes que procesar en esta vuelta
  hasPending.mockResolvedValue(false); // la campana termina aqui
});

describe('estado final de una campana', () => {
  it('si no se envio NADA, la campana queda «failed», no «completed»', async () => {
    syncCampaignCounters.mockResolvedValue({ total: 3, sent: 0, failed: 3, skipped: 0 });
    const db = fakeDb('fetch failed');

    await dispatchCampaign(db, 'c1');

    const final = (db as never as { updates: Array<Record<string, string>> }).updates[0];
    expect(final.status).toBe('failed');
  });

  it('el motivo real del proveedor llega hasta la interfaz', async () => {
    // Sin esto habia que entrar a la base de datos o a los logs del servidor
    // para saber por que no habia salido nada.
    syncCampaignCounters.mockResolvedValue({ total: 3, sent: 0, failed: 3, skipped: 0 });
    const db = fakeDb('fetch failed');

    await dispatchCampaign(db, 'c1');

    const final = (db as never as { updates: Array<Record<string, string>> }).updates[0];
    expect(final.failureReason).toContain('No se envió ningún mensaje');
    expect(final.failureReason).toContain('fetch failed');
  });

  it('si salio aunque sea UN mensaje, la campana esta completada', async () => {
    // Un fallo parcial no es un fracaso: hubo gente que si recibio el mensaje.
    syncCampaignCounters.mockResolvedValue({ total: 3, sent: 1, failed: 2, skipped: 0 });
    const db = fakeDb('numero invalido');

    await dispatchCampaign(db, 'c1');

    const final = (db as never as { updates: Array<Record<string, string>> }).updates[0];
    expect(final.status).toBe('completed');
    expect(final.failureReason).toBeNull();
  });

  it('una campana sin destinatarios no se marca fallida', async () => {
    syncCampaignCounters.mockResolvedValue({ total: 0, sent: 0, failed: 0, skipped: 0 });
    const db = fakeDb(null);

    await dispatchCampaign(db, 'c1');

    const final = (db as never as { updates: Array<Record<string, string>> }).updates[0];
    expect(final.status).toBe('completed');
  });
});
