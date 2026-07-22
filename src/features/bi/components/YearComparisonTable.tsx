import { Fragment, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { fmtBRL, fmtInt } from '@/lib/format';
import { palette } from '@/lib/chartSetup';
import {
  getAvailableYears,
  getPeriodKeyFor,
  getPeriodLabel,
  getPeriodMonthlyBreakdown,
  tablePeriodStats,
  type PeriodContext,
} from '../calculations';
import type { CarrierAgg, PriceTableAgg } from '../types';
import { ComparativoGraficoModal } from './ComparativoGraficoModal';
import { MonthlyBarChart } from './MonthlyBarChart';

interface YearComparisonTableProps {
  ctx: PeriodContext;
  priceTables: PriceTableAgg[];
  carriers: Map<string, CarrierAgg>;
  isDark: boolean;
}

function MetricCell({ value, bold }: { value: string; bold?: boolean }) {
  return (
    <td className="px-4 py-2 text-right">
      <span className={`num text-[var(--color-text)] ${bold ? 'font-medium' : ''}`}>{value}</span>
    </td>
  );
}

export function YearComparisonTable({ ctx, priceTables, carriers, isDark }: YearComparisonTableProps) {
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [emGrafico, setEmGrafico] = useState<Set<string>>(new Set());
  const [modalGraficoAberto, setModalGraficoAberto] = useState(false);
  const periods = getAvailableYears(ctx, priceTables, carriers);
  if (periods.length < 2) return null;

  const colors = palette(isDark);

  function toggleGrafico(period: string, e: React.MouseEvent) {
    e.stopPropagation();
    setEmGrafico((prev) => {
      const next = new Set(prev);
      if (next.has(period)) next.delete(period);
      else next.add(period);
      return next;
    });
  }

  const rowsByPeriod = periods.map((period) => {
    const stats = priceTables.map((t) => tablePeriodStats(ctx, t, period)).filter((s): s is NonNullable<typeof s> => s !== null);
    const valorLiquido = stats.reduce((s, st) => s + st.valorLiquido, 0);
    const totalReg = stats.reduce((s, st) => s + st.registros, 0);
    const qtdCliente = stats.reduce((s, st) => s + st.qtdCliente, 0);

    let pedidos = 0;
    let valorTransportado = 0;
    carriers.forEach((c) => {
      c.monthly.forEach((m, key) => {
        const [y, mo] = key.split('-');
        if (getPeriodKeyFor(ctx, Number(y), Number(mo)) === period) {
          pedidos += m.pedidos;
          valorTransportado += m.valor;
        }
      });
    });

    return { period, valorLiquido, totalReg, qtdCliente, pedidos, valorTransportado };
  });

  function toggle(period: string) {
    setExpandido((prev) => {
      const next = new Set(prev);
      if (next.has(period)) next.delete(period);
      else next.add(period);
      return next;
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--color-text)]">
          {ctx.mode === 'season' ? 'Comparativo entre Safras' : 'Comparativo Anual'}
        </h2>
        <button
          type="button"
          onClick={() => setModalGraficoAberto(true)}
          title="Ver comparativo em gráficos de linha"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-sm shadow-sm hover:bg-[var(--color-line)]/40"
        >
          📈
        </button>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-left text-[var(--color-text-soft)]">
              <th className="px-4 py-2 font-medium">{ctx.mode === 'season' ? 'Safra' : 'Ano'}</th>
              <th className="px-4 py-2 text-right font-medium">Faturamento Líquido</th>
              <th className="px-4 py-2 text-right font-medium">Registros</th>
              <th className="px-4 py-2 text-right font-medium">Clientes</th>
              <th className="px-4 py-2 text-right font-medium">Pedidos (Transportadoras)</th>
              <th className="px-4 py-2 text-right font-medium">Valor Transportado</th>
            </tr>
          </thead>
          <tbody className="num">
            {rowsByPeriod.map((r, i) => {
              const months = getPeriodMonthlyBreakdown(ctx, priceTables, carriers, r.period);
              const aberto = expandido.has(r.period);
              const grafico = emGrafico.has(r.period);
              return (
                <Fragment key={r.period}>
                  <tr
                    className="cursor-pointer border-b border-[var(--color-line)]"
                    onClick={() => toggle(r.period)}
                  >
                    <td className="flex items-center gap-2 px-4 py-2 text-[var(--color-text)]">
                      <span className="inline-block text-xs text-[var(--color-text-soft)]">{aberto ? '▾' : '▸'}</span>
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: colors[i % colors.length] }} />
                      {getPeriodLabel(ctx, r.period)}
                    </td>
                    <MetricCell value={fmtBRL.format(r.valorLiquido)} bold />
                    <MetricCell value={fmtInt.format(r.totalReg)} />
                    <MetricCell value={fmtInt.format(r.qtdCliente)} />
                    <MetricCell value={fmtInt.format(r.pedidos)} />
                    <MetricCell value={fmtBRL.format(r.valorTransportado)} />
                  </tr>
                  {aberto && (
                    <tr>
                      <td colSpan={6} className="px-4 pb-3 pt-0">
                        <div className="relative overflow-x-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-page)]">
                          <button
                            type="button"
                            onClick={(e) => toggleGrafico(r.period, e)}
                            title={grafico ? 'Ver como tabela' : 'Ver Faturamento Líquido como gráfico'}
                            className="absolute right-2 top-2 z-[1] flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-sm shadow-sm hover:bg-[var(--color-line)]/40"
                          >
                            {grafico ? '▦' : '📊'}
                          </button>

                          {grafico ? (
                            <div className="h-64 p-4 pr-12">
                              {months.length === 0 ? (
                                <p className="pt-4 text-xs text-[var(--color-text-soft)]">Sem meses reconhecíveis neste período.</p>
                              ) : (
                                <MonthlyBarChart
                                  labels={months.map((m) => m.label)}
                                  data={months.map((m) => m.valorLiquido)}
                                  color={colors[i % colors.length]}
                                  isDark={isDark}
                                />
                              )}
                            </div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-[var(--color-line)] text-left text-[var(--color-text-soft)]">
                                  <th className="px-3 py-1.5 font-medium">Mês</th>
                                  <th className="px-4 py-1.5 text-right font-medium">Faturamento Líquido</th>
                                  <th className="px-4 py-1.5 text-right font-medium">Registros</th>
                                  <th className="px-4 py-1.5 text-right font-medium">Clientes</th>
                                  <th className="px-4 py-1.5 text-right font-medium">Pedidos</th>
                                  <th className="px-4 py-1.5 text-right font-medium">Valor Transportado</th>
                                </tr>
                              </thead>
                              <tbody className="num">
                                {months.length === 0 ? (
                                  <tr>
                                    <td colSpan={6} className="px-3 py-2 text-[var(--color-text-soft)]">
                                      Sem meses reconhecíveis neste período.
                                    </td>
                                  </tr>
                                ) : (
                                  months.map((m) => (
                                    <tr key={m.key} className="border-b border-[var(--color-line)] last:border-b-0">
                                      <td className="px-3 py-1.5 text-[var(--color-text-soft)]">{m.label}</td>
                                      <MetricCell value={fmtBRL.format(m.valorLiquido)} />
                                      <MetricCell value={fmtInt.format(m.registros)} />
                                      <MetricCell value={fmtInt.format(m.qtdCliente)} />
                                      <MetricCell value={fmtInt.format(m.pedidos)} />
                                      <MetricCell value={fmtBRL.format(m.valorTransportado)} />
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Card>

      <ComparativoGraficoModal
        open={modalGraficoAberto}
        onFechar={() => setModalGraficoAberto(false)}
        ctx={ctx}
        priceTables={priceTables}
        carriers={carriers}
        periods={periods}
        isDark={isDark}
      />
    </section>
  );
}
