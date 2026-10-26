import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El worker que hace que una campana programada SALGA SOLA.
 *
 * Antes de que existiera, `launchCampaign` solo se invocaba desde la ruta de
 * envio manual: una campana en `scheduled` esperaba para siempre un clic que
 * nadie iba a dar. Estas pruebas fijan las decisiones del worker, que son las
 * que deciden a quien se le escribe y cuando.
 *
 * `campaignService` se sustituye por dobles a proposito: aqui no se prueba el
 * envio (eso ya tiene sus pruebas), sino QUE decide el worker y CUANDO. Sin
 * los dobles haria falta una base de datos viva y las pruebas dejarian de
 * correr en CI.
 */
const launchCampaign = vi.fn();
const dispatchCampaign = vi.fn();

vi.mock('@/lib/services/campaignService', () => ({
  launchCampaign: (...args: unknown[]) => launchCampaign(...args),
  dispatchCampaign: (...args: unknown[]) => dispatchCampaign(...args),
}));

const { ejecutarTick, despacharConCerrojo } = await import('@/lib/services/campaignScheduler');

const HORA = 60 * 60 * 1000;

/** Base de datos de mentira: solo lo que el worker llega a tocar. */
function fakeDb(opciones: { programadas?: unknown[]; atascadas?: unknown[] } = {}) {
  const actualizaciones: Array<{ id: string; data: Record<string, unknown> }> = [];

  const db = {
    actualizaciones,
    campaign: {
      findMany: vi.fn(async ({ where }: { where: Record<string, string> }) =>
        where.status === 'scheduled' ? (opciones.programadas ?? []) : (opciones.atascadas ?? [])
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        actualizaciones.push({ id: where.id, data });
        return { id: where.id };
      }),
    },
  };

  return db as never;
}

/** Una campana programada para hace `hace` milisegundos. */
function vencidaHace(hace: number, id = 'camp_1') {
  return { id, title: 'Promo', scheduledAt: new Date(Date.now() - hace) };
}

beforeEach(() => {
  launchCampaign.mockReset();
  dispatchCampaign.mockReset();
  launchCampaign.mockResolvedValue({ ok: true, recipientCount: 10 });
  dispatchCampaign.mockResolvedValue({ enviados: 10, fallidos: 0, omitidos: 0 });
});

describe('lanzar las campanas vencidas', () => {
  it('lanza una campana cuya hora ya paso', async () => {
    const db = fakeDb({ programadas: [vencidaHace(5 * 60 * 1000)] });

    const r = await ejecutarTick(db);

    expect(r.lanzadas).toBe(1);
    expect(launchCampaign).toHaveBeenCalledWith(db, 'camp_1');
    // Lanzar no basta: si no se despacha, la campana se queda en `running`
    // con todos los destinatarios en `pending` y nadie recibe nada.
    expect(dispatchCampaign).toHaveBeenCalledWith(db, 'camp_1');
  });

  it('NO envia una campana con mas de 24 h de retraso: la marca fallida', async () => {
    // El caso real: el servidor estuvo caido el fin de semana. Mandar el
    // viernes la promo el lunes por la noche es spam, no una campana.
    const db = fakeDb({ programadas: [vencidaHace(30 * HORA)] });

    const r = await ejecutarTick(db);

    expect(r.caducadas).toBe(1);
    expect(r.lanzadas).toBe(0);
    expect(launchCampaign).not.toHaveBeenCalled();

    const cambio = (db as never as { actualizaciones: Array<{ data: Record<string, string> }> })
      .actualizaciones[0];
    expect(cambio.data.status).toBe('failed');
    // El motivo tiene que quedar a la vista: una campana que no salio sin
    // explicacion obliga a abrir los logs del servidor para entender nada.
    expect(cambio.data.failureReason).toContain('No se envio a su hora');
  });

  it('justo por debajo del limite todavia se envia', async () => {
    const db = fakeDb({ programadas: [vencidaHace(23 * HORA)] });

    const r = await ejecutarTick(db);

    expect(r.lanzadas).toBe(1);
    expect(r.caducadas).toBe(0);
  });

  it('una campana que no se puede lanzar se marca fallida, no se reintenta para siempre', async () => {
    // Sin esto el worker la reintentaria cada minuto indefinidamente,
    // llenando el log, y el usuario no se enteraria nunca de que algo falla.
    launchCampaign.mockResolvedValue({
      ok: false,
      code: 'EMPTY_AUDIENCE',
      message: 'Ningun contacto del segmento es alcanzable.',
    });
    const db = fakeDb({ programadas: [vencidaHace(60 * 1000)] });

    const r = await ejecutarTick(db);

    expect(r.errores).toBe(1);
    expect(r.lanzadas).toBe(0);
    expect(dispatchCampaign).not.toHaveBeenCalled();

    const cambio = (db as never as { actualizaciones: Array<{ data: Record<string, string> }> })
      .actualizaciones[0];
    expect(cambio.data.status).toBe('failed');
    expect(cambio.data.failureReason).toContain('alcanzable');
  });

  it('un fallo en una campana no impide que salgan las demas', async () => {
    launchCampaign
      .mockRejectedValueOnce(new Error('la base se cayo'))
      .mockResolvedValue({ ok: true, recipientCount: 5 });

    const db = fakeDb({
      programadas: [vencidaHace(60 * 1000, 'camp_rota'), vencidaHace(60 * 1000, 'camp_sana')],
    });

    const r = await ejecutarTick(db);

    expect(r.errores).toBe(1);
    expect(r.lanzadas).toBe(1);
    expect(dispatchCampaign).toHaveBeenCalledWith(db, 'camp_sana');
  });
});

