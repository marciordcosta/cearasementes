import { GitCompare } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Chart } from 'react-chartjs-2';
import { Modal } from '@/components/ui/Modal';
import { NomeComDestaque } from '@/components/ui/NomeComDestaque';
import type { ItemAgg } from '@/features/bi/types';
import { useTheme } from '@/hooks/useTheme';
import { chartChrome, criarGridVerticalPontilhado, palette } from '@/lib/chartSetup';
import { fmtBRL, fmtInt } from '@/lib/format';
import { construirCurvaMensalProduto, ROTULO_CRITERIO_REPRESENTACAO, type CriterioRepresentacao } from '../historicoBi';
import type { Produto } from '../types';

interface GraficoCurvaMensalModalProps {
  /** null = fechado (padrão pra "qual produto está aberto agora", igual produtoEditandoId em PricingPage.tsx). */
  produto: Produto | null;
  onFechar: () => void;
  criterio: CriterioRepresentacao;
  items: ItemAgg[];
  /** Lista completa de produtos — só usada pra buscar quem comparar (ícone de comparação no título). */
  produtos: Produto[];
}

interface Comparacao {
  produto: Produto;
  tabela: string;
}

/**
 * Curva de venda mensal de um produto, uma linha por Tabela de Preço — abre
 * ao clicar no VALOR (não no cabeçalho) da coluna Repres. (%). Eixo X só com
 * o nome do mês (sem ano): cada ponto já é a média das últimas safras nesse
 * mês (ver construirCurvaMensalProduto em historicoBi.ts). O ícone de
 * comparação no título deixa "chamar" outro produto pro mesmo gráfico — pra
 * não multiplicar linhas demais, só entra 1 linha por comparação (o sistema
 * pergunta em qual Tabela desse outro produto, não todas de uma vez).
 */
