'use client';

import React, { useId } from 'react';
import { cn } from '@/lib/utils';
import { fieldBase, FieldWrapper, describedBy } from './Field';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  hint?: string;
  error?: string;
  containerClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, containerClassName, className, id, required, rows = 3, ...props }, ref) => {
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
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
          className={cn(fieldBase, 'resize-y', error ? 'border-red-300' : 'border-slate-200', className)}
          {...props}
        />
      </FieldWrapper>
    );
  }
);

Textarea.displayName = 'Textarea';
