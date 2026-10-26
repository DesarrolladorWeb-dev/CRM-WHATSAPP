import { NextRequest, NextResponse } from 'next/server';
import { isSeedAllowed } from '@/lib/seedGuard';
import { resolveAllowedOrigin, applyCorsHeaders } from '@/lib/cors';
import { requireAuth, isMachineAllowedPath, isMachineRequest } from './lib/auth';

/**
 * Middleware de proteccion para las rutas /api/*.
 * Corre en Edge Runtime, por lo que no puede usar Mongoose ni consultar la
 * base: aqui solo se resuelve CORS, se bloquea el seed destructivo segun
 * entorno y se verifica el JWT de la cookie de sesion.
 *
 * requireAuth devuelve el userId del token y lo pasa hacia adelante en la
 * cabecera x-verified-user-id. Ese header es lo que despues lee
 * requireUserPermission en cada route handler para comprobar que el rol del
 * usuario tiene el permiso que la operacion pide. Si el token no es valido,
 * el proxy responde 401 y el route handler ni se ejecuta.
 *
 * Ojo: el header es de confianza solo porque lo escribe este middleware. Si
 * una ruta quedara fuera del matcher /api/:path*, se saltaria esta
 * validacion por completo.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const allowOrigin = resolveAllowedOrigin(req.headers.get('origin'));

  // Preflight CORS: se responde antes de exigir la credencial, porque el
  // navegador no envia cabeceras propias (x-api-key) en la peticion OPTIONS.
  if (req.method === 'OPTIONS') {
    return applyCorsHeaders(new NextResponse(null, { status: 204 }), allowOrigin);
  }

  // Seed destructivo: se bloquea por entorno, no por credencial. Es la unica
  // excepcion que protege el dato y no el permiso: /api/seed esta pensado para
  // que un integrante nuevo conecte las bases vacias, todavia sin sesion, y
  // encima exige una frase de confirmacion en el body. Ver seedGuard.ts.
  if ((pathname === '/api/seed' || pathname === '/api/seed/') && !isSeedAllowed()) {
    return applyCorsHeaders(
      NextResponse.json(
        {
          success: false,
          error:
            'El endpoint de seed (destructivo) esta deshabilitado en este entorno. Define ALLOW_DESTRUCTIVE_SEED=true para habilitarlo.',
        },
        { status: 403 }
      ),
      allowOrigin
    );
  }

  // Healthchecks para balanceadores y orquestadores: quedan fuera de la
  // exigencia de credencial porque estos clientes (k8s, ALB, etc.) no pueden
  // adjuntar x-api-key. Ninguno de los dos expone secretos: /api/health/live
  // solo confirma que el proceso responde, y /api/health solo agrega banderas
  // booleanas de conexion (sin credenciales, URIs ni datos de negocio).
  if (
    pathname === '/api/health/live' ||
    pathname === '/api/health/live/' ||
    pathname === '/api/health' ||
    pathname === '/api/health/'
  ) {
    return applyCorsHeaders(NextResponse.next(), allowOrigin);
  }

  // Webhook de Meta: llega con su propia firma (X-Hub-Signature-256), no con
  // nuestra x-api-key, asi que no puede exigirsele la credencial. La ruta
  // verifica el HMAC contra WHATSAPP_APP_SECRET antes de procesar nada.
  if (pathname === '/api/webhooks/whatsapp' || pathname === '/api/webhooks/whatsapp/') {
    return applyCorsHeaders(NextResponse.next(), allowOrigin);
  }

  // Disparador del worker de campanas: lo llama un cron, que no tiene sesion
  // de usuario ni puede renovar un JWT. Igual que el webhook, trae su propia
  // credencial (CRON_SECRET) y la propia ruta la verifica en tiempo constante
  // antes de tocar nada; sin ella responde 401. Exceptuarla aqui no la deja
  // abierta, solo cambia QUE credencial se le exige.
  if (pathname === '/api/campaigns/tick' || pathname === '/api/campaigns/tick/') {
    return applyCorsHeaders(NextResponse.next(), allowOrigin);
  }


  // El login es la unica excepcion por necesidad tecnica: no hay sesion que
  // validar todavia. El GET de esa misma ruta (el perfil del usuario actual)
  // si la exige.
  const isLoginRequest = pathname === '/api/auth/user' && req.method === 'POST'

  // n8n (máquina-a-máquina): trae su propio secret y la ruta lo re-verifica;
  // aquí solo se le exime de la sesión JWT. Limitado a ingesta (POST).
  if (req.method === 'POST' && isMachineAllowedPath(pathname) && isMachineRequest(req)) {
    return applyCorsHeaders(NextResponse.next(), allowOrigin);
  }

  if (!isLoginRequest) {
    const auth = await requireAuth(req)
    if ('error' in auth) return auth.error

    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-verified-user-id', auth.payload.userId)
    
    return applyCorsHeaders(NextResponse.next({request: {headers: requestHeaders}}), allowOrigin)

  }


  return applyCorsHeaders(NextResponse.next(), allowOrigin);
}

export const config = {
  matcher: '/api/:path*',
};
