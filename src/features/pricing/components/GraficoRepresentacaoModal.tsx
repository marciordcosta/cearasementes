import { Layers } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Chart } from 'react-chartjs-2';
import { Modal } from '@/components/ui/Modal';
import { useTheme } from '@/hooks/useTheme';
import { chartChrome } from '@/lib/chartSetup';
import { fmtBRL, fmtInt } from '@/lib/format';
import { chaveComparacaoProduto } from '../calculations';
import {
  classificarABCPorValor,
  ROTULO_CRITERIO_REPRESENTACAO,
  type ClasseABC,
  type CriterioRepresentacao,
  type Representatividade,
  type RepresentatividadePorCanal,
} from '../historicoBi';
import type { Produto } from '../types';
import { SeletorCriterioRepresentacao } from './SeletorCriterioRepresentacao';

interface GraficoRepresentacaoModalProps {
  open: boolean;
  onFechar: () => void;
  titulo: string;
  criterio: CriterioRepresentacao;
  onEscolherCriterio: (criterio: CriterioRepresentacao) => void;
  produtos: Produto[];
  representatividadePorProduto: Map<string, Representatividade>;
  /** Quando o "Filtrar:" (Categoria/Fornecedor) da grade está ativo — recorta a pizza só aos itens desse filtro; sem isso, a pizza mostra todo o sortimento. */
  filtroAtivo?: { rotulo: string; produtoIds: Set<string> } | null;
  /** true quando o filtro ativo é a Categoria mãe (ex.: "Capim", geral) — junta numa fatia só
   * os produtos com o mesmo nome base (2 primeiras palavras) e mesma Classe (subcategoria)
   * achados em fornecedores diferentes, mesmo critério da busca inteligente do Planejamento de
   * Compra. Com o filtro numa Subcategoria/Fornecedor específica (ou sem esse prop), cada
   * produto continua com sua própria fatia. */
  agruparPorNomeEClasse?: boolean;
  /** Safras disponíveis pro seletor "ver uma safra específica" — omitido/vazio esconde o seletor. */
  historicoSafras?: { key: string; label: string }[];
  /** null = média das últimas safras (padrão). O cálculo de representatividadePorProduto já reflete essa escolha — feito por quem chama (aqui só decide o rótulo/seletor). */
  safraSelecionada?: string | null;
  onEscolherSafra?: (safra: string | null) => void;
  /** Participação de cada Tabela (canal) nas vendas dos itens em vista (já recortada pelo mesmo filtroAtivo/safra) — omitido esconde o ícone de alternar pra essa visão. */
  representatividadePorCanal?: RepresentatividadePorCanal[];
}

/** Ângulo áureo — espaça os matizes de forma bem distribuída pra qualquer quantidade de fatias, sem repetir cor entre produtos vizinhos. */
function corPorIndice(i: number, isDark: boolean): string {
  const matiz = (i * 137.508) % 360;
  return `hsl(${matiz.toFixed(1)}, 62%, ${isDark ? 58 : 46}%)`;
}

interface FatiaPizza {
  nome: string;
  produtoId: string;
  classe: ClasseABC;
  valorCriterio: number;
  pctFiltro: number;
}

/** Acima disso, Classes A e B (a C pouco relevante só teria poluído); com poucos candidatos, mostra todo mundo (até esse limite) — senão o filtro de classe podia sobrar quase vazio, tipo 1-2 produtos, mesmo tendo mais gente pra comparar. */
const LIMITE_TOP_OU_CLASSE = 10;

/**
 * Já ordenado (maior pro menor) — decide entre "só Classes A/B" ou "Top N" conforme o tamanho
 * do grupo. Mesmo com mais de LIMITE_TOP_OU_CLASSE candidatos no total, se as Classes A/B
 * sozinhas renderem MENOS itens que o limite (a C ficou com a maioria), o filtro de classe
 * "sobra quase vazio" mesmo tendo mais gente pra comparar — nesse caso cai pro Top N direto.
 */
function selecionarClasseOuTop<T extends { classe: ClasseABC }>(ordenados: T[]): { itens: T[]; porClasse: boolean } {
  if (ordenados.length > LIMITE_TOP_OU_CLASSE) {
    const classesAB = ordenados.filter((i) => i.classe !== 'C');
    if (classesAB.length >= LIMITE_TOP_OU_CLASSE) {
      return { itens: classesAB, porClasse: true };
    }
  }
  return { itens: ordenados.slice(0, LIMITE_TOP_OU_CLASSE), porClasse: false };
}

interface ItemRepresentatividadeNomeado {
  nome: string;
  produtoId: string;
  pct: number;
  qtdMedia: number;
  classe: ClasseABC;
  valorCriterio: number;
}

/**
 * Junta produtos com o mesmo nome "destacado" no cadastro e mesma Classe (subcategoria) — mesmo
 * critério da busca inteligente de fornecedores no Planejamento de Compra (ver
 * chaveComparacaoNome em calculations.ts e compra.ts) — numa fatia só, somando os valores. Nome
 * exibido vem do item de maior valor do grupo (o "principal"); produto sem match em
 * `produtoPorId` fica sozinho. A Classe é RECALCULADA sobre o total já somado de cada grupo (não
 * herdada do principal) — um grupo pode juntar vários fornecedores individualmente Classe C e
 * ainda assim somar mais que muita Classe A/B sozinha; herdar do principal escondia esse grupo
 * inteiro da fatia "Classes A e B" por engano.
 */
