import { NextRequest, NextResponse } from 'next/server';
import { requireUserPermission } from '@/lib/auth';

const allowed: Record<string, string[]> = {
  GET: ['status', 'received-messages'],
  POST: ['request-qr', 'reset', 'send-message', 'send-media', 'send-campaign', 'send-product-info', 'send-interactive', 'webhook'],
};

async function forward(req: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!allowed[req.method]?.includes(action)) return NextResponse.json({ error: 'Ruta no permitida' }, { status: 404 });
  const denied = await requireUserPermission(req, req.method === 'GET' ? 'read' : 'write');
  if (denied) return denied;
  const secret = process.env.WHATSAPP_SERVICE_SECRET;
  const base = process.env.WHATSAPP_SERVICE_URL;
  if (!secret || !base) return NextResponse.json({ error: 'Servicio de WhatsApp no configurado' }, { status: 503 });
  let body = req.method === 'POST' ? await req.text() : undefined;
  if (action === 'webhook') {
    let data: { url?: string };
    try { data = JSON.parse(body || '{}'); } catch { return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 }); }
    const expected = `${(process.env.APP_URL || '').replace(/\/$/, '')}/api/whatsapp/webhook`;
    if (!process.env.APP_URL || data.url !== expected) return NextResponse.json({ error: 'URL de webhook no permitida' }, { status: 400 });
    body = JSON.stringify({ url: expected });
  }
  try {
    const url = new URL(`/api/whatsapp/${action}${req.nextUrl.search}`, base);
    const upstream = await fetch(url, { method: req.method, headers: { 'Content-Type': 'application/json', 'x-service-secret': secret }, body, cache: 'no-store', redirect: 'error' });
    return new NextResponse(await upstream.text(), { status: upstream.status, headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar al servicio de WhatsApp' }, { status: 502 });
  }
}
export const GET = forward;
export const POST = forward;
