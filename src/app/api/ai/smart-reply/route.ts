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
    const { conversationHistory, contactName, channel, stage } = await req.json();

    if (!isAiKeyConfigured()) {
      // Sin clave de Gemini no se puede generar nada a medida, pero el boton no
      // deberia quedarse en blanco. Estas tres sirven para casi cualquier primer
      // contacto y no afirman nada que haya que inventar (ni precios, ni
      // horarios, ni disponibilidad).
      //
      // El nombre solo se usa si parece un nombre: los contactos sin pushName se
      // llaman "+51 ..." o "Contacto WhatsApp" (ver api/whatsapp/ingest.ts), y
      // saludar con "Hola +51 953 740 108" queda peor que no saludar por nombre.
      const nombre = /^\p{L}/u.test((contactName || '').trim()) ? ` ${contactName.trim()}` : '';

      return NextResponse.json({
        success: true,
        data: {
          sentiment: 'neutral',
          suggestedReplies: [
            {
              label: 'Saludo y apertura',
              text: `Hola${nombre}, gracias por escribirnos a Contigo Voy. ¿En qué podemos acompañarte?`
            },
            {
              label: 'Explicar cómo funciona',
              text: `Hola${nombre}, en Contigo Voy hacemos terapia online para niños, adolescentes, adultos, parejas y familias. Cuéntanos qué necesitas y te orientamos.`
            },
            {
              label: 'Proponer reservar cita',
              text: `Hola${nombre}, si quieres podemos agendarte una sesión. Puedes reservar aquí: centropsicologicocontigovoy.com/ReservarCita — y cualquier duda, nos dices.`
            }
          ],
          reasoning: 'Sugerencias genéricas: falta configurar GEMINI_API_KEY en el servidor.'
        }
      });
    }

    const ai = getAiClient();
    const prompt = `
      Escribes mensajes de WhatsApp para el equipo de Contigo Voy, un centro de
      terapia psicológica online que atiende en Perú y Argentina.

      SOBRE EL CENTRO
      - Terapia 100% online para niños, adolescentes, adultos, parejas y familias.
      - También atiende empresas (bienestar emocional de equipos).
      - Su forma de presentarse: "Estamos contigo y para ti", "apoyo a un click
        de distancia", acompañamiento "humano, confidencial y personalizado".
      - Las citas se reservan en centropsicologicocontigovoy.com/ReservarCita

      QUIÉN ESCRIBE Y A QUIÉN
      Escribe una persona del equipo a alguien que ha contactado por WhatsApp.
      Puede ser un paciente nuevo preguntando, alguien en tratamiento, o un
      familiar preguntando por otra persona. Trátalo como alguien que puede
      estar pasando un momento difícil, no como un cliente a convertir.

      TONO
      - Cercano y sereno. Nada de euforia, emojis en exceso ni lenguaje comercial.
      - Nunca presiones para cerrar una venta ni metas ofertas o urgencia.
      - Frases cortas, como las escribiría una persona en WhatsApp.
      - Trata de usted solo si el paciente lo hace primero; por defecto, tutea
        con calidez.

      LÍMITES QUE NO PUEDES CRUZAR
      - NO des diagnósticos, interpretaciones clínicas ni consejo terapéutico.
        Eso es trabajo del psicólogo en sesión.
      - NO inventes precios, duración de las sesiones, horarios, nombres de
        profesionales ni formas de pago: el centro no los publica. Si preguntan
        por eso, ofrece confirmarlo o deriva a la reserva de cita.
      - NO prometas disponibilidad concreta ("mañana a las 5") sin saberla.
      - Si el mensaje sugiere riesgo para la vida o crisis grave, la respuesta
        debe priorizar contacto humano inmediato y recursos de emergencia, sin
        tratar el tema como una consulta comercial.

      LAS 3 OPCIONES
      Genera 3 respuestas que sirvan de verdad para ESTA conversación, no tres
      variaciones de lo mismo. Elige tú los enfoques según lo que pida la
      persona (por ejemplo: resolver la duda concreta, acompañar emocionalmente,
      proponer el siguiente paso, pedir el dato que falta). Pon en "label" un
      nombre corto que describa el enfoque que elegiste.

      DATOS DE ESTA CONVERSACIÓN
      Nombre con el que figura: "${contactName || 'sin nombre'}"
      (si parece un número de teléfono o "Contacto WhatsApp", no lo uses como
      nombre: saluda sin nombre).
      Canal: "${channel || 'whatsapp'}".
      Etapa en el seguimiento: "${stage || 'lead'}".

      Historial reciente (el último mensaje es el más importante):
      ${JSON.stringify(conversationHistory || [], null, 2)}

      Si el historial está vacío o no se entiende qué necesita la persona, que
      las 3 opciones sirvan para abrir conversación y preguntar en qué puedes
      ayudar, en vez de inventar un motivo de consulta.

      RESPONDE EXCLUSIVAMENTE EN FORMATO JSON CON ESTA ESTRUCTURA EXACTA:
      {
        "sentiment": "positive" | "neutral" | "urgent" | "churn_risk",
        "suggestedReplies": [
          { "label": "...", "text": "..." },
          { "label": "...", "text": "..." },
          { "label": "...", "text": "..." }
        ],
        "reasoning": "En una frase, por qué elegiste estos tres enfoques"
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
    const errorId = captureException(error, { route: '/api/ai/smart-reply', method: 'POST' });
    if (error instanceof AiConfigurationError) {
      return NextResponse.json(
        { success: false, error: error.message, errorId },
        { status: 503 }
      );
    }
    logger.error('Error in /api/ai/smart-reply', { motivo: motivo(error) });
    return NextResponse.json(
      {
        success: false,
        error: 'Error al generar respuestas IA',
        errorId,
      },
      { status: 500 }
    );
  }
}