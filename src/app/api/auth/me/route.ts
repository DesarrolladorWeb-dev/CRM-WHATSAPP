import { NextRequest, NextResponse } from 'next/server';
import { getApiKeyPermissions, hasPermission, requireUserPermission } from '@/lib/auth';
import { connectToPostgres } from '@/lib/postgres';

/**
 * Devuelve los permisos de la credencial que hace la peticion y un resumen de
 * capacidades derivadas, para que el frontend refleje correctamente lo que el
 * usuario puede hacer (p. ej. ocultar el boton de eliminar campañas).
 *
 * NO es un mecanismo de seguridad: cada route handler revalida con
 * rechazaria.
 */
export async function GET(req: NextRequest) {
  const denied = await requireUserPermission(req, 'read');
  if (denied) return denied;

  const permissions = (await getApiKeyPermissions(req)) ?? [];

  // El rol vive en el usuario, no en el array de permisos. Se consulta aqui
  // para usar exactamente la misma funcion (`hasPermission`) que el DELETE
  // del servidor, en vez de una aproximacion que se desincronice.
  const userId = req.headers.get('x-verified-user-id');
  const db = await connectToPostgres();
  const user = db && userId
    ? await db.user.findUnique({ where: { id: userId }, select: { role: true } })
    : null;

  const canDelete = hasPermission(user?.role, 'delete');

  return NextResponse.json({
    success: true,
    data: {
      permissions,
      capabilities: {
        campaigns: {
          delete: canDelete,
        },
        contacts: {
          delete: canDelete,
        },
      },
    },
  });
}

