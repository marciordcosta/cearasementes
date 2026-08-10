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
import { SeletorCriterioRepresentacao } from './SeletorCriterioRepresentacao';

interface GraficoCurvaMensalModalProps {
  /** null = fechado (padrão pra "qual produto está aberto agora", igual produtoEditandoId em PricingPage.tsx). */
  produto: Produto | null;
  onFechar: () => void;
  criterio: CriterioRepresentacao;
  onEscolherCriterio: (criterio: CriterioRepresentacao) => void;
  items: ItemAgg[];
  /** Lista completa de produtos — só usada pra buscar quem comparar (ícone de comparação no título). */
  produtos: Produto[];
}

/**
 * Curva de venda mensal de um produto, uma linha por Tabela de Preço — abre
 * ao clicar no VALOR (não no cabeçalho) da coluna Repres. (%). Eixo X só com
 * o nome do mês (sem ano): cada ponto já é a média das últimas safras nesse
 * mês (ver construirCurvaMensalProduto em historicoBi.ts).
 *
 * O ícone de comparação no título deixa "chamar" outro produto pro mesmo
 * gráfico. Assim que a 1ª comparação entra, os DOIS produtos passam a
 * mostrar só 1 linha cada — a mesma Tabela (`tabelaAtiva`), pra virar uma
 * comparação de verdade (mesmo canal de venda dos dois lados) em vez de
 * "todas as Tabelas de A" contra "uma Tabela de B". Essa Tabela ativa pode
 * ser trocada a qualquer momento (afeta os dois produtos juntos) enquanto
 * houver pelo menos uma comparação; sem nenhuma, volta a mostrar todas as
 * Tabelas do produto principal, como antes.
 */
