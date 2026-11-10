import { createHmac } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireUserPermission } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const denied = await requireUserPermission(req, 'read');
  if (denied) return denied;
  const secret = process.env.WHATSAPP_SERVICE_SECRET;
  if (!secret) return NextResponse.json({ error: 'Servicio de WhatsApp no configurado' }, { status: 503 });
  const expiry = String(Math.floor(Date.now() / 1000) + 300);
  const signature = createHmac('sha256', secret).update(expiry).digest('hex');
  return NextResponse.json({ token: `${expiry}.${signature}` }, { headers: { 'Cache-Control': 'no-store' } });
}
