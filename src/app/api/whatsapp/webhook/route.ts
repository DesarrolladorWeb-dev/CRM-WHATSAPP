import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { handleIncomingPayload, type IncomingPayload } from '../ingest';

// Webhook del servicio local de WhatsApp (server-to-server, POST sin x-api-key).
//
// El servicio (src/services/whatsapp.service.js -> sendToWebhook) llama a esta
// URL con el mismo payload que emite por Socket.IO ('incoming-message'). Asi los
// mensajes entrantes llegan a las bases del CRM aunque el navegador este cerrado.
//
// SEGURIDAD: el servicio firma la llamada con el header `x-n8n-secret` (valor de
// WHATSAPP_WEBHOOK_SECRET). El proxy (src/proxy.ts) ya exime del JWT a esta ruta
// cuando el secreto coincide, pero eso solo decide si la peticion pasa: la
// comprobacion de verdad se hace aqui, porque una ruta que se apoya solo en el
// middleware queda abierta si algun dia se cambia el matcher.

/**
 * Compara dos cadenas en tiempo constante. Se comparan hashes SHA-256 para que
 * ni el contenido ni la longitud del secreto se filtren por el tiempo de
 * respuesta (timingSafeEqual lanza si los buffers miden distinto).
 */
function secretMatches(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET;

  // Fail-closed: sin secreto configurado no hay forma de autenticar al
  // servicio, asi que no se procesa nada.
  if (!expected) {
    return NextResponse.json(
      { success: false, error: 'WhatsApp webhook sin secreto configurado' },
      { status: 503 }
    );
  }

  const provided =
    req.headers.get('x-n8n-secret') ||
    new URL(req.url).searchParams.get('secret') ||
    '';

  if (!secretMatches(provided, expected)) {
    return NextResponse.json(
      { success: false, error: 'No autorizado' },
      { status: 401 }
    );
  }

  const body = (await req.json().catch(() => null)) as IncomingPayload | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'Cuerpo invalido' }, { status: 400 });
  }
  return handleIncomingPayload(body);
}
