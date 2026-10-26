import { randomUUID } from 'crypto';

/**
 * Logging estructurado + error tracking, sin dependencias externas.
 *
 * Cada linea es un JSON de una sola linea (formato habitual para que un
 * colector externo -- CloudWatch, Loki, Datadog, etc. -- pueda parsear los
 * logs sin regex). Si mas adelante se quiere un proveedor real de error
 * tracking (Sentry, Bugsnag...), `captureException` es el unico punto de
 * integracion: basta con reenviar `event` al SDK correspondiente ahi dentro.
 *
 * En desarrollo imprime una linea legible; en produccion emite JSON por
 * stdout/stderr, que es lo que esperan los colectores (CloudWatch, Loki,
 * Datadog). El nivel minimo se controla con LOG_LEVEL.
 *
 * No registra datos personales: los campos que se pasen en meta deben
 * ser identificadores o metricas, nunca contenido de mensajes, emails,
 * telefonos ni claves.
 *
 * Uso:
 *   import { logger, captureException } from '@/lib/logger';
 *   logger.info('contact.created', { contactId });
 *   const errorId = captureException(err, { route: '/api/contacts' });
 */

type Nivel = 'debug' | 'info' | 'warn' | 'error';

const ORDEN: Record<Nivel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const nivelMinimo = (): Nivel => {
  const env = (process.env.LOG_LEVEL || '').toLowerCase();
  if (env === 'debug' || env === 'info' || env === 'warn' || env === 'error') return env;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
};

/** Extrae solo el mensaje de un error, sin la traza ni el objeto completo. */
export function motivo(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Logging estructurado + error tracking, sin dependencias externas.
 *
 * Cada linea es un JSON de una sola linea (formato habitual para que un
 * colector externo -- CloudWatch, Loki, Datadog, etc. -- pueda parsear los
 * logs sin regex). Si mas adelante se quiere un proveedor real de error
 * tracking (Sentry, Bugsnag...), `captureException` es el unico punto de
 * integracion: basta con reenviar `event` al SDK correspondiente ahi dentro.
 *
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogFields {
  [key: string]: unknown;
}

const SERVICE_NAME = 'whato-crm';

function baseFields(level: LogLevel, message: string, fields?: LogFields) {
  return {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    env: process.env.NODE_ENV || 'development',
    message,
    ...fields,
  };
}

function write(level: LogLevel, message: string, fields?: LogFields) {
  if (ORDEN[level] < ORDEN[nivelMinimo()]) return;
  const line = JSON.stringify(baseFields(level, message, fields));
  // console.error para 'error'/'warn' (stderr), console.log para el resto (stdout).
  // Mantiene compatible con cualquier agregador de logs basado en streams.
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, fields?: LogFields) => write('debug', message, fields),
  info: (message: string, fields?: LogFields) => write('info', message, fields),
  warn: (message: string, fields?: LogFields) => write('warn', message, fields),
  error: (message: string, fields?: LogFields) => write('error', message, fields),
};

/**
 * Serializa un error de forma segura (algunos errores de libs traen
 * propiedades circulares o no enumerables en `message`/`stack`).
 */
function serializeError(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { name: 'NonErrorThrown', message: String(err) };
}

/**
 * Registra una excepcion como evento de error tracking: genera un id
 * correlacionable (uuid) que se puede devolver al cliente en la respuesta
 * (sin exponer el stack trace) y loguea el detalle completo del lado del
 * servidor para poder buscarlo despues por ese mismo id.
 *
 * Devuelve el errorId para incluirlo en la respuesta HTTP, ej:
 *   const errorId = captureException(err, { route: '/api/contacts', method: 'POST' });
 *   return NextResponse.json({ success: false, error: 'Error interno', errorId }, { status: 500 });
 *
 * Punto de extension: si se agrega un proveedor real (Sentry, etc.), es este
 * el unico lugar donde hay que reenviar el evento.
 */
export function captureException(err: unknown, context?: LogFields): string {
  const errorId = randomUUID();
  write('error', 'unhandled_exception', {
    errorId,
    error: serializeError(err),
    ...context,
  });

  // Punto de integracion opcional con un proveedor externo de error tracking:
  // if (process.env.SENTRY_DSN) {
  //   Sentry.captureException(err, { tags: context, extra: { errorId } });
  // }

  return errorId;
}

// --- Alertas operativas ---------------------------------------------------

/**
 * Ventana de deduplicacion: una misma incidencia (misma `key`) no genera mas
 * de una alerta dentro de este intervalo, para que una caida sostenida de una
 * base de datos no inunde el canal de alertas.
 */
const ALERT_THROTTLE_MS = Number(process.env.ALERT_THROTTLE_MS) || 5 * 60_000;

/** Ultima vez (ms epoch) que se emitio alerta para cada `key`. */
const ultimaAlerta = new Map<string, number>();

/**
 * Emite un evento de alerta operativa: una linea de log a nivel `error` con
 * `alert: true`, pensada para que el colector externo (CloudWatch, Loki,
 * Datadog) tenga una regla que dispare una notificacion al ver ese campo.
 *
 * No hay proveedor de alertas cableado en el codigo: el punto de integracion
 * es esa regla sobre `alert:true`. Si mas adelante se quiere empujar a
 * Slack/PagerDuty desde el proceso, este es el unico sitio a tocar.
 *
 * Solo actua en `NODE_ENV=production` (en local/CI basta el `logger.error`
 * normal) y deduplica por `key` durante ALERT_THROTTLE_MS. Devuelve `true` si
 * emitio la alerta.
 */
export function alertOps(key: string, message: string, fields?: LogFields): boolean {
  if (process.env.NODE_ENV !== 'production') return false;

  const ahora = Date.now();
  const previa = ultimaAlerta.get(key);
  if (previa !== undefined && ahora - previa < ALERT_THROTTLE_MS) return false;

  ultimaAlerta.set(key, ahora);
  write('error', message, { alert: true, alertKey: key, ...fields });
  return true;
}

/**
 * Marca una incidencia como resuelta: limpia el throttle de `alertOps` (para
 * que una recaida vuelva a alertar de inmediato) y, si habia una alerta activa
 * para esa `key`, emite una linea de recuperacion (`alert: true`,
 * `resolved: true`) para que el colector pueda cerrar la alerta. Es un no-op
 * si no habia alerta activa (arranque en frio, reconexiones normales).
 */
export function resolveOps(key: string, message: string, fields?: LogFields): void {
  if (!ultimaAlerta.has(key)) return;
  ultimaAlerta.delete(key);
  if (process.env.NODE_ENV !== 'production') return;
  write('warn', message, { alert: true, alertKey: key, resolved: true, ...fields });
}
