import { GoogleGenAI } from '@google/genai';

/**
 * Modelo de Gemini que usan todas las rutas de /api/ai.
 *
 * Estaba repetido en las cuatro rutas, asi que cambiarlo obligaba a tocar
 * cuatro archivos. Se puede sobreescribir con GEMINI_MODEL sin tocar codigo,
 * util para probar un modelo distinto en un entorno concreto.
 *
 * Los estables de la familia Flash hoy son gemini-3.8-flash, gemini-3.7-flash,
 * gemini-3.6-flash y gemini-3.5-flash (ver ai.google.dev/gemini-api/docs/models).
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

export function isAiKeyConfigured(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'tu_clave_aqui_placeholder') { // ajusta al placeholder real
    return false;
  }
  return apiKey.startsWith('AIza') || apiKey.startsWith('AQ.');
}

export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiConfigurationError';
  }
}

// Comprueba la configuracion local; no verifica acceso ni disponibilidad en Google.
export function isAiConfigured(): boolean {
  return isAiKeyConfigured() && Boolean(process.env.GEMINI_MODEL?.trim());
}

export function getAiModel(): string {
  const model = process.env.GEMINI_MODEL?.trim();
  if (!model) {
    throw new AiConfigurationError('Falta configurar GEMINI_MODEL en el servidor.');
  }
  return model;
}

export function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!isAiKeyConfigured()) {
    throw new Error('GEMINI_API_KEY system secret is required.');
  }
  return new GoogleGenAI({
    apiKey, 
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });
}
