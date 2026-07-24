import { useEffect, useMemo, useRef, useState } from 'react';

function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

export interface OpcaoAutocomplete {
  valor: string;
  /** Texto curto exibido no canto direito da sugestão (ex.: UF da cidade). */
  meta?: string;
}

/**
 * Campo de texto com uma lista translúcida de sugestões logo abaixo — troca
 * o `<input list> + <datalist>` nativo (feio, sem estilo possível, cada
 * navegador desenha diferente) por algo que segue a cara do resto do app.
 * Compartilhado entre a Cotação de Frete (produto/cidade única) e a Rota de
 * Frota Própria (cidade da rota).
 */
export function AutocompleteInput({
  value,
  onChangeTexto,
  opcoes,
  onSelecionar,
  placeholder,
  className,
}: {
  value: string;
  onChangeTexto: (valor: string) => void;
  opcoes: OpcaoAutocomplete[];
  /** Chamado ao clicar (ou dar Enter) numa sugestão — por padrão só preenche o texto. */
  onSelecionar?: (opcao: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  const filtradas = useMemo(() => {
    const termo = normalizarBusca(value);
    const lista = termo ? opcoes.filter((o) => normalizarBusca(o.valor).includes(termo)) : opcoes;
    return lista.slice(0, 8);
  }, [value, opcoes]);

  function selecionar(opcao: string) {
    (onSelecionar ?? onChangeTexto)(opcao);
    setAberto(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChangeTexto(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && filtradas.length > 0) selecionar(filtradas[0].valor);
          if (e.key === 'Escape') setAberto(false);
        }}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {aberto && filtradas.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-[var(--color-line)] bg-[var(--color-surface)]/90 shadow-lg backdrop-blur-sm">
          {filtradas.map((op) => (
            <button
              key={op.valor}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selecionar(op.valor)}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-accent)]/15"
            >
              <span>{op.valor}</span>
              {op.meta && <span className="text-xs text-[var(--color-text-soft)]">{op.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
