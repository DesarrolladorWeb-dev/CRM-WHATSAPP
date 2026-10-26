import { describe, it, expect } from 'vitest';
import { getChannelAdapter, listChannelAdapters } from '@/lib/services/channels';
import { renderTemplate, resumirExclusiones } from '@/lib/services/audienceService';
import type { AudienceExclusion } from '@/types';

/**
 * Whato es omnicanal: la misma campana puede salir por cinco canales que se
 * diferencian en de donde sale la direccion del destinatario. Estas pruebas
 * fijan esa tabla, que es la unica parte del envio especifica de cada red.
 */
describe('registro de canales', () => {
  it('cubre los cinco canales del CRM', () => {
    expect(listChannelAdapters().map((a) => a.id).sort()).toEqual([
      'email',
      'instagram',
      'messenger',
      'twitter',
      'whatsapp',
    ]);
  });

  it('devuelve null para un canal inexistente', () => {
    expect(getChannelAdapter('tiktok')).toBeNull();
    expect(getChannelAdapter('')).toBeNull();
  });

  describe('WhatsApp usa el telefono', () => {
    const whatsapp = getChannelAdapter('whatsapp')!;

    it('normaliza el numero quitando simbolos', () => {
      expect(whatsapp.resolveAddress({ phone: '+51 987 654 321' })).toBe('51987654321');
    });

    it('descarta un numero demasiado corto para ser real', () => {
      expect(whatsapp.resolveAddress({ phone: '12345' })).toBeNull();
    });

    it('descarta un contacto sin telefono aunque tenga handle', () => {
      expect(whatsapp.resolveAddress({ phone: null, handle: '@maria' })).toBeNull();
    });
  });

  describe('Instagram, X y Messenger usan el handle', () => {
    for (const id of ['instagram', 'twitter', 'messenger'] as const) {
      it(`${id} quita la arroba inicial`, () => {
        const adapter = getChannelAdapter(id)!;
        expect(adapter.resolveAddress({ handle: '@maria_gomez' })).toBe('maria_gomez');
      });

      it(`${id} descarta un handle vacio`, () => {
        const adapter = getChannelAdapter(id)!;
        expect(adapter.resolveAddress({ handle: '   ' })).toBeNull();
      });
    }
  });

  describe('email valida la direccion', () => {
    const email = getChannelAdapter('email')!;

    it('acepta una direccion valida y la normaliza', () => {
      expect(email.resolveAddress({ email: '  Maria@Empresa.COM ' })).toBe('maria@empresa.com');
    });

    it('rechaza texto que no es un email', () => {
      expect(email.resolveAddress({ email: 'maria-arroba-empresa' })).toBeNull();
    });
  });

  describe('canales sin transporte', () => {
    it('nunca dan un envio por bueno', async () => {
      // Es la garantia de que un canal sin conectar produce 'skipped' y no un
      // falso 'enviado'. Dar por enviado lo que no salio es la peor mentira
      // posible en un CRM.
      for (const id of ['instagram', 'twitter', 'messenger', 'email'] as const) {
        const adapter = getChannelAdapter(id)!;
        const res = await adapter.send('destino', 'hola');
        expect(res.ok).toBe(false);
      }
    });
  });
});

describe('personalizacion del mensaje', () => {
  const contacto = {
    id: 'c1',
    name: 'Maria Gomez',
    company: 'Innovatech',
    channel: 'whatsapp',
    address: '51987654321',
  };

  it('sustituye nombre, empresa y canal', () => {
    expect(renderTemplate('Hola {nombre} de {empresa} por {canal}', contacto)).toBe(
      'Hola Maria Gomez de Innovatech por whatsapp'
    );
  });

  it('sustituye todas las apariciones de una misma variable', () => {
    expect(renderTemplate('{nombre}, te repito {nombre}', contacto)).toBe(
      'Maria Gomez, te repito Maria Gomez'
    );
  });

  it('deja vacia la empresa si el contacto no tiene', () => {
    expect(renderTemplate('Hola {nombre} de {empresa}', { ...contacto, company: null })).toBe(
      'Hola Maria Gomez de '
    );
  });

  it('no toca un texto sin variables', () => {
    expect(renderTemplate('Oferta del 20%', contacto)).toBe('Oferta del 20%');
  });
});

describe('resumen de exclusiones', () => {
  it('agrupa por motivo para poder explicarlo en el dialogo', () => {
    const excluidos: AudienceExclusion[] = [
      { contactId: '1', name: 'A', reason: 'sin_direccion' },
      { contactId: '2', name: 'B', reason: 'baja_difusion' },
      { contactId: '3', name: 'C', reason: 'otro_canal' },
      { contactId: '4', name: 'D', reason: 'otro_canal' },
    ];

    expect(resumirExclusiones(excluidos)).toEqual({
      sinDireccion: 1,
      bajaDifusion: 1,
      otroCanal: 2,
    });
  });

  it('devuelve ceros si no hay excluidos', () => {
    expect(resumirExclusiones([])).toEqual({ sinDireccion: 0, bajaDifusion: 0, otroCanal: 0 });
  });
});
