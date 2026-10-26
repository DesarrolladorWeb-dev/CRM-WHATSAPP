import type { CampaignStatus } from '@/types';

/**
 * Ciclo de vida de una campana.
 *
 *   draft ──► scheduled ──► running ──► completed
 *     │                        │
 *     │                        ├──► paused ──► running
 *     │                        └──► failed
 *     └──► cancelled
 *
 * La regla que sostiene todo el modulo: `completed`, `failed` y `cancelled`
 * son TERMINALES. De ahi no se sale. Es lo unico que impide que una campana ya
 * enviada se relance sobre las mismas personas — por un doble clic, por un
 * reintento automatico o por una llamada directa a la API.
 */

/** Estados desde los que la campana todavia no ha salido a la calle. */
const EDITABLES: readonly CampaignStatus[] = ['draft', 'scheduled'] as const;

/** Estados desde los que se puede lanzar. */
const LANZABLES: readonly CampaignStatus[] = ['draft', 'scheduled'] as const;

/** Estados en los que la campana ya no cambia nunca mas. */
const TERMINALES: readonly CampaignStatus[] = ['completed', 'failed', 'cancelled'] as const;

const TRANSICIONES: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ['scheduled', 'running', 'cancelled'],
  scheduled: ['draft', 'running', 'cancelled'],
  running: ['paused', 'completed', 'failed'],
  paused: ['running', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

/** true si `valor` es uno de los estados conocidos. */
export function isCampaignStatus(valor: unknown): valor is CampaignStatus {
  return typeof valor === 'string' && valor in TRANSICIONES;
}

/** true si el salto de un estado a otro esta permitido. */
export function puedeTransicionar(desde: CampaignStatus, hacia: CampaignStatus): boolean {
  if (desde === hacia) return true; // guardar sin cambiar de estado es valido
  return TRANSICIONES[desde].includes(hacia);
}

/** true si todavia se puede editar contenido, segmento o canal. */
export function esEditable(estado: CampaignStatus): boolean {
  return EDITABLES.includes(estado);
}

/** true si la campana se puede lanzar desde este estado. */
export function puedeLanzarse(estado: CampaignStatus): boolean {
  return LANZABLES.includes(estado);
}

/** true si la campana ya termino y no admite mas cambios. */
export function esTerminal(estado: CampaignStatus): boolean {
  return TERMINALES.includes(estado);
}

/**
 * Borrar solo se permite si la campana no esta en vuelo. Eliminar una campana
 * `running` dejaria destinatarios huerfanos a medio enviar.
 */
export function puedeBorrarse(estado: CampaignStatus): boolean {
  return estado !== 'running' && estado !== 'paused';
}

/** Mensaje en castellano para explicar por que se rechaza una transicion. */
export function motivoTransicionInvalida(desde: CampaignStatus, hacia: CampaignStatus): string {
  if (esTerminal(desde)) {
    return `La campana ya esta en estado «${desde}» y no admite mas cambios.`;
  }
  return `No se puede pasar de «${desde}» a «${hacia}».`;
}
