import { useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { chartChrome, criarGridVerticalPontilhado } from '@/lib/chartSetup';
import { ChartTooltipFlutuante, LinhaItemTooltip, TOOLTIP_TEXTO, type ItemTooltip } from './chartTooltipShared';

export interface LinhaSerie {
  key: string;
  label: string;
  data: (number | null)[];
  color: string;
}

interface MultiLineChartProps {
  labels: string[];
  series: LinhaSerie[];
  isDark: boolean;
  /** Como formatar os valores no tooltip — default é moeda (BRL); gráficos de contagem passam fmtInt.format. */
  formatarValor?: (v: number) => string;
}

interface TooltipState {
  title: string;
  itens: ItemTooltip[];
}

function mesmoTooltip(a: TooltipState | null, b: TooltipState): boolean {
  if (!a) return false;
  return a.title === b.title && a.itens.length === b.itens.length && a.itens.every((it, i) => it.key === b.itens[i].key && it.valor === b.itens[i].valor);
}

/** Mesmo tooltip flutuante/arrastável do gráfico por Ano/Safra, mas sem clique-pra-referência (Tabela de Preço não tem esse conceito). */
export function MultiLineChart({ labels, series, isDark, formatarValor }: MultiLineChartProps) {
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
        borderWidth: 2,
      })),
    }),
    [labels, series],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
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

            const valores = series
              .filter((s) => s.data[dataIndex] !== null && s.data[dataIndex] !== undefined)
              .map((s) => ({ key: s.key, label: s.label, color: s.color, valor: s.data[dataIndex] as number }))
              // Maior valor daquele mês sempre em cima.
              .sort((a, b) => b.valor - a.valor);
            const total = valores.reduce((soma, v) => soma + v.valor, 0);
            // Sem "referência" nesse gráfico (as linhas são Tabelas de Preço,
            // não anos) — no lugar do ▲/▼, mostra quanto cada tabela pesa no
            // total vendido naquele mês, de forma discreta.
            const itens: ItemTooltip[] = valores.map((v) => ({ ...v, pctTotal: total > 0 ? (v.valor / total) * 100 : 0 }));

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
    [labels, series, c],
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
              <LinhaItemTooltip key={item.key} item={item} clicavel={false} formatarValor={formatarValor} />
            ))}
          </div>
        </ChartTooltipFlutuante>
      )}
    </div>
  );
}
