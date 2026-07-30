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
    <div className="flex h-screen flex-col bg-[var(--color-page)]">
      {!hideTopbar && <Topbar title={title} actions={actions} navy={topbarNavy} />}
      {/* min-h-0 é o que permite o <main> abaixo rolar sozinho (overflow-y-auto)
          em vez de esticar a linha inteira além da altura disponível — clássica
          pegadinha do flexbox sem isso. */}
      <div className="flex min-h-0 flex-1">
        <Sidebar mostrarParametrizacao={mostrarParametrizacao} onAbrirParametrizacao={onAbrirParametrizacao} />
        <main className="min-w-0 flex-1 space-y-8 overflow-y-auto px-6 py-6">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
