/**
 * Cliente HTTP para las rutas /api/*.
 * Agrega la cabecera x-api-key a cada peticion.
 *
 * NOTA: NEXT_PUBLIC_API_KEY viaja al bundle del navegador y es visible
 * para cualquiera que inspeccione el codigo. Es una proteccion contra
 * acceso externo casual, no un sustituto de autenticacion de usuarios.
 * Esta clave nunca debe tener permiso 'admin'.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  // const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';
  // const headers = new Headers(init.headers || {});
  // if (API_KEY) headers.set('x-api-key', API_KEY);
  return fetch(input, { ...init, credentials: 'same-origin' });
}