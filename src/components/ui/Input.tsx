'use client';

import React, { useId } from 'react';
import { cn } from '@/lib/utils';
import { fieldBase, FieldWrapper, describedBy } from './Field';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  hint?: string;
  error?: string;
  containerClassName?: string;
  /**
   * Texto fijo pegado dentro del campo, no se puedo modificar el "+51" se lee siempre, sin depender de que el usuario lo escriba bien.
   */
  prefix?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { label, hint, error, containerClassName, className, id, required, prefix, ...props },
    ref
  ) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    // Con prefijo el input se desarma: el recuadro y el foco los pone el
    // contenedor, y el input queda como un campo de texto pelado pegado al
    // `prefix` separado por una linea fina.
    const input = (
      <input
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={cn(
          fieldBase,
          error
            ? 'border-red-300 dark:border-red-700'
            : 'border-slate-200 dark:border-slate-700',
          'dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:scheme-dark',
          className
        )}
        {...props}
      />
    );
    return (
      <FieldWrapper
        id={fieldId}
        label={label}
        hint={hint}
        error={error}
        required={required}
        className={containerClassName}
      >
        {prefix ? (
          <div
            className={cn(
              'flex items-stretch overflow-hidden rounded-xl border bg-white dark:bg-slate-800 transition-colors focus-within:ring-2 focus-within:ring-emerald-500/20',
              error ? error ? 'border-red-300' : 'border-slate-200' : 'border-slate-200 dark:border-slate-700'
            )}
          >
            <span
              className="flex select-none items-center pl-2.5 pr-1.5 text-xs font-medium text-slate-500 dark:text-slate-300"
              aria-hidden="true"
            >
              {prefix}
            </span>
            {/* Separador: una linea de un pixel que dice "aca empieza lo que escribis vos". */}
            <span className="w-px shrink-0 self-stretch bg-slate-200 dark:bg-slate-600" aria-hidden="true" />
            {input}
          </div>
        ) : (
          input
        )}
      </FieldWrapper>
    );
  }
);

Input.displayName = 'Input';
