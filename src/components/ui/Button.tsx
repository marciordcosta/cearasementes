import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-[var(--color-accent)] text-[#04241A] hover:brightness-105',
  outline:
    'bg-transparent text-[var(--color-text)] border border-[var(--color-line)] hover:bg-[var(--color-line)]/40',
  ghost: 'bg-transparent text-[var(--color-text-soft)] hover:text-[var(--color-text)]',
  danger: 'bg-bad text-white hover:brightness-110',
};

export function Button({ variant = 'outline', className = '', ...rest }: ButtonProps) {
  return (
    <button
      className={`rounded-md px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  );
}
