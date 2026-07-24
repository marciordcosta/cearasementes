import type { ReactNode } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface AppShellProps {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  topbarNavy?: boolean;
  /** Esconde a barra superior inteira — útil quando a página atual não usa o que ela oferece */
  hideTopbar?: boolean;
  /** A página atual tem uma parametrização/configuração própria — mostra a engrenagem no menu lateral. */
  mostrarParametrizacao?: boolean;
  /** Chamado ao clicar na engrenagem do menu lateral — a página decide o que abrir (normalmente um modal). */
  onAbrirParametrizacao?: () => void;
}

export function AppShell({ title, actions, children, topbarNavy = false, hideTopbar = false, mostrarParametrizacao, onAbrirParametrizacao }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-[var(--color-page)]">
      <Sidebar mostrarParametrizacao={mostrarParametrizacao} onAbrirParametrizacao={onAbrirParametrizacao} />
      <div className="flex min-w-0 flex-1 flex-col">
        {!hideTopbar && <Topbar title={title} actions={actions} navy={topbarNavy} />}
        <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-6 py-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
