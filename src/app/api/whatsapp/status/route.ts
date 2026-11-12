
import { NextRequest, NextResponse } from 'next/server';
import { requireUserPermission } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const denied = await requireUserPermission(req, 'read');
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
    const response = await fetch(
      `${serviceUrl.replace(/\/+$/, '')}/api/whatsapp/status`,
      {
        headers: {
          'x-service-secret': secret,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: 'Error al consultar WhatsApp' },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'No se pudo conectar con WhatsAppService' },
      { status: 502 }
    );
  }
}
