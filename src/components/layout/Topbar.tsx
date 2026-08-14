import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/hooks/useTheme';

interface TopbarProps {
  /** Texto simples de título, ou um módulo inteiro (ex.: formulário) no lugar dele — como no original */
  title: ReactNode;
  actions?: ReactNode;
  /** Barra navy fixa (igual à Precificação Inteligente original) em vez do topo claro padrão */
  navy?: boolean;
}

function ThemeToggleButton({ navy }: { navy: boolean }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${
        navy ? 'border-white/40 text-white hover:bg-white/12' : 'border-[var(--color-line)] text-[var(--color-text-soft)] hover:bg-[var(--color-line)]/40'
      }`}
    >
      {isDark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

function UserMenu({ navy }: { navy: boolean }) {
  const { session, sair } = useAuth();
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('click', fechar);
    return () => document.removeEventListener('click', fechar);
  }, [aberto]);

  const email = session?.user.email;
  if (!email) return null;
  const avatarUrl = session.user.user_metadata?.avatar_url as string | undefined;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAberto((v) => !v)} title={email} className="block shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt={email} className={`h-8 w-8 rounded-full ${navy ? 'ring-1 ring-white/40' : 'ring-1 ring-[var(--color-line)]'}`} />
        ) : (
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold uppercase ${
              navy ? 'bg-white/15 text-white' : 'bg-[var(--color-page)] text-[var(--color-text-soft)]'
            }`}
          >
            {email[0]}
          </span>
        )}
      </button>
      {aberto && (
        <div className="absolute top-[calc(100%+6px)] right-0 z-[70] min-w-[190px] overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-xl">
          <p className="truncate border-b border-[var(--color-line)] px-3.5 py-2 text-xs text-[var(--color-text-soft)]" title={email}>
            {email}
          </p>
          <button
            type="button"
            onClick={() => {
              setAberto(false);
              sair();
            }}
            className="block w-full px-3.5 py-2.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-page)]"
          >
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

export function Topbar({ title, actions, navy = false }: TopbarProps) {
  return (
    <header
      className={`sticky top-0 z-10 flex items-center justify-between gap-4 py-3.5 pr-6 pl-[92px] ${
        navy ? 'bg-[var(--color-navy)] text-white' : 'border-b border-[var(--color-line)] bg-[var(--color-surface)]/95 text-[var(--color-text)] backdrop-blur'
      }`}
    >
      <div className="min-w-0 flex-1 text-base font-semibold">{title}</div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <ThemeToggleButton navy={navy} />
        <UserMenu navy={navy} />
      </div>
    </header>
  );
}
