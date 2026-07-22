import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Sem isso, qualquer exceção durante o render (ex.: uma biblioteca de
// gráfico que lança antes de terminar de registrar) derruba a árvore
// inteira do React e deixa a página em branco — a Sidebar/Topbar somem
// junto. Com o boundary, só o conteúdo daquela página falha.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary capturou um erro:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-bad/40 bg-bad-soft p-6 text-sm text-[#8F2E2E]">
          <p className="font-semibold">Algo quebrou ao renderizar esta seção.</p>
          <p className="mt-1 text-xs opacity-80">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-3 rounded-md border border-bad/40 px-3 py-1.5 text-xs font-semibold hover:bg-bad/10"
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
