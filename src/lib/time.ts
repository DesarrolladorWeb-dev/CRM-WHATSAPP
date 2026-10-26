/**
 * Formato de horas en la zona horaria del negocio (Peru, UTC-5).
 *
 * Los timestamps de los mensajes se guardan en Mongo como STRING ya formateado
 * (`Message.timestamp`), asi que la hora queda congelada en el momento en que se
 * escribe. Si ese formateo ocurre en el servidor (webhooks de WhatsApp, envio de
 * media, bitacora de webhooks) y el contenedor corre en UTC —lo normal en Vercel,
 * Docker y la mayoria de PaaS— la hora se guarda 5 horas adelantada respecto a Lima.
 *
 * Por eso NO se usa `toLocaleTimeString([])` sin argumentos: ese `[]` toma la zona
 * del proceso, que en el servidor no es la del usuario. Aqui se fija explicitamente
 * `America/Lima`, de modo que cliente y servidor produzcan siempre la misma hora.
 */

/**
 * Zona del negocio. El orden importa:
 *
 * En el SERVIDOR manda `BUSINESS_TIME_ZONE`. En el NAVEGADOR esa variable no
 * existe —Next solo inyecta las `NEXT_PUBLIC_*`— asi que alli se usa
 * `NEXT_PUBLIC_BUSINESS_TIME_ZONE`. Si solo se define la primera y se cambia a
 * una zona distinta de Lima, el formulario etiquetaria las horas con una zona
 * y el servidor las interpretaria con otra: el usuario leeria «14:30 hora de
 * Lima» y la campana saldria a otra hora. Definiendo ambas, no hay discrepancia.
 */
export const BUSINESS_TIME_ZONE =
  process.env.BUSINESS_TIME_ZONE || process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE || 'America/Lima';

/** Nombre corto de la zona para mostrar al usuario: "Lima", "Madrid". */
export function nombreZonaNegocio(): string {
  return BUSINESS_TIME_ZONE.split('/').pop()?.replace(/_/g, ' ') ?? BUSINESS_TIME_ZONE;
}

/** "14:05" en hora de Lima, a partir de un Date (por defecto, ahora). */
export function formatTime(date: Date = new Date()): string {
  return date.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: BUSINESS_TIME_ZONE,
  });
}

/** Igual que formatTime pero tolerante a un ISO invalido o ausente. */
export function formatTimeFromIso(iso?: string | null, fallback = 'Ahora'): string {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return fallback;
  return formatTime(d);
}

/** "24/09/2026, 14:05" en hora de Lima. Para listados y detalles. */
export function formatDateTime(date: Date = new Date()): string {
  return date.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: BUSINESS_TIME_ZONE,
  });
}

// ---------------------------------------------------------------------------
// Hora de pared -> instante UTC
//
// Necesario para programar campanas. El `<input type="datetime-local">` del
// navegador devuelve "2026-09-25T14:30": una hora de pared SIN zona. Si el
// servidor hace `new Date("2026-09-25T14:30")`, JavaScript la interpreta en la
// zona DEL PROCESO — que en un contenedor suele ser UTC. Resultado: la campana
// sale 5 horas antes de lo que el usuario pidio.
//
// Tampoco vale convertirla en el navegador: la zona del navegador es la del
// portatil de quien programa, no la del negocio. El mismo "14:30" saldria a una
// hora real distinta segun quien lo configure y desde donde. Para un CRM que
// escribe a clientes peruanos, "14:30" significa 14:30 en Lima, punto.
//
// Por eso la conversion se hace aqui, con la zona del negocio explicita.
// ---------------------------------------------------------------------------

/** "2026-09-25T14:30" o "2026-09-25T14:30:00" (hora de pared, sin zona). */
const HORA_DE_PARED = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Cuantos milisegundos va `timeZone` por delante de UTC en un instante dado.
 *
 * Se calcula preguntandole a `Intl` como se ve ese instante en esa zona y
 * restando. Es la forma de saber el desfase real sin cablear "-5": si algun
 * dia `BUSINESS_TIME_ZONE` pasa a ser una zona con horario de verano, esto
 * sigue siendo correcto y un `-5` fijo no.
 */