function agruparPorNomeClasse(itens: ItemRepresentatividadeNomeado[], produtoPorId: Map<string, Produto>): ItemRepresentatividadeNomeado[] {
  const grupos = new Map<string, ItemRepresentatividadeNomeado>();
  for (const item of itens) {
    const produto = produtoPorId.get(item.produtoId);
    const chave = produto ? chaveComparacaoProduto(produto) : item.produtoId;
    const existente = grupos.get(chave);
    const valorCriterio = (existente?.valorCriterio ?? 0) + item.valorCriterio;
    const qtdMedia = (existente?.qtdMedia ?? 0) + item.qtdMedia;
    const pct = (existente?.pct ?? 0) + item.pct;
    if (!existente || item.valorCriterio > existente.valorCriterio) {
      // Ainda não existe, ou esse item é o novo "principal" (maior valor) — nome passa a vir
      // dele, mas os totais já acumulados no grupo continuam somados.
      grupos.set(chave, { ...item, valorCriterio, qtdMedia, pct });
    } else {
      grupos.set(chave, { ...existente, valorCriterio, qtdMedia, pct });
    }
  }
  const agrupados = Array.from(grupos.values());
  const classes = classificarABCPorValor(agrupados.map((i) => ({ id: i.produtoId, valor: i.valorCriterio })));
  return agrupados.map((i) => ({ ...i, classe: classes.get(i.produtoId) ?? i.classe }));
}

/**
 * Representação (%) — sempre em pizza (colunas não faz mais sentido só ela ser diferente).
 * Com o "Filtrar:" (Categoria/Fornecedor) e/ou busca por nome ativos na grade, mostra só os
 * itens que aparecem lá, participação recalculada dentro desse grupo; sem filtro nenhum, todo o
 * sortimento entra no cálculo. Com mais de LIMITE_TOP_OU_CLASSE candidatos, mostra só Classes A
 * e B da Curva ABC; com poucos (grupo já pequeno), mostra Top N direto, sem filtrar classe —
 * senão o filtro de classe podia sobrar quase vazio mesmo tendo mais produtos pra comparar.
 * O ícone de "Tabelas" (quando `representatividadePorCanal` é passado) troca pra uma segunda
 * pizza — participação de cada Tabela de Preço nas vendas desses mesmos itens.
 */
