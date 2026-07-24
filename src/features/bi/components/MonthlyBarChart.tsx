import { useMemo, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { chartChrome } from '@/lib/chartSetup';
import { ChartTooltipFlutuante, LinhaItemTooltip, TOOLTIP_TEXTO, type ItemTooltip } from './chartTooltipShared';

interface MonthlyBarChartProps {
  labels: string[];
  /** Total do mês — desenha a barra. */
  data: number[];
  /** Quebra por Tabela de Preço de cada mês (mesmo índice de labels/data) — só usada no tooltip, a barra continua sendo o total. */
  detalhePorMes: ItemTooltip[][];
  color: string;
  isDark: boolean;
}

interface TooltipState {
  title: string;
  itens: ItemTooltip[];
}

function mesmoTooltip(a: TooltipState | null, b: TooltipState): boolean {
  if (!a) return false;
  return a.title === b.title && a.itens.length === b.itens.length && a.itens.every((it, i) => it.key === b.itens[i].key && it.valor === b.itens[i].valor);
}

/** Barra = total do mês (igual sempre foi); tooltip = quebra por Tabela de Preço daquele mês, mesmo estilo flutuante/arrastável do gráfico "Vendas por Tabela de Preço". */
export function MonthlyBarChart({ labels, data, detalhePorMes, color, isDark }: MonthlyBarChartProps) {
  const c = useMemo(() => chartChrome(isDark), [isDark]);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const escondeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function agendarEsconder() {
    if (escondeTimeout.current) clearTimeout(escondeTimeout.current);
    escondeTimeout.current = setTimeout(() => setTooltip(null), 900);
  }

  function cancelarEsconder() {
    if (escondeTimeout.current) {
      clearTimeout(escondeTimeout.current);
      escondeTimeout.current = null;
    }
  }

  const chartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: 'Valor Líquido',
          data,
          backgroundColor: color,
          borderRadius: 4,
          borderSkipped: false,
          barThickness: 24,
          maxBarThickness: 32,
        },
      ],
    }),
    [labels, data, color],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
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
            const itens = detalhePorMes[dataIndex] ?? [];
            if (itens.length === 0) return;

            const novo: TooltipState = { title: labels[dataIndex], itens };
            setTooltip((atual) => (mesmoTooltip(atual, novo) ? atual : novo));
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: c.text2 } },
        y: { beginAtZero: true, grid: { color: c.grid }, ticks: { display: false }, border: { display: false } },
      },
    }),
    [labels, detalhePorMes, c],
  );

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <Bar data={chartData} options={options} />
      {tooltip && (
        <ChartTooltipFlutuante containerRef={containerRef} onMouseEnter={cancelarEsconder} onMouseLeave={agendarEsconder}>
          <div className="mb-1.5 font-semibold" style={{ color: TOOLTIP_TEXTO }}>
            {tooltip.title}
          </div>
          <div className="space-y-1">
            {tooltip.itens.map((item) => (
              <LinhaItemTooltip key={item.key} item={item} clicavel={false} />
            ))}
          </div>
        </ChartTooltipFlutuante>
      )}
    </div>
  );
}
