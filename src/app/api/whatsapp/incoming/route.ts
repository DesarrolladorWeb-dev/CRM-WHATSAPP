import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeIncoming,
  handleIncomingPayload,
  type IncomingPayload,
} from '../ingest';

// Ruta usada por el navegador (page.tsx -> /api/whatsapp/incoming) para
// persistir mensajes entrantes del servicio de WhatsApp mientras el CRM esta
// abierto. La logica compartida vive en ../ingest.ts, igual que el webhook.

export async function POST(req: NextRequest) {
  const denied = await authorizeIncoming(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as IncomingPayload | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'Cuerpo invalido' }, { status: 400 });
  }
  return handleIncomingPayload(body);
}