export function GraficoRepresentacaoModal({
  open,
  onFechar,
  titulo,
  criterio,
  onEscolherCriterio,
  produtos,
  representatividadePorProduto,
  filtroAtivo,
  agruparPorNomeEClasse,
  historicoSafras,
  safraSelecionada,
  onEscolherSafra,
  representatividadePorCanal,
}: GraficoRepresentacaoModalProps) {
  const { isDark } = useTheme();
  const c = useMemo(() => chartChrome(isDark), [isDark]);
  const nomePorId = useMemo(() => new Map(produtos.map((p) => [p.id, p.nome.replace(/[*_]/g, '')])), [produtos]);
  const produtoPorId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const [modoPorTabela, setModoPorTabela] = useState(false);

  // Total recalculado só dentro do que está em vista (filtro, ou todo o sortimento sem filtro) — as fatias somam 100% entre si.
  const { itens: fatias, porClasse: fatiasPorClasse } = useMemo((): { itens: FatiaPizza[]; porClasse: boolean } => {
    const idsEmVista = filtroAtivo?.produtoIds ?? new Set(representatividadePorProduto.keys());
    const doFiltroBase = Array.from(representatividadePorProduto.entries())
      .filter(([produtoId]) => idsEmVista.has(produtoId))
      .map(([produtoId, repr]) => ({ nome: nomePorId.get(produtoId) ?? '—', produtoId, ...repr }));
    const doFiltro = (agruparPorNomeEClasse ? agruparPorNomeClasse(doFiltroBase, produtoPorId) : doFiltroBase).sort(
      (a, b) => b.valorCriterio - a.valorCriterio,
    );
    const { itens: selecionados, porClasse } = selecionarClasseOuTop(doFiltro);
    const totalValor = selecionados.reduce((soma, l) => soma + l.valorCriterio, 0);
    return {
      porClasse,
      itens: selecionados.map((l) => ({
        nome: l.nome,
        produtoId: l.produtoId,
        classe: l.classe,
        valorCriterio: l.valorCriterio,
        pctFiltro: totalValor > 0 ? (l.valorCriterio / totalValor) * 100 : 0,
      })),
    };
  }, [filtroAtivo, nomePorId, representatividadePorProduto, agruparPorNomeEClasse, produtoPorId]);

  const chartDataPizza = useMemo(
    () => ({
      labels: fatias.map((f) => f.nome),
      datasets: [
        {
          type: 'pie' as const,
          data: fatias.map((f) => f.valorCriterio),
          backgroundColor: fatias.map((_f, i) => corPorIndice(i, isDark)),
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
              return [`${f.pctFiltro.toFixed(1)}%`, `${ROTULO_CRITERIO_REPRESENTACAO[criterio]}: ${valorFormatado}`, `Classe: ${f.classe}`];
            },
          },
        },
      },
    }),
    [c, criterio, fatias],
  );

  const porCanal = useMemo(() => representatividadePorCanal ?? [], [representatividadePorCanal]);
  const chartDataPizzaCanal = useMemo(
    () => ({
      labels: porCanal.map((cn) => cn.canalNome),
      datasets: [
        {
          type: 'pie' as const,
          data: porCanal.map((cn) => cn.valorCriterio),
          backgroundColor: porCanal.map((_cn, i) => corPorIndice(i, isDark)),
          borderColor: c.tooltipBg,
          borderWidth: 2,
        },
      ],
    }),
    [c, porCanal, isDark],
  );

  const chartOptionsPizzaCanal = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right' as const, labels: { color: c.text2, boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx: { dataIndex: number }) => {
              const cn = porCanal[ctx.dataIndex];
              const valorFormatado = criterio === 'qtd' ? `${fmtInt.format(Math.round(cn.valorCriterio))} un.` : fmtBRL.format(cn.valorCriterio);
              return [`${cn.pct.toFixed(1)}%`, `${ROTULO_CRITERIO_REPRESENTACAO[criterio]}: ${valorFormatado}`];
            },
          },
        },
      },
    }),
    [c, criterio, porCanal],
  );

  const semDados = modoPorTabela ? porCanal.length === 0 : fatias.length === 0;
  const rotuloSafra = safraSelecionada ? historicoSafras?.find((s) => s.key === safraSelecionada)?.label : null;
  const trechoSafra = rotuloSafra ? `só a safra ${rotuloSafra}` : 'média das últimas safras';
  const trechoEscopo = filtroAtivo ? (
    <>
      Filtro: <span className="font-semibold text-[var(--color-text)]">{filtroAtivo.rotulo}</span>
    </>
  ) : (
    'Todo o sortimento'
  );

  return (
    <Modal
      open={open}
      title={
        <span className="flex w-full min-w-0 items-center gap-2">
          <span className="truncate">{titulo}</span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {historicoSafras && historicoSafras.length > 0 && onEscolherSafra && (
              <select
                value={safraSelecionada ?? ''}
                onChange={(e) => onEscolherSafra(e.target.value || null)}
                title="Ver a média das últimas safras, ou uma safra específica"
                className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"
              >
                <option value="" className="text-[var(--color-text)]">
                  Média (últimas safras)
                </option>
                {historicoSafras.map((s) => (
                  <option key={s.key} value={s.key} className="text-[var(--color-text)]">
                    {s.label}
                  </option>
                ))}
              </select>
            )}
            <SeletorCriterioRepresentacao criterio={criterio} ordenarAtivo onEscolher={onEscolherCriterio} semOpcaoPadrao sobreFundoEscuro />
            {representatividadePorCanal && (
              <button
                type="button"
                onClick={() => setModoPorTabela((v) => !v)}
                title={modoPorTabela ? 'Ver participação por produto' : 'Ver participação de cada Tabela de Preço'}
                className={`shrink-0 rounded-full p-1.5 text-white ${modoPorTabela ? 'bg-[var(--color-accent)]' : 'bg-white/15 hover:bg-white/25'}`}
              >
                <Layers size={16} />
              </button>
            )}
          </span>
        </span>
      }
      onClose={onFechar}
      widthClassName="max-w-4xl"
    >
      {semDados ? (
        <p className="text-sm text-[var(--color-text-soft)]">
          Sem dado de Representação pra mostrar — nenhum produto com Código cadastrado bateu com o histórico do BI, ou só tem Classe C nesse filtro.
        </p>
      ) : modoPorTabela ? (
        <>
          <p className="mb-3 text-xs text-[var(--color-text-soft)]">
            {trechoEscopo} — participação de cada Tabela de Preço nas vendas desses itens. Critério:{' '}
            <span className="font-semibold text-[var(--color-text)]">{ROTULO_CRITERIO_REPRESENTACAO[criterio]}</span>, {trechoSafra}.
          </p>
          <div className="h-96">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Chart type="pie" data={chartDataPizzaCanal as any} options={chartOptionsPizzaCanal as any} />
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-[var(--color-text-soft)]">
            {trechoEscopo} — participação de cada item (
            {fatiasPorClasse ? 'Classes A e B da Curva ABC' : `Top ${fatias.length}`}). Critério:{' '}
            <span className="font-semibold text-[var(--color-text)]">{ROTULO_CRITERIO_REPRESENTACAO[criterio]}</span>, {trechoSafra}. Cada produto com uma
            cor própria.
          </p>
          <div className="h-96">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Chart type="pie" data={chartDataPizza as any} options={chartOptionsPizza as any} />
          </div>
        </>
      )}
    </Modal>
  );
}
