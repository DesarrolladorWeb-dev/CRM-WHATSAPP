'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Estilos base compartidos por Input / Textarea / Select para garantizar
 * la misma altura, radio, tipografia y estado de foco en todo el CRM.
 */
export const fieldBase =
  'w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border rounded-xl text-xs font-medium ' +
  'text-slate-900 dark:text-slate-100 ' +
  'placeholder:text-slate-400 dark:placeholder:text-slate-500 ' +
  'transition-colors focus:outline-none ' +
  'focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 ' +
  'dark:focus:border-emerald-500 ' +
  'dark:[color-scheme:dark] ' +
  'disabled:opacity-60 disabled:cursor-not-allowed';
interface FieldWrapperProps {
  id: string;
  label?: React.ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Envoltorio con label + hint + mensaje de error, reutilizado por los 3 controles. */
export const FieldWrapper: React.FC<FieldWrapperProps> = ({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}) => (
  <div className={cn('space-y-1', className)}>
    {label && (
      <label htmlFor={id} className="block font-extrabold text-slate-700 dark:text-slate-300 text-xs">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
    )}
    {children}
    {error ? (
      <p id={`${id}-error`} className="text-[11px] font-semibold text-red-600 dark:text-red-400">
        {error}
      </p>
    ) : hint ? (
      <p id={`${id}-hint`} className="text-[11px] text-slate-400 dark:text-slate-400 font-medium">
        {hint}
      </p>
    ) : null}
  </div>
);

export function describedBy(id: string, hint?: string, error?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}
