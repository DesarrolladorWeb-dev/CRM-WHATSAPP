import { NextRequest, NextResponse } from 'next/server';
import { connectToPostgres } from '@/lib/postgres';
import { jwtVerify } from 'jose';

// 'delete' es un permiso INDEPENDIENTE y explicito: no lo otorga 'write'.
// Una credencial pensada para editar contenido no debe poder borrar entidades.
// Solo lo satisfacen 'delete', un scope prefijado ('delete:campaigns', ...) o
// un alias de administrador.
export type Permission = 'read' | 'write' | 'delete' | 'admin';

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  Administrador: ['admin'],
  Empleado: ['read', 'write']
}

const secret = new TextEncoder().encode(process.env.JWT_SECRET)


export function extractApiKey(req: NextRequest): string | null {
  // const header = req.headers.get('x-api-key');
  // if (header) return header;

  // const authorization = req.headers.get('authorization') || '';
  // const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  // return bearer?.[1] || null;

  const userId = req.headers.get('x-verified-user-id')
  if (!userId) return null
  return userId

}

/**
 * Credencial máquina-a-máquina para n8n (sin sesión de usuario).
 *
 * n8n no puede renovar JWTs ni guardar cookies: cada mensaje hacía un Login
 * (lento y con riesgo de rate-limit). Con `x-n8n-secret` (o `?secret=`) el
 * flujo es stateless. Solo vale para las rutas de ingesta (ver
 * isMachineAllowedPath): escribir mensajes/entrantes, nada destructivo.
 * Comparación en tiempo constante para no filtrar el secreto por timing.
 */
const MACHINE_PATHS = ['/api/whatsapp/webhook', '/api/messages'];

function machineSecret(): string {
  return process.env.N8N_WEBHOOK_SECRET || process.env.WHATSAPP_WEBHOOK_SECRET || '';
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isMachineAllowedPath(pathname: string): boolean {
  const p = (pathname || '').replace(/\/+$/, '') || '/';
  return MACHINE_PATHS.includes(p);
}

export function isMachineRequest(req: NextRequest): boolean {
  const secret = machineSecret();
  if (!secret) return false;
  const url = new URL(req.url);
  const provided =
    req.headers.get('x-n8n-secret') || url.searchParams.get('secret') || '';
  return safeEqual(provided, secret);
}

/**
 * Puerta de escritura para rutas que consumen navegador (sesión JWT) y n8n
 * (secret). Devuelve null si está autorizada, o la respuesta de error.
 */
export async function requireWriteAccess(
  req: NextRequest,
  required: Permission = 'write'
): Promise<NextResponse | null> {
  try {
    if (isMachineAllowedPath(new URL(req.url).pathname) && isMachineRequest(req)) {
      return null;
    }
  } catch {
    // URL inválida: se cae al flujo de sesión normal.
  }
  return requireUserPermission(req, required);
}

export function hasPermission(
  // permissions: string[], required: Permission
  role: string | null | undefined, required: Permission
): boolean {
  // const ADMIN_ALIASES = ['Administrador', 'admin:all', 'full_access'];
  // if (permissions.some((p) => ADMIN_ALIASES.includes(p))) return true;
  // return permissions.some((p) => p === required || p.startsWith(required + ':'));

  if (!role) return false;
  const granted = ROLE_PERMISSIONS[role]
  if (!granted) return false;
  return granted.includes(required) || granted.includes('admin')
}

/**
 * Devuelve la lista de permisos del usuario que hace la peticion, o null si
 * no se puede determinar (no hay sesion, o la BD no responde). La usa el
 * frontend para reflejar los permisos (p. ej. ocultar acciones
 * destructivas). La fuente de verdad sigue siendo `requireUserPermission`, que
 * es la que cada route handler aplica antes de tocar nada.
 */
// export async function getApiKeyPermissions(req: NextRequest): Promise<string[] | null> {
//   const key = extractApiKey(req);
//   if (!key) return null;

//   const master = process.env.API_MASTER_KEY;
//   if (master && key === master) return ['admin'];

//   const db = await connectToPostgres();
//   if (!db) return null;

//   const record = await db.apiKey.findUnique({ where: { keyHash: hashApiKey(key) } });
//   return record ? record.permissions || [] : null;
// }

export async function getApiKeyPermissions(req: NextRequest): Promise<string[] | null> {
  const userId = req.headers.get('x-verified-user-id')
  if (!userId) return null;

  const db = await connectToPostgres();
  if (!db) return null;
  const user = await db.user.findUnique({ where: { id: userId } })

  const granted = ROLE_PERMISSIONS[user.role]
  if (!granted) return null;
  return granted;
}


export interface AuthPayload {
  userId: string
}

function extractToken(req: NextRequest) {
  // const authorization = req.headers.get('authorization') || null;
  // const match = authorization.match(/^Bearer\s+(.+)$/i)
  // return match[1] || null

  return req.cookies.get('session_token')?.value || null
}


export async function requireUserPermission(req: NextRequest, required: Permission): Promise<NextResponse | null> {

  const userId = req.headers.get('x-verified-user-id')
  if (!userId) {
    return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })
  }

  const db = await connectToPostgres();
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user || !hasPermission(user.role, required)) {
    return NextResponse.json(
      { success: false, error: 'Permisos insuficientes para esta operación' },
      {
        status: 403
      }
    )
  }

  return null



}

export async function requireAuth(req: NextRequest) {
  const token = extractToken(req)

  if (!token) {
    return {
      error: NextResponse.json(
        { success: false, error: 'Falta el token de autenticación' },
        { status: 401 }
      )
    }
  }

  try {
    const { payload } = await jwtVerify(token, secret)
    return { payload: payload as unknown as AuthPayload }
  } catch {
    return {
      error: NextResponse.json(
        { success: false, error: 'Token inválido o expirado' },
        { status: 401 }
      )
    }
  }
}