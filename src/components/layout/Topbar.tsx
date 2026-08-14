import type { ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/hooks/useTheme';

interface TopbarProps {
  /** Texto simples de título, ou um módulo inteiro (ex.: formulário) no lugar dele — como no original */
  title: ReactNode;
  actions?: ReactNode;
  /** Barra navy fixa (igual à Precificação Inteligente original) em vez do topo claro padrão */
  navy?: boolean;
}

export function Topbar({ title, actions, navy = false }: TopbarProps) {
  const { isDark, toggleTheme } = useTheme();
  const { session, sair } = useAuth();

  return (
    <header
      className={`sticky top-0 z-10 flex items-center justify-between gap-4 py-3.5 pr-6 pl-[92px] ${
        navy ? 'bg-[var(--color-navy)] text-white' : 'border-b border-[var(--color-line)] bg-[var(--color-surface)]/95 text-[var(--color-text)] backdrop-blur'
      }`}
    >
      <div className="min-w-0 flex-1 text-base font-semibold">{title}</div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {session?.user.email &&
          (session.user.user_metadata?.avatar_url ? (
            <img
              src={session.user.user_metadata.avatar_url}
              alt={session.user.email}
              title={session.user.email}
              className={`h-7 w-7 shrink-0 rounded-full ${navy ? 'ring-1 ring-white/40' : 'ring-1 ring-[var(--color-line)]'}`}
            />
          ) : (
            <span
              title={session.user.email}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase ${
                navy ? 'bg-white/15 text-white' : 'bg-[var(--color-page)] text-[var(--color-text-soft)]'
              }`}
            >
              {session.user.email[0]}
            </span>
          ))}
        <button
          type="button"
          onClick={toggleTheme}
          className={
            navy
              ? 'rounded-md border border-white/40 px-3 py-1.5 text-sm text-white hover:bg-white/12'
              : 'rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm text-[var(--color-text-soft)] hover:bg-[var(--color-line)]/40'
          }
        >
          {isDark ? 'Modo claro' : 'Modo escuro'}
        </button>
        <button
          type="button"
          onClick={sair}
          title="Sair"
          className={
            navy
              ? 'rounded-md border border-white/40 px-3 py-1.5 text-sm text-white hover:bg-white/12'
              : 'rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm text-[var(--color-text-soft)] hover:bg-[var(--color-line)]/40'
          }
        >
          Sair
        </button>
      </div>
    </header>
  );
}
