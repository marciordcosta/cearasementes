import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { palette } from '@/lib/chartSetup';
import {
  getFilteredPriceTables,
  getPeriodLabel,
  getPeriodMonthlyBreakdown,
  mesesDoPeriodo,
  posicaoNoPeriodo,
  type PeriodContext,
} from '../calculations';
import type { CarrierAgg, PriceTableAgg } from '../types';
import { MultiLineChart } from './MultiLineChart';
import { PeriodComparisonChart } from './PeriodComparisonChart';

interface ComparativoGraficoModalProps {
  open: boolean;
  onFechar: () => void;
  ctx: PeriodContext;
  priceTables: PriceTableAgg[];
  carriers: Map<string, CarrierAgg>;
  periods: string[];
  isDark: boolean;
}

export function ComparativoGraficoModal({ open, onFechar, ctx, priceTables, carriers, periods, isDark }: ComparativoGraficoModalProps) {
  const [periodoTabelas, setPeriodoTabelas] = useState(() => periods[periods.length - 1] ?? '');
  const [referencia, setReferencia] = useState<string | null>(null);

  const periodoAtivo = periods.includes(periodoTabelas) ? periodoTabelas : (periods[periods.length - 1] ?? '');
  const colors = palette(isDark);
  const labelsMeses = useMemo(() => mesesDoPeriodo(ctx), [ctx]);

  // Gráfico 1: uma linha por ano/safra, Faturamento Líquido mês a mês —
  // mesmos dados já usados no detalhamento mensal de cada período expandido.
  const seriesPorAno = useMemo(
    () =>
      periods.map((periodo, i) => {
        const meses = getPeriodMonthlyBreakdown(ctx, priceTables, carriers, periodo);
        const data: (number | null)[] = Array(12).fill(null);
        meses.forEach((m) => {
          data[posicaoNoPeriodo(ctx, m.month)] = m.valorLiquido;
        });
        return { key: periodo, label: getPeriodLabel(ctx, periodo), data, color: colors[i % colors.length] };
      }),
    [ctx, priceTables, carriers, periods, colors],
  );

  function onSelecionarReferencia(key: string) {
    setReferencia((atual) => (atual === key ? null : key));
  }

  // Gráfico 2: uma linha por Tabela de Preço, Faturamento Líquido mês a mês,
  // dentro do ano/safra escolhido no seletor abaixo.
  const tabelasFiltradas = useMemo(
    () => (periodoAtivo ? getFilteredPriceTables(ctx, priceTables, periodoAtivo) : []),
    [ctx, priceTables, periodoAtivo],
  );
  const seriesPorTabela = useMemo(
    () =>
      tabelasFiltradas.map((t, i) => {
        const data: (number | null)[] = Array(12).fill(null);
        t.monthly.forEach((m) => {
          data[posicaoNoPeriodo(ctx, m.month)] = m.valor;
        });
        return { key: t.name, label: t.name, data, color: colors[i % colors.length] };
      }),
    [tabelasFiltradas, ctx, colors],
  );

  return (
    <Modal open={open} title="Comparativo em Gráficos" onClose={onFechar} widthClassName="max-w-[95vw]">
      <div className="max-h-[80vh] space-y-8 overflow-y-auto">
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">
              Faturamento Líquido por {ctx.mode === 'season' ? 'Safra' : 'Ano'} — mês a mês
            </h3>
            <p className="text-xs text-[var(--color-text-soft)]">
              Clique numa linha, ou no quadrado dela no tooltip, pra usá-la como referência de comparação.
            </p>
          </div>
          <div className="h-80">
            <PeriodComparisonChart
              labels={labelsMeses}
              series={seriesPorAno}
              isDark={isDark}
              referencia={referencia}
              onSelecionarReferencia={onSelecionarReferencia}
            />
          </div>
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Faturamento Líquido por Tabela de Preço — mês a mês</h3>
            <div className="flex items-center gap-1.5">
              <label className="text-sm text-[var(--color-text-soft)]">{ctx.mode === 'season' ? 'Safra:' : 'Ano:'}</label>
              <select
                value={periodoAtivo}
                onChange={(e) => setPeriodoTabelas(e.target.value)}
                className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text-soft)]"
              >
                {periods.map((p) => (
                  <option key={p} value={p}>
                    {getPeriodLabel(ctx, p)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="h-80">
            {seriesPorTabela.length === 0 ? (
              <p className="pt-6 text-sm text-[var(--color-text-soft)]">Sem Tabelas de Preço com dados neste período.</p>
            ) : (
              <MultiLineChart labels={labelsMeses} series={seriesPorTabela} isDark={isDark} />
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