export function GraficoCurvaMensalModal({ produto, onFechar, criterio, onEscolherCriterio, items, produtos }: GraficoCurvaMensalModalProps) {
  const { isDark } = useTheme();
  const c = useMemo(() => chartChrome(isDark), [isDark]);
  const colors = useMemo(() => palette(isDark), [isDark]);

  const [mostrarBusca, setMostrarBusca] = useState(false);
  const [buscaProduto, setBuscaProduto] = useState('');
  const [produtoEscolhendoTabela, setProdutoEscolhendoTabela] = useState<Produto | null>(null);
  const [comparacoes, setComparacoes] = useState<Produto[]>([]);
  const [tabelaAtiva, setTabelaAtiva] = useState<string | null>(null);

  // Cada produto novo aberto (ou o modal fechando) zera qualquer comparação/busca em andamento —
  // não faz sentido herdar isso de uma sessão anterior do modal.
  useEffect(() => {
    setMostrarBusca(false);
    setBuscaProduto('');
    setProdutoEscolhendoTabela(null);
    setComparacoes([]);
    setTabelaAtiva(null);
  }, [produto?.id]);

  const curva = useMemo(() => {
    if (!produto?.codigo) return null;
    return construirCurvaMensalProduto(items, produto.codigo, criterio);
  }, [produto, items, criterio]);

  const opcoesBusca = useMemo(() => {
    if (!mostrarBusca) return [];
    const termo = buscaProduto.trim().toLowerCase();
    const jaComparando = new Set(comparacoes.map((p) => p.id));
    return produtos
      .filter((p) => p.id !== produto?.id && p.codigo && !jaComparando.has(p.id))
      .filter((p) => !termo || p.nome.toLowerCase().includes(termo))
      .slice(0, 8);
  }, [mostrarBusca, buscaProduto, produtos, produto, comparacoes]);

  // Só a 1ª comparação pergunta a Tabela — pra ficar uma comparação de verdade, mostra
  // só as Tabelas em que os DOIS produtos (o principal e esse novo) têm dado.
  const tabelasEmComum = useMemo(() => {
    if (!produtoEscolhendoTabela?.codigo || !curva) return [];
    const doNovo = new Set(construirCurvaMensalProduto(items, produtoEscolhendoTabela.codigo, criterio).tabelas.map((t) => t.tabela));
    return curva.tabelas.map((t) => t.tabela).filter((t) => doNovo.has(t));
  }, [produtoEscolhendoTabela, curva, items, criterio]);

  // Opções pro seletor de Tabela ativa, uma vez já em modo comparação — união das Tabelas
  // do produto principal com as de TODOS os produtos já adicionados na comparação.
  const opcoesTabelaAtiva = useMemo(() => {
    if (!curva) return [];
    const nomes = new Set(curva.tabelas.map((t) => t.tabela));
    comparacoes.forEach((p) => {
      if (!p.codigo) return;
      construirCurvaMensalProduto(items, p.codigo, criterio).tabelas.forEach((t) => nomes.add(t.tabela));
    });
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [curva, comparacoes, items, criterio]);

  function escolherProdutoComparacao(p: Produto) {
    setMostrarBusca(false);
    setBuscaProduto('');
    // Já tem uma Tabela ativa (não é a 1ª comparação) — entra direto nela, sem perguntar de novo.
    if (tabelaAtiva) {
      setComparacoes((prev) => [...prev, p]);
    } else {
      setProdutoEscolhendoTabela(p);
    }
  }

  function confirmarTabelaComparacao(tabela: string) {
    if (!produtoEscolhendoTabela) return;
    setTabelaAtiva(tabela);
    setComparacoes((prev) => [...prev, produtoEscolhendoTabela]);
    setProdutoEscolhendoTabela(null);
  }

  function removerComparacao(produtoId: string) {
    setComparacoes((prev) => {
      const restantes = prev.filter((p) => p.id !== produtoId);
      if (restantes.length === 0) setTabelaAtiva(null);
      return restantes;
    });
  }

  const curvasComparacao = useMemo(() => {
    if (!tabelaAtiva) return [];
    return comparacoes.map((p) => ({
      produto: p,
      valores: p.codigo ? (construirCurvaMensalProduto(items, p.codigo, criterio).tabelas.find((t) => t.tabela === tabelaAtiva)?.valores ?? Array(12).fill(0)) : Array(12).fill(0),
    }));
  }, [comparacoes, tabelaAtiva, items, criterio]);

  // Sem comparação nenhuma: todas as Tabelas do produto principal (como sempre foi). Com
  // comparação: só a Tabela ativa — os dois lados (principal e comparações) ficam alinhados.
  const tabelasPrincipaisExibidas = useMemo(() => {
    if (!curva) return [];
    if (!tabelaAtiva) return curva.tabelas;
    return curva.tabelas.filter((t) => t.tabela === tabelaAtiva);
  }, [curva, tabelaAtiva]);

  const chartData = useMemo(() => {
    if (!curva) return null;
    const principais = tabelasPrincipaisExibidas.map((t, i) => ({
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
      const cor = colors[(tabelasPrincipaisExibidas.length + i) % colors.length];
      return {
        type: 'line' as const,
        label: cp.produto.nome.replace(/[*_]/g, ''),
        data: cp.valores,
        borderColor: cor,
        backgroundColor: cor,
        borderDash: [6, 4],
        pointRadius: 3,
        tension: 0.25,
      };
    });
    return { labels: curva.meses, datasets: [...principais, ...comparacoesDatasets] };
  }, [curva, colors, tabelasPrincipaisExibidas, curvasComparacao]);

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
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <SeletorCriterioRepresentacao criterio={criterio} ordenarAtivo onEscolher={onEscolherCriterio} semOpcaoPadrao sobreFundoEscuro />
            <button
              type="button"
              onClick={() => setMostrarBusca((v) => !v)}
              title="Comparar com outro produto"
              className="shrink-0 rounded-full bg-white/15 p-1.5 text-white hover:bg-white/25"
            >
              <GitCompare size={16} />
            </button>
          </span>
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
            Comparar <NomeComDestaque nome={produtoEscolhendoTabela.nome} /> em qual Tabela? (os dois produtos passam a mostrar só essa)
          </p>
          {tabelasEmComum.length === 0 ? (
            <p className="text-sm text-[var(--color-text-soft)]">Esses dois produtos não têm nenhuma Tabela de Preço em comum no histórico do BI.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {tabelasEmComum.map((tabela) => (
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

      {tabelaAtiva && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--color-text-soft)]">Comparando na Tabela:</span>
          <select
            value={tabelaAtiva}
            onChange={(e) => setTabelaAtiva(e.target.value)}
            className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)]"
          >
            {opcoesTabelaAtiva.map((tabela) => (
              <option key={tabela} value={tabela}>
                {tabela}
              </option>
            ))}
          </select>
          {comparacoes.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--color-accent)]">
              {p.nome.replace(/[*_]/g, '')}
              <button type="button" onClick={() => removerComparacao(p.id)} title="Remover comparação" className="hover:text-bad">
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
            daquele mês nas últimas safras. {tabelaAtiva ? 'Uma linha por produto, nessa Tabela.' : 'Uma linha por Tabela de Preço.'}
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
