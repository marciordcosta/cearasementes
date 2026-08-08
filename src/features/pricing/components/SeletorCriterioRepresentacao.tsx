import { useEffect, useRef, useState } from 'react';
import { ROTULO_CRITERIO_REPRESENTACAO, type CriterioRepresentacao } from '../historicoBi';

interface SeletorCriterioRepresentacaoProps {
  criterio: CriterioRepresentacao;
  ordenarAtivo: boolean;
  onEscolher: (criterio: CriterioRepresentacao) => void;
  onDesativarOrdenacao: () => void;
  /** true = botão sobre fundo escuro (navy), ex. cabeçalho do modal — troca as cores pro botão continuar legível. */
  sobreFundoEscuro?: boolean;
}

const CRITERIOS: CriterioRepresentacao[] = ['valor', 'qtd', 'margem'];

/**
 * Botão + menu que escolhe o critério (Faturamento/Quantidade/Margem Bruta)
 * usado pra calcular a Representação (%) e a tag ABC, e liga/ordena a grade
 * por ele — reaproveitado tanto na tela cheia por canal quanto na barra de
 * ferramentas principal (ver ChannelFullscreenModal.tsx e PricingPage.tsx).
 */
export function SeletorCriterioRepresentacao({ criterio, ordenarAtivo, onEscolher, onDesativarOrdenacao, sobreFundoEscuro }: SeletorCriterioRepresentacaoProps) {
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
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title="Escolher o critério da Representação (%) e ordenar por ele"
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-normal whitespace-nowrap ${
          ordenarAtivo
            ? 'bg-[var(--color-accent)] text-white'
            : sobreFundoEscuro
              ? 'bg-white/15 text-white hover:bg-white/25'
              : 'bg-[var(--color-navy)] text-white hover:brightness-110'
        }`}
      >
        ⇅ Repres. ▾
      </button>
      {aberto && (
        <div className="absolute top-[calc(100%+6px)] right-0 z-[70] min-w-[190px] overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-xl">
          {CRITERIOS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setAberto(false);
                onEscolher(c);
              }}
              className={`block w-full px-3.5 py-2.5 text-left text-sm hover:bg-[var(--color-page)] ${
                ordenarAtivo && criterio === c ? 'font-semibold text-[var(--color-accent)]' : 'text-[var(--color-text)]'
              }`}
            >
              {ordenarAtivo && criterio === c ? '✓ ' : ''}
              {ROTULO_CRITERIO_REPRESENTACAO[c]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setAberto(false);
              onDesativarOrdenacao();
            }}
            className="block w-full border-t border-[var(--color-line)] px-3.5 py-2.5 text-left text-sm text-[var(--color-text-soft)] hover:bg-[var(--color-page)]"
          >
            Ordem padrão (sem ordenar)
          </button>
        </div>
      )}
    </div>
  );
}
