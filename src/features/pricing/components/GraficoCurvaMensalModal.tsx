import { useMemo } from 'react';
import { Chart } from 'react-chartjs-2';
import type { ItemAgg } from '@/features/bi/types';
import { Modal } from '@/components/ui/Modal';
import { useTheme } from '@/hooks/useTheme';
import { chartChrome, palette } from '@/lib/chartSetup';
import { fmtBRL, fmtInt } from '@/lib/format';
import { construirCurvaMensalProduto, ROTULO_CRITERIO_REPRESENTACAO, type CriterioRepresentacao } from '../historicoBi';
import type { Produto } from '../types';

interface GraficoCurvaMensalModalProps {
  /** null = fechado (padrão pra "qual produto está aberto agora", igual produtoEditandoId em PricingPage.tsx). */
  produto: Produto | null;
  onFechar: () => void;
  criterio: CriterioRepresentacao;
  items: ItemAgg[];
}

/**
 * Curva de venda mensal de um produto, uma linha por Tabela de Preço — abre
 * ao clicar no VALOR (não no cabeçalho) da coluna Repres. (%). Eixo X só com
 * o nome do mês (sem ano): cada ponto já é a média das últimas safras nesse
 * mês (ver construirCurvaMensalProduto em historicoBi.ts).
 */
export function GraficoCurvaMensalModal({ produto, onFechar, criterio, items }: GraficoCurvaMensalModalProps) {
  const { isDark } = useTheme();
  const c = useMemo(() => chartChrome(isDark), [isDark]);
  const colors = useMemo(() => palette(isDark), [isDark]);

  const curva = useMemo(() => {
    if (!produto?.codigo) return null;
    return construirCurvaMensalProduto(items, produto.codigo, criterio);
  }, [produto, items, criterio]);

  const chartData = useMemo(() => {
    if (!curva) return null;
    return {
      labels: curva.meses,
      datasets: curva.tabelas.map((t, i) => ({
        type: 'line' as const,
        label: t.tabela,
        data: t.valores,
        borderColor: colors[i % colors.length],
        backgroundColor: colors[i % colors.length],
        pointRadius: 3,
        tension: 0.25,
      })),
    };
  }, [curva, colors]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: c.text2 } },
        tooltip: {
          callbacks: {
            label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
              `${ctx.dataset.label}: ${criterio === 'qtd' ? fmtInt.format(Math.round(ctx.parsed.y ?? 0)) + ' un.' : fmtBRL.format(ctx.parsed.y ?? 0)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: c.text2 } },
        y: {
          beginAtZero: true,
          grid: { color: c.grid },
          ticks: { color: c.text2, callback: (v: number | string) => (criterio === 'qtd' ? fmtInt.format(Number(v)) : fmtBRL.format(Number(v))) },
          border: { display: false },
        },
      },
    }),
    [c, criterio],
  );

  return (
    <Modal open={produto !== null} title={`Curva de venda — ${produto?.nome.replace(/[*_]/g, '') ?? ''}`} onClose={onFechar} widthClassName="max-w-4xl">
      {!curva || curva.tabelas.length === 0 ? (
        <p className="text-sm text-[var(--color-text-soft)]">
          {produto?.codigo ? 'Sem histórico de vendas no BI pra esse produto.' : 'Esse produto não tem Código cadastrado — sem como cruzar com o BI.'}
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs text-[var(--color-text-soft)]">
            Critério: <span className="font-semibold text-[var(--color-text)]">{ROTULO_CRITERIO_REPRESENTACAO[criterio]}</span> — cada ponto é a média
            daquele mês nas últimas safras. Uma linha por Tabela de Preço.
          </p>
          <div className="h-96">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Chart type="line" data={chartData as any} options={chartOptions as any} />
          </div>
        </>
      )}
    </Modal>
  );
}
