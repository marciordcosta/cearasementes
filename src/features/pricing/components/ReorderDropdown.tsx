import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';

interface ReorderDropdownProps {
  onEscolherCategorias: () => void;
  onEscolherCanais: () => void;
}

/** Antes de abrir o modal de ordenação, deixa escolher se é a ordem das Categorias ou das Tabelas de Preço. */
export function ReorderDropdown({ onEscolherCategorias, onEscolherCanais }: ReorderDropdownProps) {
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

  return (
    <div ref={ref} className="relative">
      <Button variant="primary" onClick={() => setAberto((v) => !v)} title="Defina livremente a ordem de categorias ou tabelas">
        ↕ Ordem Personalizada ▾
      </Button>
      {aberto && (
        <div className="absolute top-[calc(100%+6px)] right-0 z-[70] min-w-[170px] overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-xl">
          <button
            type="button"
            onClick={() => {
              setAberto(false);
              onEscolherCategorias();
            }}
            className="block w-full px-3.5 py-2.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-page)]"
          >
            Categorias
          </button>
          <button
            type="button"
            onClick={() => {
              setAberto(false);
              onEscolherCanais();
            }}
            className="block w-full px-3.5 py-2.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-page)]"
          >
            Tabelas
          </button>
        </div>
      )}
    </div>
  );
}
