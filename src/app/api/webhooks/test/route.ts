import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomBytes } from 'crypto';
import { captureException } from '@/lib/logger';
import { requireUserPermission } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  try {
    const body = await req.json();
    const { webhookUrl, event, payload, secret } = body;
    const timestamp = new Date().toISOString();
    const payloadJson = JSON.stringify(payload || {});

    // El secreto compartido debe coincidir con el configurado en tu endpoint receptor
    // (p. ej. webhookConfig.secret). Si no se envía ni hay uno configurado por entorno,
    // se genera uno efímero solo para poder verificar esta firma de prueba.
    const secretFromRequest = typeof secret === 'string' && secret.length > 0 ? secret : null;
    let signingSecret = secretFromRequest || process.env.WEBHOOK_SIGNING_SECRET;
    const secretSource: 'request' | 'env' | 'generated' = secretFromRequest ? 'request' : signingSecret ? 'env' : 'generated';
    if (!signingSecret) {
      signingSecret = randomBytes(24).toString('hex');
    }

    const signedContent = `${timestamp}.${payloadJson}`;
    const signature = 'sha256=' + createHmac('sha256', signingSecret).update(signedContent).digest('hex');

    return NextResponse.json({
      success: true,
      simulated: true,
      delivered: false,
      statusCode: 200,
      timestamp,
      event: event || 'message.received',
      webhookUrl: webhookUrl || 'https://api.empresa.com/v1/xiocrm/events',
      signature,
      signatureScheme: 'HMAC-SHA256(secret, "{timestamp}.{payload_json}")',
      ...(secretSource === 'generated'
        ? { secretUsed: signingSecret, secretNote: 'No se recibió ni había un secreto configurado; se generó uno efímero solo para verificar esta simulación.' }
        : {}),
      message: 'Simulación de webhook: NO se realizó ninguna petición HTTP real a webhookUrl. La firma es un HMAC-SHA256 genuino, verificable recalculándola con el secreto compartido.'
    });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/webhooks/test', method: 'POST' });
    return NextResponse.json(
      { success: false, error: 'Error en prueba de webhook', errorId },
      { status: 500 }
    );
  }
}