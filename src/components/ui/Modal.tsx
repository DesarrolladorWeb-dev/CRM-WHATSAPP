'use client';

import React, { useId, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useModalA11y } from './useModalA11y';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
  /** Cerrar al hacer click fuera del panel. Por defecto true. */
  closeOnBackdrop?: boolean;
  /** Cerrar al pulsar Escape. Por defecto true. */
  closeOnEscape?: boolean;
  /** Ocultar la X de la cabecera. */
  hideCloseButton?: boolean;
  /** Elemento que recibe el foco al abrir (por defecto, el propio panel). */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

// Suscripción vacía para useSyncExternalStore (solo distingue servidor/cliente).
const subscribeNoop = () => () => { };

const SIZES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-3xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEscape = true,
  hideCloseButton = false,
  initialFocusRef,
  className,
}) => {
  // true solo en el cliente ya hidratado: createPortal necesita `document`.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const titleId = useId();
  const descId = useId();

  const { panelRef, onKeyDown, onBackdropMouseDown } = useModalA11y<HTMLDivElement>({
    isOpen,
    onClose,
    closeOnEscape,
    closeOnBackdrop,
    initialFocusRef,
  });

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs animate-fadeIn"      onMouseDown={onBackdropMouseDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          'w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 outline-none text-slate-800 dark:text-slate-100',
          'max-h-[92vh] overflow-y-auto animate-modalIn',
          SIZES[size],
          className
        )}
      >
        {(title || !hideCloseButton) && (
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-700 p-5 pb-3">            <div className="flex items-start gap-2.5 min-w-0">
              {icon && (
                <div className="w-9 h-9 shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-800">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                {title && (
                  <h3 id={titleId} className="font-black text-base text-slate-900 dark:text-slate-100">
                    {title}
                  </h3>
                )}
                {description && (
                  <p id={descId} className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                    {description}
                  </p>
                )}
              </div>
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        <div className="p-5">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-700 p-5 pt-3">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
};
