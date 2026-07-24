import { useMemo } from 'react';
import { chartChrome, palette } from '@/lib/chartSetup';
import { fmtBRL, fmtInt, MESES_PT } from '@/lib/format';
import { getPeriodKeyFor, type PeriodContext } from '../calculations';
import type { CarrierAgg } from '../types';
import { MultiLineChart } from './MultiLineChart';

const TOP_CARRIERS = 5;

export type ModoCarrierChart = 'quantidade' | 'valor';

interface CarrierMonthlyChartProps {
  ctx: PeriodContext;
  carriers: Map<string, CarrierAgg>;
  selectedPeriod: string;
  modo: ModoCarrierChart;
  isDark: boolean;
}

export function CarrierMonthlyChart({ ctx, carriers, selectedPeriod, modo, isDark }: CarrierMonthlyChartProps) {
  const colors = palette(isDark);
  const corOutros = chartChrome(isDark).muted;

  const { labels, series } = useMemo(() => {
    const allNames = Array.from(carriers.keys());
    const carrierColor = (name: string) => colors[allNames.indexOf(name) % colors.length];

    const scoped = allNames
      .map((name) => {
        const carrier = carriers.get(name)!;
        const monthly = new Map<string, number>();
        carrier.monthly.forEach((m, key) => {
          const [y, mo] = key.split('-');
          if (selectedPeriod === 'all' || getPeriodKeyFor(ctx, Number(y), Number(mo)) === selectedPeriod) {
            monthly.set(key, modo === 'valor' ? m.valor : m.pedidos);
          }
        });
        const total = Array.from(monthly.values()).reduce((s, v) => s + v, 0);
        return { name, monthly, total };
      })
      .filter((c) => c.total > 0);

    if (scoped.length === 0) return { labels: [] as string[], series: [] };

    scoped.sort((a, b) => b.total - a.total);
    const top = scoped.slice(0, TOP_CARRIERS);
    const rest = scoped.slice(TOP_CARRIERS);

    const monthKeys = Array.from(new Set(scoped.flatMap((c) => Array.from(c.monthly.keys())))).sort();
    const labels = monthKeys.map((key) => {
      const [y, m] = key.split('-');
      return `${MESES_PT[Number(m) - 1]}/${y}`;
    });

    const series = top.map((carrier) => ({
      key: carrier.name,
      label: carrier.name,
      data: monthKeys.map((key) => carrier.monthly.get(key) ?? 0),
      color: carrierColor(carrier.name),
    }));

    if (rest.length > 0) {
      series.push({
        key: 'outros',
        label: 'Outros',
        data: monthKeys.map((key) => rest.reduce((s, carrier) => s + (carrier.monthly.get(key) ?? 0), 0)),
        color: corOutros,
      });
    }

    return { labels, series };
  }, [carriers, ctx, selectedPeriod, modo, colors, corOutros]);

  if (series.length === 0) {
    return <p className="pt-4 text-xs text-[var(--color-text-soft)]">Nenhum envio com data reconhecível para montar o gráfico mensal.</p>;
  }

  const formatarValor = modo === 'valor' ? (v: number) => fmtBRL.format(v) : (v: number) => fmtInt.format(v);
  return <MultiLineChart labels={labels} series={series} isDark={isDark} formatarValor={formatarValor} />;
}
