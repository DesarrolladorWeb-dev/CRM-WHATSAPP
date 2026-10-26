'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const BASE =
  'inline-flex items-center justify-center gap-2 font-extrabold rounded-xl transition-all cursor-pointer ' +
  'active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 ' +
  'focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-emerald-600 to-teal-600 text-white ' +
    'shadow-sm shadow-emerald-700/20 ' +
    'hover:from-emerald-700 hover:to-teal-700',

  secondary:
    'bg-slate-100 dark:bg-slate-800 ' +
    'text-slate-700 dark:text-slate-100 ' +
    'hover:bg-slate-200 dark:hover:bg-slate-700 ' +
    'border border-transparent dark:border-slate-700',

  ghost:
    'bg-transparent ' +
    'text-slate-600 dark:text-slate-300 ' +
    'hover:bg-slate-100 dark:hover:bg-slate-800 ' +
    'hover:text-slate-900 dark:hover:text-white',

  danger:
    'bg-red-600 text-white ' +
    'shadow-sm shadow-red-700/20 ' +
    'hover:bg-red-700 dark:hover:bg-red-500',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-xs',
  lg: 'px-5 py-2.5 text-sm',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'md', fullWidth, leftIcon, rightIcon, className, type = 'button', children, ...props },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  )
);

Button.displayName = 'Button';