export function GraficoCurvaMensalModal({ produto, onFechar, criterio, items, produtos }: GraficoCurvaMensalModalProps) {
  const { isDark } = useTheme();
  const c = useMemo(() => chartChrome(isDark), [isDark]);
  const colors = useMemo(() => palette(isDark), [isDark]);

  const [mostrarBusca, setMostrarBusca] = useState(false);
  const [buscaProduto, setBuscaProduto] = useState('');
  const [produtoEscolhendoTabela, setProdutoEscolhendoTabela] = useState<Produto | null>(null);
  const [comparacoes, setComparacoes] = useState<Comparacao[]>([]);

  // Cada produto novo aberto (ou o modal fechando) zera qualquer comparação/busca em andamento —
  // não faz sentido herdar isso de uma sessão anterior do modal.
  useEffect(() => {
    setMostrarBusca(false);
    setBuscaProduto('');
    setProdutoEscolhendoTabela(null);
    setComparacoes([]);
  }, [produto?.id]);

  const curva = useMemo(() => {
    if (!produto?.codigo) return null;
    return construirCurvaMensalProduto(items, produto.codigo, criterio);
  }, [produto, items, criterio]);

  const opcoesBusca = useMemo(() => {
    if (!mostrarBusca) return [];
    const termo = buscaProduto.trim().toLowerCase();
    const jaComparando = new Set(comparacoes.map((cp) => cp.produto.id));
    return produtos
      .filter((p) => p.id !== produto?.id && p.codigo && !jaComparando.has(p.id))
      .filter((p) => !termo || p.nome.toLowerCase().includes(termo))
      .slice(0, 8);
  }, [mostrarBusca, buscaProduto, produtos, produto, comparacoes]);

  const tabelasDoProdutoEscolhendo = useMemo(() => {
    if (!produtoEscolhendoTabela?.codigo) return [];
    return construirCurvaMensalProduto(items, produtoEscolhendoTabela.codigo, criterio).tabelas.map((t) => t.tabela);
  }, [produtoEscolhendoTabela, items, criterio]);

  function escolherProdutoComparacao(p: Produto) {
    setProdutoEscolhendoTabela(p);
    setMostrarBusca(false);
    setBuscaProduto('');
  }

  function confirmarTabelaComparacao(tabela: string) {
    if (!produtoEscolhendoTabela) return;
    setComparacoes((prev) => [...prev, { produto: produtoEscolhendoTabela, tabela }]);
    setProdutoEscolhendoTabela(null);
  }

  function removerComparacao(produtoId: string) {
    setComparacoes((prev) => prev.filter((cp) => cp.produto.id !== produtoId));
  }

  const curvasComparacao = useMemo(
    () =>
      comparacoes.map((cp) => ({
        ...cp,
        valores: construirCurvaMensalProduto(items, cp.produto.codigo!, criterio).tabelas.find((t) => t.tabela === cp.tabela)?.valores ?? Array(12).fill(0),
      })),
    [comparacoes, items, criterio],
  );

  const chartData = useMemo(() => {
    if (!curva) return null;
    const principais = curva.tabelas.map((t, i) => ({
      type: 'line' as const,
      label: t.tabela,
      data: t.valores,
      borderColor: colors[i % colors.length],
      backgroundColor: colors[i % colors.length],
      pointRadius: 3,
      tension: 0.25,
    }));
    // Linha pontilhada — visualmente distingue "outro produto" das linhas do produto principal (que são cheias).
    const comparacoesDatasets = curvasComparacao.map((cp, i) => {
      const cor = colors[(curva.tabelas.length + i) % colors.length];
      return {
        type: 'line' as const,
        label: `${cp.produto.nome.replace(/[*_]/g, '')} — ${cp.tabela}`,
        data: cp.valores,
        borderColor: cor,
        backgroundColor: cor,
        borderDash: [6, 4],
        pointRadius: 3,
        tension: 0.25,
      };
    });
    return { labels: curva.meses, datasets: [...principais, ...comparacoesDatasets] };
  }, [curva, colors, curvasComparacao]);

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

  const chartPlugins = useMemo(() => [criarGridVerticalPontilhado(c.grid)], [c.grid]);

  return (
    <Modal
      open={produto !== null}
      title={
        <span className="flex w-full min-w-0 items-center gap-2">
          <span className="truncate">Curva de venda — {produto?.nome.replace(/[*_]/g, '') ?? ''}</span>
          <button
            type="button"
            onClick={() => setMostrarBusca((v) => !v)}
            title="Comparar com outro produto"
            className="ml-auto shrink-0 rounded-full bg-white/15 p-1.5 text-white hover:bg-white/25"
          >
            <GitCompare size={16} />
          </button>
        </span>
      }
      onClose={onFechar}
      widthClassName="max-w-4xl"
    >
      {mostrarBusca && (
        <div className="mb-3 rounded-md border border-[var(--color-line)] bg-[var(--color-page)] p-3">
          <p className="mb-1.5 text-xs font-semibold text-[var(--color-text-soft)]">Comparar com qual produto?</p>
          <input
            type="text"
            autoFocus
            value={buscaProduto}
            onChange={(e) => setBuscaProduto(e.target.value)}
            placeholder="Digite o nome do produto…"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]"
          />
          {opcoesBusca.length > 0 && (
            <div className="mt-1.5 max-h-40 overflow-y-auto rounded-md border border-[var(--color-line)] bg-[var(--color-surface)]">
              {opcoesBusca.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => escolherProdutoComparacao(p)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-page)]"
                >
                  <NomeComDestaque nome={p.nome} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {produtoEscolhendoTabela && (
        <div className="mb-3 rounded-md border border-[var(--color-line)] bg-[var(--color-page)] p-3">
          <p className="mb-1.5 text-xs font-semibold text-[var(--color-text-soft)]">
            Comparar <NomeComDestaque nome={produtoEscolhendoTabela.nome} /> em qual Tabela?
          </p>
          {tabelasDoProdutoEscolhendo.length === 0 ? (
            <p className="text-sm text-[var(--color-text-soft)]">Sem histórico de vendas no BI pra esse produto.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tabelasDoProdutoEscolhendo.map((tabela) => (
                <button
                  key={tabela}
                  type="button"
                  onClick={() => confirmarTabelaComparacao(tabela)}
                  className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-accent)]/10"
                >
                  {tabela}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setProdutoEscolhendoTabela(null)} className="mt-2 text-xs text-[var(--color-text-soft)] hover:text-[var(--color-text)]">
            Cancelar
          </button>
        </div>
      )}

      {comparacoes.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {comparacoes.map((cp) => (
            <span
              key={cp.produto.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--color-accent)]"
            >
              {cp.produto.nome.replace(/[*_]/g, '')} — {cp.tabela}
              <button type="button" onClick={() => removerComparacao(cp.produto.id)} title="Remover comparação" className="hover:text-bad">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

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
            <Chart type="line" data={chartData as any} options={chartOptions as any} plugins={chartPlugins as any} />
          </div>
        </>
      )}
    </Modal>
  );
}
