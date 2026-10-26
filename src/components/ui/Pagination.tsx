'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PaginationProps {
  /** Pagina actual (1-indexed). */
  page: number;
  /** Numero total de paginas (>= 1). */
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Total de registros, para el resumen "N clientes". Opcional. */
  total?: number;
  /** Etiqueta del tipo de registro en el resumen. Por defecto "registros". */
  itemLabel?: string;
  className?: string;
}

/**
 * Control de paginacion sencillo (Anterior / indicador / Siguiente).
 * No renderiza nada cuando solo hay una pagina.
 */
export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageCount,
  onPageChange,
  total,
  itemLabel = 'registros',
  className,
}) => {
  if (pageCount <= 1) return null;

  const canPrev = page > 1;
  const canNext = page < pageCount;

  const btn =
  'inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border ' +
  'border-slate-200 dark:border-slate-700 ' +
  'bg-white dark:bg-slate-800 font-extrabold ' +
  'text-slate-700 dark:text-slate-100 ' +
  'hover:bg-slate-50 dark:hover:bg-slate-700 ' +
  'transition-colors cursor-pointer ' +
  'disabled:opacity-40 disabled:pointer-events-none ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40';
  return (
    <nav
      className={cn('flex items-center justify-between gap-3 flex-wrap px-1 py-3 text-xs', className)}
      aria-label="Paginación"
    >
      <span className="text-slate-500 dark:text-slate-400 font-medium">
        Página <span className="font-black text-slate-800 dark:text-slate-100">{page}</span> de{' '}
        <span className="font-black text-slate-800 dark:text-slate-100">{pageCount}</span>
        {typeof total === 'number' && (
          <>
            {' · '}
            <span className="font-bold text-slate-600 dark:text-slate-300">{total.toLocaleString()}</span> {itemLabel}
          </>
        )}
      </span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => canPrev && onPageChange(page - 1)}
          disabled={!canPrev}
          className={btn}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Anterior</span>
        </button>
        <button
          type="button"
          onClick={() => canNext && onPageChange(page + 1)}
          disabled={!canNext}
          className={btn}
        >
          <span>Siguiente</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </nav>
  );
};
