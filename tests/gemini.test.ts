import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AiConfigurationError, getAiModel, isAiConfigured } from '@/lib/gemini';

describe('isAiConfigured', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'AIzaSyExampleKeyParaPruebas123456789');
    vi.stubEnv('GEMINI_MODEL', 'modelo-de-prueba');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('devuelve false si no hay clave', () => {
    delete process.env.GEMINI_API_KEY;
    expect(isAiConfigured()).toBe(false);
  });

  it('devuelve false con el placeholder del .env.example', () => {
    process.env.GEMINI_API_KEY = 'tu_api_key_de_google_ai';
    expect(isAiConfigured()).toBe(false);
  });

  it('devuelve false si no empieza por AIza', () => {
    process.env.GEMINI_API_KEY = 'clave-inventada-123';
    expect(isAiConfigured()).toBe(false);
  });

  it('devuelve true con una clave con formato valido', () => {
    process.env.GEMINI_API_KEY = 'AIzaSyExampleKeyParaPruebas123456789';
    expect(isAiConfigured()).toBe(true);
  });

  it.each([undefined, '', '   '])('requiere un modelo no vacio (%s)', (model) => {
    vi.stubEnv('GEMINI_MODEL', model);
    expect(isAiConfigured()).toBe(false);
    expect(() => getAiModel()).toThrow(AiConfigurationError);
    expect(() => getAiModel()).toThrow('GEMINI_MODEL');
  });

  it('lee el modelo del entorno y elimina espacios exteriores', () => {
    vi.stubEnv('GEMINI_MODEL', '  modelo-a  ');
    expect(getAiModel()).toBe('modelo-a');
    vi.stubEnv('GEMINI_MODEL', 'modelo-b');
    expect(getAiModel()).toBe('modelo-b');
  });
});
