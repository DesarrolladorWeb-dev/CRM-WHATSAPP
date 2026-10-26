import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Une clases condicionales (clsx) y resuelve conflictos de Tailwind (twMerge).
 * Uso: cn('px-2 py-1', isActive && 'bg-emerald-600', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
