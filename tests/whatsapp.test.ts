import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { verificarFirma, resolverChallenge, isWhatsAppConfigured } from '@/lib/whatsapp';

const SECRETO = 'secreto-de-prueba';

function firmar(cuerpo: string, secreto = SECRETO): string {
  return 'sha256=' + createHmac('sha256', secreto).update(cuerpo, 'utf8').digest('hex');
}

// Cuerpos de ejemplo: el contenido exacto no importa, solo que sean estables.
const CUERPO = JSON.stringify({ object: 'whatsapp_business_account' });
const CUERPO_ALTERADO = JSON.stringify({ object: 'otro' });

describe('verificacion de firma de los webhooks de Meta', () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = SECRETO;
  });

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it('acepta una firma valida', () => {
    expect(verificarFirma(CUERPO, firmar(CUERPO))).toBe(true);
  });

  it('rechaza si el cuerpo fue alterado', () => {
    expect(verificarFirma(CUERPO_ALTERADO, firmar(CUERPO))).toBe(false);
  });

  it('rechaza una firma hecha con otro secreto', () => {
    expect(verificarFirma(CUERPO, firmar(CUERPO, 'secreto-ajeno'))).toBe(false);
  });

  it('rechaza si falta la cabecera', () => {
    expect(verificarFirma(CUERPO, null)).toBe(false);
  });

  it('rechaza si la cabecera no lleva el prefijo sha256=', () => {
    const sinPrefijo = firmar(CUERPO).slice('sha256='.length);
    expect(verificarFirma(CUERPO, sinPrefijo)).toBe(false);
  });

  it('rechaza si no hay secreto configurado', () => {
    const firma = firmar(CUERPO);
    delete process.env.WHATSAPP_APP_SECRET;
    expect(verificarFirma(CUERPO, firma)).toBe(false);
  });
});

describe('challenge del alta del webhook', () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'token-esperado';
  });

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it('devuelve el challenge cuando el token coincide', () => {
    const p = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'token-esperado',
      'hub.challenge': '1234567890',
    });
    expect(resolverChallenge(p)).toBe('1234567890');
  });

  it('devuelve null si el token no coincide', () => {
    const p = new URLSearchParams({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'token-incorrecto',
      'hub.challenge': '123',
    });
    expect(resolverChallenge(p)).toBeNull();
  });

  it('devuelve null si el modo no es subscribe', () => {
    const p = new URLSearchParams({
      'hub.mode': 'unsubscribe',
      'hub.verify_token': 'token-esperado',
      'hub.challenge': '123',
    });
    expect(resolverChallenge(p)).toBeNull();
  });
});

describe('isWhatsAppConfigured', () => {
  const envOriginal = { ...process.env };
  afterEach(() => { process.env = { ...envOriginal }; });

  it('false si faltan credenciales', () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    expect(isWhatsAppConfigured()).toBe(false);
  });

  it('true con ambas presentes', () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
    expect(isWhatsAppConfigured()).toBe(true);
  });
});
