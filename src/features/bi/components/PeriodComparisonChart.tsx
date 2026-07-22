import { useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { chartChrome, criarGridVerticalPontilhado } from '@/lib/chartSetup';
import { ChartTooltipFlutuante, LinhaItemTooltip, TOOLTIP_TEXTO, type ItemTooltip } from './chartTooltipShared';

export interface SeriePeriodo {
  /** chave estável do período (ex.: "2025" ou "2024/2025") — não é o rótulo exibido */
  key: string;
  label: string;
  data: (number | null)[];
  color: string;
}

interface TooltipState {
  title: string;
  itens: ItemTooltip[];
}

interface PeriodComparisonChartProps {
  labels: string[];
  series: SeriePeriodo[];
  isDark: boolean;
  referencia: string | null;
  onSelecionarReferencia: (key: string) => void;
}

function mesmoTooltip(a: TooltipState | null, b: TooltipState): boolean {
  if (!a) return false;
  return a.title === b.title && a.itens.length === b.itens.length && a.itens.every((it, i) => it.key === b.itens[i].key && it.valor === b.itens[i].valor && it.delta === b.itens[i].delta);
}

/**
 * Gráfico de linha por Ano/Safra com um recurso que o MultiLineChart genérico
 * não tem: clicar numa linha (ou no quadradinho dela dentro do tooltip)
 * marca aquele período como "referência" — os demais passam a mostrar a
 * diferença percentual (▲/▼) em relação a ele, no mesmo estilo do antigo
 * indicador de comparação da tabela (removido antes em favor deste gráfico).
 * O tooltip é customizado (HTML, não o canvas nativo do Chart.js) porque
 * precisa ter um elemento de verdade pra capturar o clique no quadradinho e
 * pra poder ser arrastado (ver ChartTooltipFlutuante).
 *
 * `data`/`options`/`plugins` do <Line> são memoizados SEM depender do estado
 * do tooltip — senão cada hover chama setTooltip, isso recria as props do
 * gráfico, o react-chartjs-2 reaplica via chart.update(), o Chart.js
 * reafirma o tooltip ativo durante o redraw, e o external plugin dispara de
 * novo → loop infinito de "Maximum update depth exceeded".
 */
export function PeriodComparisonChart({ labels, series, isDark, referencia, onSelecionarReferencia }: PeriodComparisonChartProps) {
  const c = useMemo(() => chartChrome(isDark), [isDark]);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const escondeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function agendarEsconder() {
    if (escondeTimeout.current) clearTimeout(escondeTimeout.current);
    // Tempo generoso: o tooltip fica fixo num canto, longe da linha — precisa
    // de espaço pro mouse "viajar" até lá (pra ler com calma ou arrastar)
    // sem que ele suma no meio do caminho.
    escondeTimeout.current = setTimeout(() => setTooltip(null), 900);
  }

  function cancelarEsconder() {
    if (escondeTimeout.current) {
      clearTimeout(escondeTimeout.current);
      escondeTimeout.current = null;
    }
  }

  const data = useMemo(
    () => ({
      labels,
      datasets: series.map((s) => ({
        label: s.label,
        data: s.data,
        borderColor: s.color,
        backgroundColor: s.color,
        pointBackgroundColor: s.color,
        spanGaps: false,
        tension: 0.25,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: s.key === referencia ? 3.5 : 2,
      })),
    }),
    [labels, series, referencia],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      onHover: (_evt: unknown, _elements: unknown, chart: { canvas: HTMLCanvasElement }) => {
        chart.canvas.style.cursor = 'pointer';
      },
      // Com interaction.mode "index", um clique numa coluna de mês retorna UM
      // elemento por linha que passa ali — não só a "mais próxima" no sentido
      // que o Chart.js prioriza por padrão. Onde as linhas se cruzam ou se
      // sobrepõem, sem esse ajuste o clique sempre pegava a primeira da lista
      // (a de índice 0), nunca a que estava visualmente por baixo naquele
      // ponto. Aqui escolhemos, dentre as retornadas, a mais próxima da
      // posição vertical (y) de onde o usuário realmente clicou.
      onClick: (evt: { y: number | null }, elements: { datasetIndex: number; element: { y: number } }[]) => {
        if (elements.length === 0) return;
        let escolhido = elements[0];
        if (elements.length > 1 && evt.y !== null) {
          escolhido = elements.reduce((maisProximo, atual) => (Math.abs(atual.element.y - evt.y!) < Math.abs(maisProximo.element.y - evt.y!) ? atual : maisProximo));
        }
        const key = series[escolhido.datasetIndex]?.key;
        if (key) onSelecionarReferencia(key);
      },
      plugins: {
        legend: { position: 'bottom' as const, labels: { color: c.text2, boxWidth: 12, boxHeight: 12 } },
        tooltip: {
          enabled: false,
          external: (context: { tooltip: { opacity: number; dataPoints?: { dataIndex: number }[] } }) => {
            const tm = context.tooltip;
            if (!tm || tm.opacity === 0) {
              agendarEsconder();
              return;
            }
            cancelarEsconder();
            const dataIndex = tm.dataPoints?.[0]?.dataIndex;
            if (dataIndex === undefined) return;

            const serieRef = series.find((s) => s.key === referencia);
            const valorRef = serieRef ? serieRef.data[dataIndex] : null;
            const itens: ItemTooltip[] = series
              .filter((s) => s.data[dataIndex] !== null && s.data[dataIndex] !== undefined)
              .map((s) => {
                const valor = s.data[dataIndex] as number;
                let delta: number | null = null;
                if (referencia && s.key !== referencia && valorRef !== null && valorRef !== undefined && valorRef !== 0) {
                  delta = ((valor - valorRef) / valorRef) * 100;
                }
                return { key: s.key, label: s.label, color: s.color, valor, delta };
              })
              // Ano/safra mais recente sempre em cima, independente da ordem das linhas no gráfico.
              .sort((a, b) => b.key.localeCompare(a.key));

            const novo: TooltipState = { title: labels[dataIndex], itens };
            setTooltip((atual) => (mesmoTooltip(atual, novo) ? atual : novo));
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: c.text2 }, border: { display: false } },
        y: { beginAtZero: true, grid: { color: c.grid }, ticks: { display: false }, border: { display: false } },
      },
    }),
    [labels, series, referencia, onSelecionarReferencia, c],
  );

  const plugins = useMemo(() => [criarGridVerticalPontilhado(c.grid)], [c.grid]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <Line data={data} options={options} plugins={plugins} />
      {tooltip && (
        <ChartTooltipFlutuante containerRef={containerRef} onMouseEnter={cancelarEsconder} onMouseLeave={agendarEsconder}>
          <div className="mb-1.5 font-semibold" style={{ color: TOOLTIP_TEXTO }}>
            {tooltip.title}
          </div>
          <div className="space-y-1">
            {tooltip.itens.map((item) => (
              <LinhaItemTooltip key={item.key} item={item} clicavel referencia={referencia} onSelecionar={onSelecionarReferencia} />
            ))}
          </div>
        </ChartTooltipFlutuante>
      )}
    </div>
  );
}
