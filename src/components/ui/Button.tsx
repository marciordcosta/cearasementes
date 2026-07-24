import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'action' | 'navy';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

// Padrão de cor por intenção, em todo o app: verde = inserir/salvar dado novo,
// vermelho = excluir, laranja = executar uma ação/alternar um modo (não
// insere nada sozinho — dispara um cálculo, um processo, ou troca a visão).
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-[var(--color-accent)] text-white hover:brightness-105',
  outline:
    'bg-transparent text-[var(--color-text)] border border-[var(--color-line)] hover:bg-[var(--color-line)]/40',
  ghost: 'bg-transparent text-[var(--color-text-soft)] hover:text-[var(--color-text)]',
  danger: 'bg-bad text-white hover:brightness-110',
  action: 'bg-[#00000040] text-[var(--color-text)] hover:bg-[#00000059]',
  // Pra usar em cima do Topbar navy (as outras variantes usam --color-text,
  // que fica invisível no navy) — mesmo estilo já usado no ExportDropdown e
  // no botão de tema do Topbar.
  navy: 'bg-transparent text-white border border-white/40 hover:bg-white/12',
};

export function Button({ variant = 'outline', className = '', ...rest }: ButtonProps) {
  return (
    <button
      className={`rounded-md px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  );
}
