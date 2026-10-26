import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  requireUserPermission: vi.fn(),
  enforceAiRateLimit: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent };
  },
}));
vi.mock('@/lib/auth', () => ({ requireUserPermission: mocks.requireUserPermission }));
vi.mock('@/lib/rateLimit', () => ({ enforceAiRateLimit: mocks.enforceAiRateLimit }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
  motivo: () => 'error de prueba',
  captureException: vi.fn(() => 'test-error-id'),
}));

import { POST as summarize } from '@/app/api/ai/summarize/route';
import { POST as smartReply } from '@/app/api/ai/smart-reply/route';
import { POST as campaignCopy } from '@/app/api/ai/campaign-copy/route';
import { POST as chatbotAutorespond } from '@/app/api/ai/chatbot-autorespond/route';

describe.each([
  ['summarize', summarize],
  ['smart-reply', smartReply],
  ['campaign-copy', campaignCopy],
  ['chatbot-autorespond', chatbotAutorespond],
] as const)('/api/ai/%s', (scope, post) => {
  function request() {
    return new NextRequest(`http://localhost/api/ai/${scope}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactName: 'Prueba', incomingMessage: 'Hola' }),
    });
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('GEMINI_API_KEY', 'AIzaSyExampleKeyParaPruebas123456789');
    vi.stubEnv('GEMINI_MODEL', 'modelo-configurado-en-entorno');
    mocks.requireUserPermission.mockResolvedValue(null);
    mocks.enforceAiRateLimit.mockResolvedValue(null);
    mocks.generateContent.mockResolvedValue({ text: '{"resultado":"ok"}' });
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  it('envia el modelo configurado al SDK y conserva la respuesta JSON', async () => {
    const response = await post(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { resultado: 'ok' } });
    expect(mocks.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'modelo-configurado-en-entorno',
      config: { responseMimeType: 'application/json' },
    }));
    expect(mocks.requireUserPermission).toHaveBeenCalledWith(expect.any(NextRequest), 'write');
    expect(mocks.enforceAiRateLimit).toHaveBeenCalledWith(expect.any(NextRequest), 'generalAI');
  });

  it.each([undefined, '', '   '])('devuelve 503 si falta el modelo (%s)', async (model) => {
    vi.stubEnv('GEMINI_MODEL', model);
    const response = await post(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Falta configurar GEMINI_MODEL en el servidor.',
      errorId: 'test-error-id',
    });
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('conserva las respuestas de ejemplo cuando no hay clave', async () => {
    vi.stubEnv('GEMINI_API_KEY', undefined);
    vi.stubEnv('GEMINI_MODEL', undefined);
    const response = await post(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: expect.any(Object) });
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('respeta el rechazo de autenticacion', async () => {
    mocks.requireUserPermission.mockResolvedValue(NextResponse.json({ success: false }, { status: 401 }));
    expect((await post(request())).status).toBe(401);
    expect(mocks.enforceAiRateLimit).not.toHaveBeenCalled();
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('respeta el limite de solicitudes', async () => {
    mocks.enforceAiRateLimit.mockResolvedValue(NextResponse.json({ success: false }, { status: 429 }));
    expect((await post(request())).status).toBe(429);
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });
});
