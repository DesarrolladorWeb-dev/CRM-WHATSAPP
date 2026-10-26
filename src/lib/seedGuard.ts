/**
 * Guardas del endpoint destructivo `POST /api/seed`.
 *
 * `seed` borra y repuebla AMBAS bases (un `deleteMany` sobre ~20 tablas de
 * Postgres + las colecciones de Mongo). Se protege en tres capas:
 *
 *  1. `src/middleware.ts` (Edge): bloqueo temprano antes de llegar al handler.
 *  2. Este módulo: la lógica compartida. Sin imports pesados (solo lee
 *     `process.env`) para poder usarse también desde el Edge Runtime.
 *  3. `src/app/api/seed/route.ts`: repite la comprobación (defensa en
 *     profundidad, no confía solo en el middleware) y, en producción, exige una
 *     frase de confirmación explícita en el body.
 *
 * En producción el endpoint está DESHABILITADO salvo que se defina
 * `ALLOW_DESTRUCTIVE_SEED=true` de forma deliberada (p. ej. para el primer
 * arranque). Ese flag se lee en build para el middleware Edge: cambiarlo exige
 * un redeploy, igual que `NODE_ENV`.
 */

/** Frase que debe venir en `{ "confirm": ... }` para ejecutar el seed en prod. */
export const SEED_CONFIRM_PHRASE = 'RESET-WHATO-DB';

/** `true` si el endpoint de seed puede ejecutarse en este entorno. */
export function isSeedAllowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.ALLOW_DESTRUCTIVE_SEED === 'true';
}

/** `true` si además hace falta la frase de confirmación en el body. */
export function seedRequiresConfirmation(): boolean {
  return process.env.NODE_ENV === 'production';
}
