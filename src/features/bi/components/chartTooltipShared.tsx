import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { fmtBRL } from '@/lib/format';

// Preto bem transparente, fixo (não segue o tema claro/escuro) — deixa o
// tooltip mais discreto sobre o gráfico, com texto sempre claro por cima.
export const TOOLTIP_BG = 'rgba(10, 10, 12, 0.72)';
export const TOOLTIP_BORDA = 'rgba(255, 255, 255, 0.1)';
export const TOOLTIP_TEXTO = 'rgba(255, 255, 255, 0.92)';
export const TOOLTIP_TEXTO_SUAVE = 'rgba(255, 255, 255, 0.7)';

export interface ItemTooltip {
  key: string;
  label: string;
  color: string;
  valor: number;
  /** % vs. referência — undefined quando o gráfico não tem esse conceito (ex.: por Tabela de Preço) */
  delta?: number | null;
  /** % que este item representa do total somado do mês — usado no gráfico por Tabela de Preço, que não tem "referência" */
  pctTotal?: number;
}

interface ChartTooltipFlutuanteProps {
  containerRef: RefObject<HTMLDivElement>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  children: ReactNode;
}

/**
 * Caixa flutuante do tooltip: fica fixa no canto superior direito do
 * gráfico por padrão (longe do mouse/da linha, que era o incômodo original),
 * mas pode ser arrastada pra qualquer posição — uma vez arrastada, fica nesse
 * lugar até a próxima vez que o usuário mover de novo (não volta sozinha pro
 * canto). Mousedown em cima de um <button> (o quadradinho clicável de cada
 * série) não inicia arraste, senão nunca daria pra clicar nele.
 */
export function ChartTooltipFlutuante({ containerRef, onMouseEnter, onMouseLeave, children }: ChartTooltipFlutuanteProps) {
  const [posicao, setPosicao] = useState<{ x: number; y: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  function iniciarArraste(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    const tooltipEl = tooltipRef.current;
    const containerEl = containerRef.current;
    if (!tooltipEl || !containerEl) return;
    e.preventDefault();

    const tooltipRectInicial = tooltipEl.getBoundingClientRect();
    const offsetX = e.clientX - tooltipRectInicial.left;
    const offsetY = e.clientY - tooltipRectInicial.top;

    // Cancela o auto-esconder assim que o arraste começa e de novo a cada
    // movimento — sem isso, um mouseleave disparado no meio do arraste (fácil
    // de acontecer com o cursor em movimento rápido) apagava o tooltip com
    // ele ainda sendo arrastado.
    onMouseEnter();

    function mover(ev: MouseEvent) {
      onMouseEnter();
      const containerRect = containerEl!.getBoundingClientRect();
      const tooltipRect = tooltipEl!.getBoundingClientRect();
      const x = Math.max(0, Math.min(ev.clientX - containerRect.left - offsetX, containerRect.width - tooltipRect.width));
      const y = Math.max(0, Math.min(ev.clientY - containerRect.top - offsetY, containerRect.height - tooltipRect.height));
      setPosicao({ x, y });
    }
    function soltar() {
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
    }
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
  }

  return (
    <div
      ref={tooltipRef}
      className={`absolute z-10 min-w-[170px] cursor-move select-none rounded-lg border px-3 py-2 text-xs shadow-lg backdrop-blur-[2px] ${posicao ? '' : 'right-3 top-3'}`}
      style={{
        ...(posicao ? { left: posicao.x, top: posicao.y } : {}),
        backgroundColor: TOOLTIP_BG,
        borderColor: TOOLTIP_BORDA,
        color: TOOLTIP_TEXTO,
      }}
      onMouseDown={iniciarArraste}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}

interface LinhaItemTooltipProps {
  item: ItemTooltip;
  clicavel: boolean;
  referencia?: string | null;
  onSelecionar?: (key: string) => void;
  /** Como formatar item.valor — default é moeda (BRL); gráficos de contagem (ex.: nº de envios) passam fmtInt.format. */
  formatarValor?: (v: number) => string;
}

/** Uma linha do tooltip: quadradinho colorido (clicável se `clicavel`) + rótulo + valor + delta opcional. */
export function LinhaItemTooltip({ item, clicavel, referencia, onSelecionar, formatarValor = (v) => fmtBRL.format(v) }: LinhaItemTooltipProps) {
  const ehReferencia = clicavel && item.key === referencia;
  const quadrado = (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-sm"
      style={{ background: item.color, boxShadow: ehReferencia ? `0 0 0 2px ${TOOLTIP_BG}, 0 0 0 3.5px ${item.color}` : 'none' }}
    />
  );

  return (
    <div className="flex items-center gap-1.5">
      {clicavel ? (
        <button
          type="button"
          onClick={() => onSelecionar?.(item.key)}
          title={ehReferencia ? 'Referência atual' : 'Usar como referência'}
          className="flex shrink-0"
        >
          {quadrado}
        </button>
      ) : (
        quadrado
      )}
      <span className="whitespace-nowrap" style={{ color: TOOLTIP_TEXTO_SUAVE }}>
        {item.label}:
      </span>
      <span className="whitespace-nowrap font-medium" style={{ color: TOOLTIP_TEXTO }}>
        {formatarValor(item.valor)}
      </span>
      {item.delta !== null && item.delta !== undefined && (
        <span className="whitespace-nowrap" style={{ color: item.delta >= 0 ? '#3ddc72' : '#ff6b6b' }}>
          {item.delta >= 0 ? '▲' : '▼'} {Math.abs(item.delta).toFixed(1)}%
        </span>
      )}
      {item.pctTotal !== undefined && (
        <span className="whitespace-nowrap" style={{ color: '#8FE3AE' }}>
          {item.pctTotal.toFixed(1)}% do total
        </span>
      )}
    </div>
  );
}
