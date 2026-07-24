import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { palette } from '@/lib/chartSetup';
import { getPeriodLabel, getPeriodMonthlyBreakdown, mesesDoPeriodo, posicaoNoPeriodo, type PeriodContext } from '../calculations';
import type { CarrierAgg, PriceTableAgg } from '../types';
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
  const [referencia, setReferencia] = useState<string | null>(null);

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
      </div>
    </Modal>
  );
}
