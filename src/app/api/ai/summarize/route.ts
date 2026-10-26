import { NextRequest, NextResponse } from 'next/server';
import { requireUserPermission } from '@/lib/auth';
import { AiConfigurationError, getAiClient, getAiModel, isAiKeyConfigured } from '@/lib/gemini';
import { captureException } from '@/lib/logger';
import { enforceAiRateLimit } from '@/lib/rateLimit';
import { logger, motivo } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  const limited = await enforceAiRateLimit(req, 'generalAI');
  if (limited) return limited;

  try {
    const { messages, contactName } = await req.json();

    if (!isAiKeyConfigured()) {
      return NextResponse.json({
        success: true,
        data: {
          summary: `El cliente ${contactName || 'Lead'} ha mostrado alto interés en las soluciones de XIO CRM y solicita demostración técnica.`,
          keyIntent: 'Solicitud de información sobre integración y precios de XIO CRM',
          suggestedNextAction: 'Enviar enlace de Google Calendar y propuesta comercial personalizada.',
          recommendedScore: 85
        }
      });
    }

    const ai = getAiClient();
    const prompt = `
      Resume la siguiente conversación con el cliente ${contactName || ''} en español para XIO CRM.
      Identifica la intención principal, objeciones y el siguiente paso sugerido.

      Historial:
      ${JSON.stringify(messages || [], null, 2)}

      RESPONDE EXCLUSIVAMENTE EN FORMATO JSON:
      {
        "summary": "Resumen ejecutivo en 2 oraciones",
        "keyIntent": "Intención principal (e.g. Solicita cotización anual, Consulta técnica API, etc.)",
        "suggestedNextAction": "Acción inmediata recomendada para el agente",
        "recommendedScore": 85
      }
    `;

    const response = await ai.models.generateContent({
      model: getAiModel(),
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    return NextResponse.json({ success: true, data: parsed });
  } catch (error) {
    const errorId = captureException(error, { route: '/api/ai/summarize', method: 'POST' });
    if (error instanceof AiConfigurationError) {
      return NextResponse.json(
        { success: false, error: error.message, errorId },
        { status: 503 }
      );
    }
    logger.error('Error in /api/ai/summarize', { motivo: motivo(error) });
    return NextResponse.json(
      {
        success: false,
        error: 'Error al resumir conversación',
        errorId,
      },
      { status: 500 }
    );
  }
}