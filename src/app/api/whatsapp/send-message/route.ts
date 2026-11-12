
import { NextRequest, NextResponse } from 'next/server';
import { requireUserPermission } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  const serviceUrl = process.env.WHATSAPP_SERVICE_URL;
  const secret = process.env.WHATSAPP_SERVICE_SECRET;

  if (!serviceUrl || !secret) {
    return NextResponse.json(
      { success: false, error: 'Servicio WhatsApp no configurado' },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const { phone, message } = body;

    if (
      typeof phone !== 'string' ||
      !phone.trim() ||
      typeof message !== 'string' ||
      !message.trim()
    ) {
      return NextResponse.json(
        { success: false, error: 'Destinatario o mensaje inválido' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${serviceUrl.replace(/\/+$/, '')}/api/whatsapp/send-message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-service-secret': secret,
        },
        body: JSON.stringify({ phone, message }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data?.error || 'Error al enviar mensaje',
        },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { success: false, error: 'No se pudo comunicar con WhatsAppService' },
      { status: 502 }
    );
  }
}
