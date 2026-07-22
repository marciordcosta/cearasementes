import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { chartChrome, palette } from '@/lib/chartSetup';
import { fmtInt, MESES_PT } from '@/lib/format';
import { getPeriodKeyFor, type PeriodContext } from '../calculations';
import type { CarrierAgg } from '../types';

const TOP_CARRIERS = 5;

interface CarrierMonthlyChartProps {
  ctx: PeriodContext;
  carriers: Map<string, CarrierAgg>;
  selectedPeriod: string;
  isDark: boolean;
}

export function CarrierMonthlyChart({ ctx, carriers, selectedPeriod, isDark }: CarrierMonthlyChartProps) {
  const colors = palette(isDark);
  const c = chartChrome(isDark);

  const { labels, datasets } = useMemo(() => {
    const allNames = Array.from(carriers.keys());
    const carrierColor = (name: string) => colors[allNames.indexOf(name) % colors.length];

    const scoped = allNames
      .map((name) => {
        const carrier = carriers.get(name)!;
        const monthly = new Map<string, number>();
        carrier.monthly.forEach((m, key) => {
          const [y, mo] = key.split('-');
          if (selectedPeriod === 'all' || getPeriodKeyFor(ctx, Number(y), Number(mo)) === selectedPeriod) {
            monthly.set(key, m.pedidos);
          }
        });
        const total = Array.from(monthly.values()).reduce((s, v) => s + v, 0);
        return { name, monthly, total };
      })
      .filter((c) => c.total > 0);

    if (scoped.length === 0) return { labels: [] as string[], datasets: [] };

    scoped.sort((a, b) => b.total - a.total);
    const top = scoped.slice(0, TOP_CARRIERS);
    const rest = scoped.slice(TOP_CARRIERS);

    const monthKeys = Array.from(new Set(scoped.flatMap((c) => Array.from(c.monthly.keys())))).sort();
    const labels = monthKeys.map((key) => {
      const [y, m] = key.split('-');
      return `${MESES_PT[Number(m) - 1]}/${y}`;
    });

    const datasets = top.map((carrier) => ({
      label: carrier.name,
      data: monthKeys.map((key) => carrier.monthly.get(key) || 0),
      backgroundColor: carrierColor(carrier.name),
      borderRadius: 4,
      borderSkipped: false,
      barThickness: 12,
      maxBarThickness: 14,
      categoryPercentage: 0.75,
      barPercentage: 0.85,
    }));

    if (rest.length > 0) {
      datasets.push({
        label: 'Outros',
        data: monthKeys.map((key) => rest.reduce((s, carrier) => s + (carrier.monthly.get(key) || 0), 0)),
        backgroundColor: c.muted,
        borderRadius: 4,
        borderSkipped: false,
        barThickness: 12,
        maxBarThickness: 14,
        categoryPercentage: 0.75,
        barPercentage: 0.85,
      });
    }

    return { labels, datasets };
  }, [carriers, ctx, selectedPeriod, colors, c.muted]);

  if (datasets.length === 0) {
    return <p className="pt-4 text-xs text-[var(--color-text-soft)]">Nenhum envio com data reconhecível para montar o gráfico mensal.</p>;
  }

  return (
    <Bar
      data={{ labels, datasets }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top', align: 'start', labels: { color: c.text2, boxWidth: 10, boxHeight: 10 } },
          tooltip: { backgroundColor: c.tooltipBg, titleColor: c.text2, bodyColor: c.text2, borderColor: c.baseline, borderWidth: 1 },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: c.text2 } },
          y: { beginAtZero: true, grid: { color: c.grid }, ticks: { color: c.muted, callback: (v) => fmtInt.format(Number(v)) } },
        },
      }}
    />
  );
}
