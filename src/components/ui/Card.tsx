import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-sm ${className}`}
      {...rest}
    />
  );
}
