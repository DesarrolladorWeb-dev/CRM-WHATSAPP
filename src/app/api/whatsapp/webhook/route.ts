import { NextRequest, NextResponse } from 'next/server';
import { handleIncomingPayload, type IncomingPayload } from '../ingest';

// Webhook del servicio local de WhatsApp (server-to-server, POST sin x-api-key).
//
// El servicio (src/services/whatsapp.service.js -> sendToWebhook) llama a esta
// URL con el mismo payload que emite por Socket.IO ('incoming-message'). Asi los
// mensajes entrantes llegan a las bases del CRM aunque el navegador este cerrado.
//
// DEV/seguridad: como el proveedor es un servicio local de confianza que no
// puede mandar cabeceras, esta ruta acepta el POST sin credencial. Mantener la
// URL del webhook en localhost y/o restringir acceso a la red.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as IncomingPayload | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'Cuerpo invalido' }, { status: 400 });
  }
  return handleIncomingPayload(body);
}