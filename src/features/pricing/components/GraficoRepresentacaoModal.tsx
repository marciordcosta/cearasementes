import { Layers } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Chart } from 'react-chartjs-2';
import { Modal } from '@/components/ui/Modal';
import { useTheme } from '@/hooks/useTheme';
import { chartChrome, criarLinhasDivisoriaPizza } from '@/lib/chartSetup';
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
import type { Categoria, Produto, Subcategoria } from '../types';
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
  /** Com os dois passados E sem filtro ativo, a pizza "por Produto" vira agrupada por Categoria
   * mãe — uma fatia por Categoria, subdividida (mesma cor, borda tracejada) por Subcategoria.
   * Com filtro ativo, ignorado — mantém a regra padrão (pizza por produto) de sempre. */
  categorias?: Categoria[];
  subcategorias?: Subcategoria[];
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
  categorias,
  subcategorias,
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

  // Sem filtro ativo E com categorias/subcategorias disponíveis: a pizza "por Produto" vira
  // agrupada por Categoria mãe — uma fatia por Categoria (soma de tudo dela), subdividida por
  // Subcategoria (mesma cor da Categoria, só a borda tracejada marcando onde uma Subcategoria
  // termina e outra começa). Com filtro ativo, isso é ignorado (mantém a regra de sempre).
  const emModoCategorias = !filtroAtivo && !!categorias && !!subcategorias;

  interface SegmentoCategoria {
    categoriaId: string;
    categoriaNome: string;
    rotulo: string;
    valorCriterio: number;
    novoGrupo: boolean;
  }

  const segmentosCategoria = useMemo((): SegmentoCategoria[] => {
    if (!emModoCategorias || !categorias || !subcategorias) return [];
    const categoriaPorId = new Map(categorias.map((cat) => [cat.id, cat]));
    const subcategoriaPorId = new Map(subcategorias.map((sub) => [sub.id, sub]));
    // categoriaId -> (subcategoriaId ?? '') -> soma
    const acumulado = new Map<string, Map<string, number>>();
    representatividadePorProduto.forEach((repr, produtoId) => {
      const produto = produtoPorId.get(produtoId);
      if (!produto) return;
      const subChave = produto.subcategoriaId ?? '';
      const porSub = acumulado.get(produto.categoriaId) ?? new Map<string, number>();
      porSub.set(subChave, (porSub.get(subChave) ?? 0) + repr.valorCriterio);
      acumulado.set(produto.categoriaId, porSub);
    });

    const categoriasComTotal = Array.from(acumulado.entries())
      .map(([categoriaId, porSub]) => ({
        categoriaId,
        categoriaNome: categoriaPorId.get(categoriaId)?.nome ?? '—',
        total: Array.from(porSub.values()).reduce((soma, v) => soma + v, 0),
        porSub,
      }))
      .filter((cat) => cat.total > 0)
      .sort((a, b) => b.total - a.total);

    const segmentos: SegmentoCategoria[] = [];
    categoriasComTotal.forEach(({ categoriaId, categoriaNome, porSub }) => {
      Array.from(porSub.entries())
        .filter(([, valor]) => valor > 0)
        .sort((a, b) => b[1] - a[1])
        .forEach(([subChave, valorCriterio], i) => {
          const rotulo = subChave ? (subcategoriaPorId.get(subChave)?.nome ?? categoriaNome) : categoriaNome;
          segmentos.push({ categoriaId, categoriaNome, rotulo, valorCriterio, novoGrupo: i === 0 });
        });
    });
    return segmentos;
  }, [emModoCategorias, categorias, subcategorias, representatividadePorProduto, produtoPorId]);

  const corPorCategoriaId = useMemo(() => {
    const mapa = new Map<string, string>();
    let indice = 0;
    segmentosCategoria.forEach((s) => {
      if (!mapa.has(s.categoriaId)) mapa.set(s.categoriaId, corPorIndice(indice++, isDark));
    });
    return mapa;
  }, [segmentosCategoria, isDark]);

  // Legenda customizada (só Categorias, não uma entrada por Subcategoria) — a legenda nativa do
  // Chart.js segue 1:1 com as fatias, então some por completo pra essa visão e usa essa lista à parte.
  const legendaCategorias = useMemo(() => {
    const totalGeral = segmentosCategoria.reduce((soma, s) => soma + s.valorCriterio, 0);
    const totalPorCategoria = new Map<string, number>();
    segmentosCategoria.forEach((s) => totalPorCategoria.set(s.categoriaId, (totalPorCategoria.get(s.categoriaId) ?? 0) + s.valorCriterio));
    const vistos = new Set<string>();
    return segmentosCategoria
      .filter((s) => (vistos.has(s.categoriaId) ? false : (vistos.add(s.categoriaId), true)))
      .map((s) => ({
        categoriaId: s.categoriaId,
        nome: s.categoriaNome,
        pct: totalGeral > 0 ? ((totalPorCategoria.get(s.categoriaId) ?? 0) / totalGeral) * 100 : 0,
      }));
  }, [segmentosCategoria]);

  const chartDataCategorias = useMemo(
    () => ({
      labels: segmentosCategoria.map((s) => s.rotulo),
      datasets: [
        {
          type: 'pie' as const,
          data: segmentosCategoria.map((s) => s.valorCriterio),
          backgroundColor: segmentosCategoria.map((s) => corPorCategoriaId.get(s.categoriaId) ?? '#999'),
          borderColor: c.tooltipBg,
          borderWidth: 1,
          borderDash: [3, 2],
        },
      ],
    }),
    [c, segmentosCategoria, corPorCategoriaId],
  );

  const chartOptionsCategorias = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: { dataIndex: number }) => {
              const s = segmentosCategoria[ctx.dataIndex];
              const totalGeral = segmentosCategoria.reduce((soma, i) => soma + i.valorCriterio, 0);
              const pct = totalGeral > 0 ? (s.valorCriterio / totalGeral) * 100 : 0;
              const valorFormatado = criterio === 'qtd' ? `${fmtInt.format(Math.round(s.valorCriterio))} un.` : fmtBRL.format(s.valorCriterio);
              const titulo = s.rotulo === s.categoriaNome ? s.categoriaNome : `${s.categoriaNome} — ${s.rotulo}`;
              return [titulo, `${pct.toFixed(1)}%`, `${ROTULO_CRITERIO_REPRESENTACAO[criterio]}: ${valorFormatado}`];
            },
          },
        },
      },
    }),
    [criterio, segmentosCategoria],
  );

  const fronteirasCategoria = useMemo(() => {
    const indices = new Set<number>();
    segmentosCategoria.forEach((s, i) => {
      if (s.novoGrupo && i > 0) indices.add(i);
    });
    return indices;
  }, [segmentosCategoria]);

  const pluginsPizzaCategorias = useMemo(() => [criarLinhasDivisoriaPizza(fronteirasCategoria, c.tooltipBg)], [fronteirasCategoria, c.tooltipBg]);

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

  const semDados = modoPorTabela ? porCanal.length === 0 : emModoCategorias ? segmentosCategoria.length === 0 : fatias.length === 0;
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
      ) : emModoCategorias ? (
        <>
          <p className="mb-3 text-xs text-[var(--color-text-soft)]">
            Todo o sortimento — participação de cada Categoria (borda tracejada = Subcategoria, mesma cor da Categoria). Critério:{' '}
            <span className="font-semibold text-[var(--color-text)]">{ROTULO_CRITERIO_REPRESENTACAO[criterio]}</span>, {trechoSafra}.
          </p>
          <div className="flex h-96 items-center gap-4">
            <div className="h-full min-w-0 flex-1">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Chart type="pie" data={chartDataCategorias as any} options={chartOptionsCategorias as any} plugins={pluginsPizzaCategorias as any} />
            </div>
            <div className="flex w-44 shrink-0 flex-col gap-1.5 text-xs">
              {legendaCategorias.map((l) => (
                <span key={l.categoriaId} className="flex items-center gap-1.5 text-[var(--color-text)]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: corPorCategoriaId.get(l.categoriaId) }} />
                  <span className="min-w-0 flex-1 truncate">{l.nome}</span>
                  <span className="num shrink-0 text-[var(--color-text-soft)]">{l.pct.toFixed(1)}%</span>
                </span>
              ))}
            </div>
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
