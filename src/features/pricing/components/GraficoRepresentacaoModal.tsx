import { useMemo } from 'react';
import { Chart } from 'react-chartjs-2';
import { Modal } from '@/components/ui/Modal';
import { useTheme } from '@/hooks/useTheme';
import { chartChrome } from '@/lib/chartSetup';
import { fmtBRL, fmtInt } from '@/lib/format';
import { ROTULO_CRITERIO_REPRESENTACAO, type ClasseABC, type CriterioRepresentacao, type Representatividade } from '../historicoBi';
import type { Produto } from '../types';

interface GraficoRepresentacaoModalProps {
  open: boolean;
  onFechar: () => void;
  titulo: string;
  criterio: CriterioRepresentacao;
  produtos: Produto[];
  representatividadePorProduto: Map<string, Representatividade>;
}

/** Mesmas cores semânticas A/B/C (good/neutro/bad) já usadas em Badge/tailwind.config.js. */
const COR_CLASSE: Record<ClasseABC, string> = { A: '#0B6E52', B: '#94A3B8', C: '#C24444' };

/** Além disso a barra fica ilegível — mesmo limite do gráfico Pareto do BI. */
const TOP_N_GRAFICO = 20;

/** Gráfico em colunas da Representação (%), sempre do maior pro menor — abre ao clicar no cabeçalho "Repres." da grade. */
export function GraficoRepresentacaoModal({ open, onFechar, titulo, criterio, produtos, representatividadePorProduto }: GraficoRepresentacaoModalProps) {
  const { isDark } = useTheme();
  const c = useMemo(() => chartChrome(isDark), [isDark]);

  const linhas = useMemo(() => {
    const nomePorId = new Map(produtos.map((p) => [p.id, p.nome.replace(/[*_]/g, '')]));
    return Array.from(representatividadePorProduto.entries())
      .map(([produtoId, repr]) => ({ nome: nomePorId.get(produtoId) ?? '—', ...repr }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, TOP_N_GRAFICO);
  }, [produtos, representatividadePorProduto]);

  const chartData = useMemo(
    () => ({
      labels: linhas.map((l) => l.nome),
      datasets: [
        {
          type: 'bar' as const,
          label: 'Representação (%)',
          data: linhas.map((l) => l.pct),
          backgroundColor: linhas.map((l) => COR_CLASSE[l.classe]),
          borderRadius: 4,
        },
      ],
    }),
    [linhas],
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: { dataIndex: number; parsed: { y: number | null } }) => {
              const l = linhas[ctx.dataIndex];
              const valorFormatado = criterio === 'qtd' ? `${fmtInt.format(Math.round(l.valorCriterio))} un.` : fmtBRL.format(l.valorCriterio);
              return [`Representação: ${ctx.parsed.y?.toFixed(1)}%`, `${ROTULO_CRITERIO_REPRESENTACAO[criterio]}: ${valorFormatado}`, `Classe: ${l.classe}`];
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: c.text2, maxRotation: 60, minRotation: 60 } },
        y: { beginAtZero: true, grid: { color: c.grid }, ticks: { color: c.text2, callback: (v: number | string) => `${v}%` }, border: { display: false } },
      },
    }),
    [c, criterio, linhas],
  );

  return (
    <Modal open={open} title={titulo} onClose={onFechar} widthClassName="max-w-4xl">
      {linhas.length === 0 ? (
        <p className="text-sm text-[var(--color-text-soft)]">Sem dado de Representação pra mostrar — nenhum produto com Código cadastrado bateu com o histórico do BI.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-[var(--color-text-soft)]">
            Critério: <span className="font-semibold text-[var(--color-text)]">{ROTULO_CRITERIO_REPRESENTACAO[criterio]}</span> — top {linhas.length}, maior pro menor.
            Cor da barra = Classe da Curva ABC.
          </p>
          <div className="h-96">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Chart type="bar" data={chartData as any} options={chartOptions as any} />
          </div>
        </>
      )}
    </Modal>
  );
}