function desfaseEnZona(instante: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    // 'h23' y no `hour12: false`: con hour12 algunos motores devuelven "24"
    // para la medianoche, lo que desplazaria el calculo un dia entero.
    hourCycle: 'h23',
  });

  const p: Record<string, number> = {};
  for (const parte of dtf.formatToParts(instante)) {
    if (parte.type !== 'literal') p[parte.type] = Number(parte.value);
  }

  const comoSiFueraUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return comoSiFueraUtc - instante.getTime();
}

/**
 * Convierte una hora de pared del negocio en el instante UTC que le
 * corresponde. Devuelve null si la cadena no es una hora de pared valida.
 *
 * Devolver null (en vez de una fecha aproximada) es deliberado: de esta fecha
 * depende CUANDO se le escribe a cientos de personas. Ante una entrada que no
 * se entiende, lo correcto es rechazarla y que alguien la corrija, no adivinar.
 */
export function horaDeParedAUtc(valor: string, timeZone: string = BUSINESS_TIME_ZONE): Date | null {
  const m = HORA_DE_PARED.exec(valor.trim());
  if (!m) return null;

  const [, a, mes, d, h, min, seg] = m;
  const comoSiFueraUtc = Date.UTC(+a, +mes - 1, +d, +h, +min, seg ? +seg : 0);
  if (Number.isNaN(comoSiFueraUtc)) return null;

  // Primera aproximacion con el desfase en ese punto del calendario, y una
  // segunda pasada por si el instante resultante cae al otro lado de un cambio
  // de horario (en Peru nunca pasa; en una zona con horario de verano, si).
  const desfase1 = desfaseEnZona(new Date(comoSiFueraUtc), timeZone);
  let instante = comoSiFueraUtc - desfase1;
  const desfase2 = desfaseEnZona(new Date(instante), timeZone);
  if (desfase2 !== desfase1) instante = comoSiFueraUtc - desfase2;

  const fecha = new Date(instante);

  // Verificacion de ida y vuelta: si al volver a formatear el instante en la
  // zona del negocio no sale la hora que pidio el usuario, la entrada no es
  // una hora real (31 de febrero, o una hora que no existe por el salto del
  // horario de verano). Se rechaza en vez de enviar a una hora distinta.
  if (formatWallClock(fecha, timeZone) !== `${a}-${mes}-${d}T${h}:${min}`) return null;

  return fecha;
}

/**
 * La operacion inversa: un instante -> "2026-09-25T14:30" en hora del negocio.
 * Es el formato que entiende `<input type="datetime-local">`, asi que es lo que
 * permite reabrir una campana programada y ver la hora que se eligio.
 */
export function formatWallClock(date: Date, timeZone: string = BUSINESS_TIME_ZONE): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const p: Record<string, string> = {};
  for (const parte of dtf.formatToParts(date)) {
    if (parte.type !== 'literal') p[parte.type] = parte.value;
  }

  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * Interpreta el `scheduledAt` que llega por la API.
 *
 * Acepta dos formas, y la diferencia importa:
 *
 *   - "2026-09-25T14:30"            -> hora de pared, se interpreta en la zona
 *                                      del negocio (lo que manda el formulario).
 *   - "2026-09-25T14:30:00-05:00"   -> instante ya sin ambiguedad, se respeta
 *     o "2026-09-25T19:30:00Z"         tal cual (integraciones, tests).
 *
 * Devuelve null si no es ninguna de las dos.
 */
export function parseScheduledAt(valor: string): Date | null {
  const limpio = valor.trim();
  if (!limpio) return null;

  // Sin zona explicita => hora de pared del negocio.
  if (HORA_DE_PARED.test(limpio)) return horaDeParedAUtc(limpio);

  // Con zona explicita => instante absoluto. Se exige que la lleve de forma
  // visible (Z o +hh:mm) para no volver a caer en la ambiguedad por descuido.
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(limpio)) return null;

  const fecha = new Date(limpio);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}
