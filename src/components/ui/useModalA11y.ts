'use client';

import { useCallback, useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface UseModalA11yOptions {
  isOpen: boolean;
  onClose: () => void;
  /** Cerrar al pulsar Escape. Por defecto true. */
  closeOnEscape?: boolean;
  /** Cerrar al hacer click fuera del panel. Por defecto true. */
  closeOnBackdrop?: boolean;
  /** Elemento que recibe el foco al abrir (por defecto, el propio panel). */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Comportamiento de accesibilidad compartido por todos los modales:
 * bloqueo de scroll del body, foco inicial + restauracion al cerrar,
 * cierre con Escape, trampa de foco (Tab) y cierre por click en el backdrop.
 *
 * Uso:
 *   const { panelRef, onKeyDown, onBackdropMouseDown } = useModalA11y({ isOpen, onClose });
 *   <div onMouseDown={onBackdropMouseDown}>
 *     <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} onKeyDown={onKeyDown}>
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>({
  isOpen,
  onClose,
  closeOnEscape = true,
  closeOnBackdrop = true,
  initialFocusRef,
}: UseModalA11yOptions) {
  const panelRef = useRef<T>(null);
  const lastActiveRef = useRef<HTMLElement | null>(null);

  // Bloqueo de scroll del body + foco inicial + restauracion de foco al cerrar.
  useEffect(() => {
    if (!isOpen) return;
    lastActiveRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTarget = initialFocusRef?.current ?? panelRef.current;
    focusTarget?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      lastActiveRef.current?.focus?.();
    };
  }, [isOpen, initialFocusRef]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      // Trampa de foco: mantener el Tab dentro del panel.
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [closeOnEscape, onClose]
  );

  const onBackdropMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (closeOnBackdrop && e.target === e.currentTarget) onClose();
    },
    [closeOnBackdrop, onClose]
  );

  return { panelRef, onKeyDown, onBackdropMouseDown };
}
