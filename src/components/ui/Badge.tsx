'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'neutral' | 'slate' | 'emerald' | 'blue' | 'amber' | 'red' | 'indigo' | 'pink' | 'sky';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  slate: 'bg-slate-100 text-slate-800 border-slate-200',
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  blue: 'bg-blue-50 text-blue-800 border-blue-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  red: 'bg-red-50 text-red-800 border-red-200',
  indigo: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  pink: 'bg-pink-50 text-pink-800 border-pink-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ tone = 'neutral', className, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border whitespace-nowrap',
        TONES[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
);

Badge.displayName = 'Badge';
