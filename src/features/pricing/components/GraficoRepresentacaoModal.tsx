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
  /** Quando o "Filtrar:" (Categoria/Fornecedor) da grade está ativo — troca o gráfico pra pizza, só com os itens desse filtro. */
  filtroAtivo?: { rotulo: string; produtoIds: Set<string> } | null;
}

/** Mesmas cores semânticas A/B/C (good/neutro/bad) já usadas em Badge/tailwind.config.js. */
const COR_CLASSE: Record<ClasseABC, string> = { A: '#0B6E52', B: '#94A3B8', C: '#C24444' };
const COR_OUTROS = '#CBD5E1';
const ID_OUTROS = '__outros__';

/** Ângulo áureo — espaça os matizes de forma bem distribuída pra qualquer quantidade de fatias, sem repetir cor entre produtos vizinhos. */
function corPorIndice(i: number, isDark: boolean): string {
  const matiz = (i * 137.508) % 360;
  return `hsl(${matiz.toFixed(1)}, 62%, ${isDark ? 58 : 46}%)`;
}

/** Além disso o gráfico fica ilegível — mesmo limite do gráfico Pareto do BI. */
const TOP_N_GRAFICO = 20;

interface FatiaPizza {
  nome: string;
  produtoId: string;
  classe: ClasseABC;
  valorCriterio: number;
  pctFiltro: number;
}

/**
 * Representação (%) — em colunas (maior pro menor, todo o sortimento) por padrão.
 * Quando a grade está com o "Filtrar:" (Categoria/Fornecedor) ativo, vira pizza
 * com só os itens daquele filtro, participação recalculada dentro dele mesmo.
 */
export function GraficoRepresentacaoModal({ open, onFechar, titulo, criterio, produtos, representatividadePorProduto, filtroAtivo }: GraficoRepresentacaoModalProps) {
  const { isDark } = useTheme();
  const c = useMemo(() => chartChrome(isDark), [isDark]);
  const nomePorId = useMemo(() => new Map(produtos.map((p) => [p.id, p.nome.replace(/[*_]/g, '')])), [produtos]);

  const linhas = useMemo(() => {
    return Array.from(representatividadePorProduto.entries())
      .map(([produtoId, repr]) => ({ nome: nomePorId.get(produtoId) ?? '—', ...repr }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, TOP_N_GRAFICO);
  }, [nomePorId, representatividadePorProduto]);

  const emModoPizza = !!filtroAtivo && filtroAtivo.produtoIds.size > 0;

  // Total recalculado só dentro do filtro (não do sortimento inteiro) — as fatias somam 100% entre si.
  const fatias = useMemo((): FatiaPizza[] => {
    if (!filtroAtivo) return [];
    const doFiltro = Array.from(representatividadePorProduto.entries())
      .filter(([produtoId]) => filtroAtivo.produtoIds.has(produtoId))
      .map(([produtoId, repr]) => ({ nome: nomePorId.get(produtoId) ?? '—', produtoId, ...repr }))
      .sort((a, b) => b.valorCriterio - a.valorCriterio);
    const totalValor = doFiltro.reduce((soma, l) => soma + l.valorCriterio, 0);
    const principais = doFiltro.slice(0, TOP_N_GRAFICO);
    const resto = doFiltro.slice(TOP_N_GRAFICO);
    const valorResto = resto.reduce((soma, l) => soma + l.valorCriterio, 0);
    const comPct: FatiaPizza[] = principais.map((l) => ({
      nome: l.nome,
      produtoId: l.produtoId,
      classe: l.classe,
      valorCriterio: l.valorCriterio,
      pctFiltro: totalValor > 0 ? (l.valorCriterio / totalValor) * 100 : 0,
    }));
    if (valorResto > 0) {
      comPct.push({
        nome: `Outros (${resto.length})`,
        produtoId: ID_OUTROS,
        classe: 'C',
        valorCriterio: valorResto,
        pctFiltro: totalValor > 0 ? (valorResto / totalValor) * 100 : 0,
      });
    }
    return comPct;
  }, [filtroAtivo, nomePorId, representatividadePorProduto]);

  const chartDataBarras = useMemo(
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

  const chartOptionsBarras = useMemo(
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
        x: { grid: { display: false }, ticks: { color: c.text2, maxRotation: 60, minRotation: 60, font: { size: 10, weight: 300 as const } } },
        y: { beginAtZero: true, grid: { color: c.grid }, ticks: { color: c.text2, callback: (v: number | string) => `${v}%` }, border: { display: false } },
      },
    }),
    [c, criterio, linhas],
  );

  const chartDataPizza = useMemo(
    () => ({
      labels: fatias.map((f) => f.nome),
      datasets: [
        {
          type: 'pie' as const,
          data: fatias.map((f) => f.valorCriterio),
          backgroundColor: fatias.map((f, i) => (f.produtoId === ID_OUTROS ? COR_OUTROS : corPorIndice(i, isDark))),
          borderColor: c.tooltipBg,
          borderWidth: 2,
        },
      ],
    }),
    [c, fatias, isDark],
  );

  const chartOptionsPizza = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right' as const, labels: { color: c.text2, boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx: { dataIndex: number }) => {
              const f = fatias[ctx.dataIndex];
              const valorFormatado = criterio === 'qtd' ? `${fmtInt.format(Math.round(f.valorCriterio))} un.` : fmtBRL.format(f.valorCriterio);
              return [
                `${f.pctFiltro.toFixed(1)}% do filtro`,
                `${ROTULO_CRITERIO_REPRESENTACAO[criterio]}: ${valorFormatado}`,
                ...(f.produtoId === ID_OUTROS ? [] : [`Classe: ${f.classe}`]),
              ];
            },
          },
        },
      },
    }),
    [c, criterio, fatias],
  );

  const semDados = emModoPizza ? fatias.length === 0 : linhas.length === 0;

  return (
    <Modal open={open} title={titulo} onClose={onFechar} widthClassName="max-w-4xl">
      {semDados ? (
        <p className="text-sm text-[var(--color-text-soft)]">Sem dado de Representação pra mostrar — nenhum produto com Código cadastrado bateu com o histórico do BI.</p>
      ) : emModoPizza && filtroAtivo ? (
        <>
          <p className="mb-3 text-xs text-[var(--color-text-soft)]">
            Filtro: <span className="font-semibold text-[var(--color-text)]">{filtroAtivo.rotulo}</span> — participação de cada item dentro desse filtro. Critério:{' '}
            <span className="font-semibold text-[var(--color-text)]">{ROTULO_CRITERIO_REPRESENTACAO[criterio]}</span>. Cada produto com uma cor própria.
          </p>
          <div className="h-96">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Chart type="pie" data={chartDataPizza as any} options={chartOptionsPizza as any} />
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-[var(--color-text-soft)]">
            Critério: <span className="font-semibold text-[var(--color-text)]">{ROTULO_CRITERIO_REPRESENTACAO[criterio]}</span> — top {linhas.length}, maior pro menor.
            Cor da barra = Classe da Curva ABC.
          </p>
          <div className="h-96">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Chart type="bar" data={chartDataBarras as any} options={chartOptionsBarras as any} />
          </div>
        </>
      )}
    </Modal>
  );
}
