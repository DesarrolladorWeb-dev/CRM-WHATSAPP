'use client';

import React, { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { useModalA11y } from '@/components/ui';

export interface LightboxImage {
  id: string;
  src: string;
  filename?: string;
}

interface MediaLightboxProps {
  images: LightboxImage[];
  /** Índice de la imagen visible; null mantiene el visor cerrado. */
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

// Suscripción vacía para useSyncExternalStore (solo distingue servidor/cliente).
const subscribeNoop = () => () => { };

/**
 * Visor de imágenes a pantalla completa, al estilo de WhatsApp Web: la imagen
 * se abre encima de la aplicación (no en una pestaña nueva), con navegación
 * con flechas, descarga, tira de miniaturas de toda la conversación y cierre
 * con Escape.
 */
export const MediaLightbox: React.FC<MediaLightboxProps> = ({
  images,
  index,
  onClose,
  onIndexChange,
}) => {
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const isOpen = index !== null && index >= 0 && index < images.length;
  // Referencias a las miniaturas para mantener la activa visible en la tira.
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const { panelRef, onKeyDown, onBackdropMouseDown } = useModalA11y<HTMLDivElement>({
    isOpen,
    onClose,
  });

  const goTo = useCallback(
    (delta: number) => {
      if (index === null || images.length < 2) return;
      onIndexChange((index + delta + images.length) % images.length);
    },
    [images.length, index, onIndexChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goTo(-1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goTo(1);
        return;
      }
      onKeyDown(e);
    },
    [goTo, onKeyDown]
  );

  // Al navegar con flechas, la miniatura activa se centra en la tira inferior.
  useEffect(() => {
    if (index === null) return;
    thumbRefs.current[index]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [index]);

  if (!mounted || !isOpen || index === null) return null;

  const current = images[index];
  const filename = current.filename || 'Imagen';
  const isLocalFile = current.src.startsWith('/');
  // Mismo patrón que el botón de descarga de documentos: los archivos servidos
  // por /api/media necesitan ?download=1 para forzar la descarga.
  const downloadHref = isLocalFile ? `${current.src}?download=1` : current.src;

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex flex-col bg-black/85 backdrop-blur-xs animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label={`Visor de imágenes: ${filename}`}
      onMouseDown={onBackdropMouseDown}
    >
      {/* Barra superior: nombre del archivo, descarga y cierre */}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 text-white shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="truncate text-xs font-semibold" title={filename}>
            {filename}
          </p>
          {images.length > 1 && (
            <span className="shrink-0 px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold tabular-nums">
              {index + 1} / {images.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <a
            href={downloadHref}
            download={filename}
            target={isLocalFile ? undefined : '_blank'}
            rel="noopener noreferrer"
            aria-label="Descargar imagen"
            title="Descargar imagen"
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Download className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar visor de imágenes"
            title="Cerrar (Esc)"
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Imagen centrada: ocupa el alto disponible sin deformarse */}
      <div
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onMouseDown={onBackdropMouseDown}
        className="relative flex-1 min-h-0 flex items-center justify-center px-3 pb-4 sm:px-14 focus:outline-none"
      >
        {images.length > 1 && (
          <button
            type="button"
            onClick={() => goTo(-1)}
            aria-label="Imagen anterior"
            title="Imagen anterior (←)"
            className="absolute left-1 sm:left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/50 hover:bg-black/75 text-white/90 hover:text-white border border-white/10 transition-colors cursor-pointer z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <img
          src={current.src}
          alt={filename}
          className="max-h-full max-w-full object-contain select-none rounded-lg shadow-2xl"
          draggable={false}
        />

        {images.length > 1 && (
          <button
            type="button"
            onClick={() => goTo(1)}
            aria-label="Imagen siguiente"
            title="Imagen siguiente (→)"
            className="absolute right-1 sm:right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/50 hover:bg-black/75 text-white/90 hover:text-white border border-white/10 transition-colors cursor-pointer z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Tira de miniaturas: todas las imágenes de la conversación en orden */}
      {images.length > 1 && (
        <div className="shrink-0 border-t border-white/10 bg-black/40 px-3 py-2.5">
          <div className="flex overflow-x-auto thin-scrollbar pb-1">
            <div className="flex items-center gap-2 mx-auto">
              {images.map((img, i) => {
                const isActive = i === index;
                return (
                  <button
                    key={img.id}
                    ref={(el) => {
                      thumbRefs.current[i] = el;
                    }}
                    type="button"
                    onClick={() => onIndexChange(i)}
                    aria-label={`Ver imagen ${i + 1} de ${images.length}`}
                    aria-current={isActive ? 'true' : undefined}
                    title={img.filename || `Imagen ${i + 1}`}
                    className={`relative h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-md overflow-hidden border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                      isActive
                        ? 'border-emerald-400 ring-2 ring-emerald-400/70 opacity-100'
                        : 'border-white/15 opacity-60 hover:opacity-100 hover:border-white/40'
                    }`}
                  >
                    <img
                      src={img.src}
                      alt=""
                      aria-hidden="true"
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};
