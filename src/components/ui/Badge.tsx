import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  /** Cor de fundo fixa (hex) — usado pra categorias com paleta própria, ex.: forma de pagamento. */
  cor?: string;
  /** Variante sem cor fixa, reaproveitando os tons já usados no resto do app. */
  tom?: 'neutro' | 'bom' | 'ruim';
}

const CLASSES_TOM: Record<NonNullable<BadgeProps['tom']>, string> = {
  neutro: 'border border-[var(--color-line)] bg-[var(--color-page)] text-[var(--color-text-soft)]',
  bom: 'bg-good-soft text-good',
  ruim: 'bg-bad-soft text-bad',
};

export function Badge({ children, cor, tom = 'neutro' }: BadgeProps) {
  if (cor) {
    return (
      <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: cor }}>
        {children}
      </span>
    );
  }
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${CLASSES_TOM[tom]}`}>{children}</span>;
}
