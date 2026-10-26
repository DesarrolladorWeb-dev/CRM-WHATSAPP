import { NextRequest, NextResponse } from 'next/server';
import { AiConfigurationError, getAiClient, getAiModel, isAiKeyConfigured } from '@/lib/gemini';
import { captureException } from '@/lib/logger';
import { enforceAiRateLimit } from '@/lib/rateLimit';
import { logger, motivo } from '@/lib/logger';
import { requireUserPermission } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const denied = await requireUserPermission(req, 'write');
  if (denied) return denied;

  const limited = await enforceAiRateLimit(req, 'generalAI');
  if (limited) return limited;

  try {
    const { incomingMessage, channel, contactName, companyNotes } = await req.json();

    if (!isAiKeyConfigured()) {
      return NextResponse.json({
        success: true,
        data: {
          botReply: `¡Hola ${contactName || ''}! Gracias por contactarnos por ${channel || 'este medio'}. Con XIO CRM puedes centralizar WhatsApp, Instagram y tus ventas en un solo lugar. ¿Te gustaría agendar una llamada con un asesor? 📲`,
          autoTag: 'Interesado IA',
          detectedSentiment: 'positive'
        }
      });
    }

    const ai = getAiClient();
    const prompt = `
      Eres un chatbot del CRM omnicanal XIO.
      Atiende el mensaje entrante del usuario "${contactName || 'Usuario'}", quien escribió por el canal "${channel || 'whatsapp'}".
      Notas previas del cliente: "${companyNotes || 'Nuevo prospecto'}"
      Mensaje del usuario: "${incomingMessage}"

      Genera una respuesta servicial, concisa, natural e informativa. Si pregunta precios o funciones, indícale las opciones clave de XIO CRM y ofrece conectarlo con un asesor humano o agendar demo.

      RESPONDE EXCLUSIVAMENTE EN FORMATO JSON:
      {
        "botReply": "Respuesta",
        "autoTag": "Etiqueta sugerida para agregar al contacto",
        "detectedSentiment": "positive" | "neutral" | "urgent" | "churn_risk"
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
    const errorId = captureException(error, { route: '/api/ai/chatbot-autorespond', method: 'POST' });
    if (error instanceof AiConfigurationError) {
      return NextResponse.json(
        { success: false, error: error.message, errorId },
        { status: 503 }
      );
    }
    logger.error('Error in /api/ai/chatbot-autorespond', { motivo: motivo(error) });
    return NextResponse.json(
      {
        success: false,
        error: 'Error en auto-respuesta del bot',
        errorId,
      },
      { status: 500 }
    );
  }
}