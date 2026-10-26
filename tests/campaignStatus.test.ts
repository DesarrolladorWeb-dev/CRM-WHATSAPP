import { describe, it, expect } from 'vitest';
import {
  puedeTransicionar,
  esEditable,
  puedeLanzarse,
  esTerminal,
  puedeBorrarse,
  isCampaignStatus,
} from '@/lib/services/campaignStatus';

/**
 * El ciclo de vida de una campana es lo unico que separa «guardar» de
 * «enviar». Estas pruebas fijan las reglas que impiden el peor fallo posible
 * de un CRM de difusion: reenviar la misma promocion a las mismas personas.
 */
describe('campaignStatus — maquina de estados', () => {
  describe('la regla que impide el doble envio', () => {
    it('una campana completada NO se puede relanzar', () => {
      expect(puedeLanzarse('completed')).toBe(false);
      expect(puedeTransicionar('completed', 'running')).toBe(false);
    });

    it('una campana completada no admite ninguna transicion', () => {
      for (const destino of ['draft', 'scheduled', 'running', 'paused', 'failed', 'cancelled'] as const) {
        expect(puedeTransicionar('completed', destino)).toBe(false);
      }
    });

    it('failed y cancelled tambien son terminales', () => {
      expect(esTerminal('failed')).toBe(true);
      expect(esTerminal('cancelled')).toBe(true);
      expect(puedeTransicionar('failed', 'running')).toBe(false);
      expect(puedeTransicionar('cancelled', 'draft')).toBe(false);
    });

    it('una campana en vuelo no se puede volver a lanzar', () => {
      expect(puedeLanzarse('running')).toBe(false);
    });
  });

  describe('transiciones validas', () => {
    it('un borrador se puede programar, lanzar o cancelar', () => {
      expect(puedeTransicionar('draft', 'scheduled')).toBe(true);
      expect(puedeTransicionar('draft', 'running')).toBe(true);
      expect(puedeTransicionar('draft', 'cancelled')).toBe(true);
    });

    it('una campana en vuelo puede pausarse, terminar o fallar', () => {
      expect(puedeTransicionar('running', 'paused')).toBe(true);
      expect(puedeTransicionar('running', 'completed')).toBe(true);
      expect(puedeTransicionar('running', 'failed')).toBe(true);
    });

    it('una campana pausada puede reanudarse', () => {
      expect(puedeTransicionar('paused', 'running')).toBe(true);
    });

    it('un borrador no puede saltar directamente a completada', () => {
      expect(puedeTransicionar('draft', 'completed')).toBe(false);
    });

    it('guardar sin cambiar de estado siempre es valido', () => {
      expect(puedeTransicionar('draft', 'draft')).toBe(true);
      expect(puedeTransicionar('running', 'running')).toBe(true);
    });
  });

  describe('edicion de contenido', () => {
    it('solo se puede editar antes de salir', () => {
      expect(esEditable('draft')).toBe(true);
      expect(esEditable('scheduled')).toBe(true);
    });

    it('no se puede cambiar el texto a mitad de envio', () => {
      // Si se pudiera, media audiencia recibiria un mensaje y la otra media
      // uno distinto, sin rastro de cual recibio cada quien.
      expect(esEditable('running')).toBe(false);
      expect(esEditable('completed')).toBe(false);
    });
  });

  describe('borrado', () => {
    it('no se puede borrar una campana en vuelo o pausada', () => {
      expect(puedeBorrarse('running')).toBe(false);
      expect(puedeBorrarse('paused')).toBe(false);
    });

    it('se puede borrar una que no esta enviando', () => {
      expect(puedeBorrarse('draft')).toBe(true);
      expect(puedeBorrarse('completed')).toBe(true);
      expect(puedeBorrarse('cancelled')).toBe(true);
    });
  });

  describe('isCampaignStatus', () => {
    it('acepta los estados conocidos', () => {
      expect(isCampaignStatus('draft')).toBe(true);
      expect(isCampaignStatus('completed')).toBe(true);
    });

    it('rechaza cualquier otra cosa', () => {
      expect(isCampaignStatus('enviando')).toBe(false);
      expect(isCampaignStatus('')).toBe(false);
      expect(isCampaignStatus(null)).toBe(false);
      expect(isCampaignStatus(42)).toBe(false);
    });
  });
});
