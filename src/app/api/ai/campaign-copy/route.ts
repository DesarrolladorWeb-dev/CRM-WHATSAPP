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
    const { campaignTopic, targetChannel, productOffer, tone } = await req.json();

    if (!isAiKeyConfigured()) {
      return NextResponse.json({
        success: true,
        data: {
          variations: [
            {
              title: 'Opción 1 - Enfoque Urgencia / Valor',
              content: `🔥 ¡Últimos cupos para ${campaignTopic || 'nuestra promoción especial'}! Aprovecha hoy ${productOffer || 'descuento exclusivo'} con XIO CRM. 🚀 Responde SI para activar.`
            },
            {
              title: 'Opción 2 - Enfoque Educativo / Beneficios',
              content: `💡 Descubre cómo multiplicar tus conversiones de ventas en WhatsApp con XIO CRM. Incluye ${productOffer || 'beneficios premium'}. 📲 ¿Agendamos una breve demostración?`
            },
            {
              title: 'Opción 3 - Enfoque Directo a Conversión',
              content: `👋 Hola, tenemos lista tu propuesta para ${campaignTopic || 'optimizar tu CRM'}. Haz clic aquí para comenzar ahora mismo. 🚀`
            }
          ],
          recommendedHashtags: ['#XIOCRM', '#VentasWhatsApp', '#Automatizacion'],
          callToAction: 'Responde DEMO o haz clic en el enlace'
        }
      });
    }

    const ai = getAiClient();
    const prompt = `
      Eres un especialista de Copywriting y Marketing Omnicanal en español para XIO CRM.
      Crea 3 variaciones de copy publicitario optimizadas para el canal "${targetChannel || 'whatsapp'}".
      Tema de campaña: "${campaignTopic}"
      Oferta / Producto: "${productOffer}"
      Tono de voz: "${tone || 'Persuasivo y directo'}"

      Debes adaptar el estilo al canal:
      - Si es WhatsApp: Usa emojis, viñetas claras y un llamado a la acción directo con palabra clave.
      - Si es Instagram: Incluye gancho inicial visual, emojis elegantes y hashtags relevantes.
      - Si es Twitter/X: Mantenlo conciso, de alto impacto y fácil de retuitear.
      - Si es Email/Messenger: Asunto atrayente y cuerpo estructurado.

      RESPONDE EXCLUSIVAMENTE EN FORMATO JSON:
      {
        "variations": [
          {
            "title": "Opción 1 - Enfoque Urgencia / Valor",
            "content": "Texto del mensaje con emojis y CTA"
          },
          {
            "title": "Opción 2 - Enfoque Educativo / Beneficios",
            "content": "Texto del mensaje..."
          },
          {
            "title": "Opción 3 - Enfoque Directo a Conversión",
            "content": "Texto del mensaje..."
          }
        ],
        "recommendedHashtags": ["#Tag1", "#Tag2"],
        "callToAction": "Texto recomendado para el botón o palabra clave"
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
    const errorId = captureException(error, { route: '/api/ai/campaign-copy', method: 'POST' });
    if (error instanceof AiConfigurationError) {
      return NextResponse.json(
        { success: false, error: error.message, errorId },
        { status: 503 }
      );
    }
    logger.error('Error in /api/ai/campaign-copy', { motivo: motivo(error) });
    return NextResponse.json(
      {
        success: false,
        error: 'Error al generar copy de campaña con IA',
        errorId,
      },
      { status: 500 }
    );
  }
}