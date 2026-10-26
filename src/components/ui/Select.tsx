'use client';

import React, { useId } from 'react';
import { cn } from '@/lib/utils';
import { fieldBase, FieldWrapper, describedBy } from './Field';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: React.ReactNode;
  hint?: string;
  error?: string;
  containerClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, error, containerClassName, className, id, required, children, ...props }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <FieldWrapper
        id={fieldId}
        label={label}
        hint={hint}
        error={error}
        required={required}
        className={containerClassName}
      >
        <select
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
          className={cn(
            fieldBase,
            'font-bold cursor-pointer',
            error ? 'border-red-300' : 'border-slate-200',
            className
          )}
          {...props}
        >
          {children}
        </select>
      </FieldWrapper>
    );
  }
);

Select.displayName = 'Select';