describe('retomar las campanas atascadas', () => {
  it('retoma una campana running con destinatarios pendientes', async () => {
    // Es el agujero del envio manual: `dispatchCampaign` corta a los 500 por
    // invocacion, asi que una campana de 1.200 dejaba 700 personas en
    // `pending` sin que nadie las recogiera nunca.
    const db = fakeDb({ atascadas: [{ id: 'camp_a_medias' }] });

    const r = await ejecutarTick(db);

    expect(r.retomadas).toBe(1);
    expect(dispatchCampaign).toHaveBeenCalledWith(db, 'camp_a_medias');
  });

  it('un tick sin trabajo no toca nada', async () => {
    const db = fakeDb();

    const r = await ejecutarTick(db);

    expect(r).toMatchObject({ lanzadas: 0, retomadas: 0, caducadas: 0, errores: 0 });
    expect(dispatchCampaign).not.toHaveBeenCalled();
  });
});

describe('cerrojo contra el doble despacho', () => {
  it('dos despachos simultaneos de la misma campana solo ejecutan uno', async () => {
    // LA prueba que protege al cliente de recibir el mismo mensaje dos veces.
    // `takePending` no bloquea filas: sin cerrojo, dos despachos en paralelo
    // leen el MISMO lote de pendientes y ambos lo envian.
    let soltar: () => void;
    const enCurso = new Promise<void>((resolve) => {
      soltar = resolve;
    });
    dispatchCampaign.mockImplementation(() => enCurso);

    const db = fakeDb();
    const primero = despacharConCerrojo(db, 'camp_x');
    const segundo = despacharConCerrojo(db, 'camp_x');

    await segundo; // el segundo se rinde de inmediato
    expect(dispatchCampaign).toHaveBeenCalledTimes(1);

    soltar!();
    await primero;
  });

  it('el cerrojo se suelta aunque el despacho reviente', async () => {
    // Un cerrojo que no se suelta ante un error es una campana que no se
    // vuelve a enviar jamas.
    dispatchCampaign.mockRejectedValueOnce(new Error('el canal se cayo'));
    const db = fakeDb();

    await expect(despacharConCerrojo(db, 'camp_y')).rejects.toThrow('el canal se cayo');

    dispatchCampaign.mockResolvedValue({ enviados: 1, fallidos: 0, omitidos: 0 });
    await despacharConCerrojo(db, 'camp_y');

    expect(dispatchCampaign).toHaveBeenCalledTimes(2);
  });

  it('campanas distintas si se despachan a la vez', async () => {
    const db = fakeDb();
    await Promise.all([despacharConCerrojo(db, 'camp_1'), despacharConCerrojo(db, 'camp_2')]);
    expect(dispatchCampaign).toHaveBeenCalledTimes(2);
  });
});
