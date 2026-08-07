import { CODIGOS_PRODUTO_UNIFICADOS } from '@/features/bi/aggregate';
import type { PeriodContext } from '@/features/bi/calculations';
import { getPeriodKeyFor, getPeriodLabel } from '@/features/bi/calculations';
import type { ItemAgg } from '@/features/bi/types';
import type { Transportadora } from '@/features/fretes/types';
import { calcularCanal } from './calculations';
import type { Canal, Categoria, Produto, Subcategoria } from './types';

/** Mesma definição de "Safra" usada por padrão no BI (DashboardPage.tsx) — começa em agosto. */
export const SAFRA_PADRAO: PeriodContext = { mode: 'season', seasonStartMonth: 8 };

/**
 * O BI já unifica códigos duplicados do MESMO produto (ver
 * CODIGOS_PRODUTO_UNIFICADOS em bi/aggregate.ts, ex.: 1 e 2 = mesmo produto,
 * tudo fica gravado só sob o 2) — então `historicoPorCodigo` NUNCA tem uma
 * entrada pro código "extra" (1). Sem isso, um produto da Precificação
 * cadastrado com o Código "extra" nunca encontraria histórico nenhum, mesmo
 * vendendo normalmente sob o outro código.
 */
function codigoCanonico(codigo: string): string {
  return CODIGOS_PRODUTO_UNIFICADOS[codigo] ?? codigo;
}

export interface HistoricoSafra {
  key: string;
  label: string;
  custoMedio: number;
  valorMedio: number;
  margemBruta: number;
  /** Margem bruta como % do Valor Médio (não dos R$) — comparável em pontos percentuais com a margem de hoje, mesmo quando a margem em R$ daquela safra é pequena. */
  margemBrutaPct: number;
  qtd: number;
}

/**
 * codInterno -> safraKey -> dados agregados daquela safra, só pras vendas
 * cujo `tabela` (texto livre do relatório importado) bate com `canalNome`
 * (normalizado, mesmo critério de construirTaxasPorTabela em bi/calculations.ts).
 * Cruza só por Código Interno — sem fallback por nome, pra nunca comparar
 * com o produto errado (produto sem código batendo fica sem histórico).
 */
export function construirHistoricoPorCodigo(
  items: ItemAgg[],
  canalNome: string,
  ctx: PeriodContext = SAFRA_PADRAO,
): Map<string, Map<string, HistoricoSafra>> {
  const alvo = canalNome.trim().toLowerCase();
  const resultado = new Map<string, Map<string, HistoricoSafra>>();
  for (const item of items) {
    if (!item.codInterno) continue;
    const porSafra = new Map<string, { qtd: number; valorVendido: number; custoTotal: number }>();
    for (const m of item.monthly) {
      if (m.tabela.trim().toLowerCase() !== alvo) continue;
      const key = getPeriodKeyFor(ctx, m.year, m.month);
      const acc = porSafra.get(key) ?? { qtd: 0, valorVendido: 0, custoTotal: 0 };
      acc.qtd += m.qtd;
      acc.valorVendido += m.valorVendido;
      acc.custoTotal += m.custoTotal;
      porSafra.set(key, acc);
    }
    if (porSafra.size === 0) continue;
    const mapaSafras = new Map<string, HistoricoSafra>();
    porSafra.forEach((acc, key) => {
      if (acc.qtd === 0) return;
      const custoMedio = acc.custoTotal / acc.qtd;
      const valorMedio = acc.valorVendido / acc.qtd;
      const margemBruta = valorMedio - custoMedio;
      const margemBrutaPct = valorMedio > 0 ? (margemBruta / valorMedio) * 100 : 0;
      mapaSafras.set(key, { key, label: getPeriodLabel(ctx, key), custoMedio, valorMedio, margemBruta, margemBrutaPct, qtd: acc.qtd });
    });
    if (mapaSafras.size > 0) resultado.set(item.codInterno, mapaSafras);
  }
  return resultado;
}

/** Quantas Safras mostrar como coluna — mais que isso lota a grade de tela cheia. */
export const MAX_SAFRAS_EXIBIDAS = 3;

/** União de safras presentes (pra essa Tabela) em qualquer produto — mais recente primeiro, limitada a MAX_SAFRAS_EXIBIDAS. */
export function listarSafrasDisponiveis(historico: Map<string, Map<string, HistoricoSafra>>): { key: string; label: string }[] {
  const vistos = new Map<string, string>();
  historico.forEach((porSafra) => porSafra.forEach((s) => vistos.set(s.key, s.label)));
  return Array.from(vistos.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, MAX_SAFRAS_EXIBIDAS)
    .map(([key, label]) => ({ key, label }));
}

export interface MargemBrutaAgregada {
  valorVendido: number;
  custoTotal: number;
  /** (valorVendido - custoTotal) / valorVendido * 100 — já pondera as quantidades por natureza (valorVendido/custoTotal são SOMAS sobre todo mundo vendido, não médias por produto). */
  margemBrutaPct: number;
}

/**
 * MB agregada (Margem Bruta de TODA a Tabela, ponderada pelas quantidades
 * vendidas) por Safra — soma direto os totais de TODOS os itens do BI cuja
 * `tabela` bate com esse canal, sem passar pelo cruzamento por Código (então
 * cobre a tabela inteira, mesmo produto sem Código cadastrado na Precificação).
 */
export function construirMargemBrutaAgregadaPorSafra(items: ItemAgg[], canalNome: string, ctx: PeriodContext = SAFRA_PADRAO): Map<string, MargemBrutaAgregada> {
  const alvo = canalNome.trim().toLowerCase();
  const acumulado = new Map<string, { valorVendido: number; custoTotal: number }>();
  for (const item of items) {
    for (const m of item.monthly) {
      if (m.tabela.trim().toLowerCase() !== alvo) continue;
      const key = getPeriodKeyFor(ctx, m.year, m.month);
      const acc = acumulado.get(key) ?? { valorVendido: 0, custoTotal: 0 };
      acc.valorVendido += m.valorVendido;
      acc.custoTotal += m.custoTotal;
      acumulado.set(key, acc);
    }
  }
  const resultado = new Map<string, MargemBrutaAgregada>();
  acumulado.forEach((acc, key) => {
    const margemBrutaPct = acc.valorVendido > 0 ? ((acc.valorVendido - acc.custoTotal) / acc.valorVendido) * 100 : 0;
    resultado.set(key, { ...acc, margemBrutaPct });
  });
  return resultado;
}

/** Média de quantidade vendida nas últimas (até) MAX_SAFRAS_EXIBIDAS safras desse produto — usada como peso/estimativa de volume pra projetar a MB atual da tabela. */
function mediaQtdUltimasSafras(porSafra: Map<string, HistoricoSafra>): number {
  const ordenadas = Array.from(porSafra.values())
    .sort((a, b) => b.key.localeCompare(a.key))
    .slice(0, MAX_SAFRAS_EXIBIDAS);
  if (ordenadas.length === 0) return 0;
  return ordenadas.reduce((s, h) => s + h.qtd, 0) / ordenadas.length;
}

/** Média (últimas MAX_SAFRAS_EXIBIDAS safras) do valor vendido TOTAL desse produto — histórico puro, sem projetar pro preço de hoje. */
function mediaValorVendidoUltimasSafras(porSafra: Map<string, HistoricoSafra>): number {
  const ordenadas = Array.from(porSafra.values())
    .sort((a, b) => b.key.localeCompare(a.key))
    .slice(0, MAX_SAFRAS_EXIBIDAS);
  if (ordenadas.length === 0) return 0;
  return ordenadas.reduce((s, h) => s + h.valorMedio * h.qtd, 0) / ordenadas.length;
}

export interface Representatividade {
  pct: number;
  /** Média de quantidade vendida (mesma janela de safras usada no valor) — só pra exibir no tooltip. */
  qtdMedia: number;
}

/**
 * "Representação (%)" — quanto o valor vendido médio (últimas
 * MAX_SAFRAS_EXIBIDAS safras, cada produto com a sua própria quantidade de
 * safras disponíveis) de cada produto pesa em relação à SOMA dessas médias
 * entre os produtos com Código cadastrado e batendo nessa Tabela. Por
 * construção, a soma das % sempre fecha 100% entre os produtos que
 * aparecem — não compara com o valor vendido real da tabela inteira (que
 * inclui produto sem Código cadastrado, fora da conta aqui de propósito).
 */
export function calcularRepresentatividade(produtos: Produto[], historicoPorCodigo: Map<string, Map<string, HistoricoSafra>>): Map<string, Representatividade> {
  const valorMedioPorProduto = new Map<string, { valorMedio: number; qtdMedia: number }>();
  let totalValorMedio = 0;
  for (const produto of produtos) {
    if (!produto.codigo) continue;
    const porSafra = historicoPorCodigo.get(codigoCanonico(produto.codigo));
    if (!porSafra) continue;
    const valorMedioProduto = mediaValorVendidoUltimasSafras(porSafra);
    if (valorMedioProduto <= 0) continue;
    valorMedioPorProduto.set(produto.id, { valorMedio: valorMedioProduto, qtdMedia: mediaQtdUltimasSafras(porSafra) });
    totalValorMedio += valorMedioProduto;
  }
  const resultado = new Map<string, Representatividade>();
  if (totalValorMedio <= 0) return resultado;
  valorMedioPorProduto.forEach(({ valorMedio, qtdMedia }, produtoId) => resultado.set(produtoId, { pct: (valorMedio / totalValorMedio) * 100, qtdMedia }));
  return resultado;
}

export interface MargemAtualProjetada {
  valorProjetado: number;
  margemProjetada: number;
  margemBrutaPct: number;
  margemLiquidaProjetada: number;
  /** "M.C. prevista" — margem líquida (ML $, já com imposto/encargos/frete) projetada, em % do valor projetado. */
  margemLiquidaPct: number;
}

/**
 * MB/M.C. "atuais" da Tabela inteira, projetadas: pra cada produto com
 * Código batendo no histórico, usa a média de quantidade vendida nas
 * últimas safras como peso, aplicada à margem de HOJE desse produto —
 * bruta (preço atual − custo atual) e líquida (a mesma margem líquida já
 * calculada por produto, ML $, com imposto/encargos/frete) — estimativa de
 * quanto a tabela renderia vendendo no volume/mix de sempre, aos preços de
 * hoje. Produto sem histórico (Código não batendo) não entra na conta.
 */
export function calcularMargemAtualProjetada(
  produtos: Produto[],
  canal: Canal,
  categorias: Categoria[],
  subcategorias: Subcategoria[],
  transportadoraPorId: Map<string, Transportadora>,
  canaisPorId: Map<string, Canal>,
  historicoPorCodigo: Map<string, Map<string, HistoricoSafra>>,
): MargemAtualProjetada {
  let valorProjetado = 0;
  let margemProjetada = 0;
  let margemLiquidaProjetada = 0;
  for (const produto of produtos) {
    if (!produto.codigo) continue;
    const porSafra = historicoPorCodigo.get(codigoCanonico(produto.codigo));
    if (!porSafra) continue;
    const qtdMedia = mediaQtdUltimasSafras(porSafra);
    if (qtdMedia <= 0) continue;
    const categoria = categorias.find((c) => c.id === produto.categoriaId) ?? categorias[0];
    const subcategoria = subcategorias.find((s) => s.id === produto.subcategoriaId);
    const r = calcularCanal(produto, canal, categoria, subcategoria, transportadoraPorId, canaisPorId);
    valorProjetado += r.preco * qtdMedia;
    margemProjetada += (r.preco - produto.custo) * qtdMedia;
    margemLiquidaProjetada += r.margemReais * qtdMedia;
  }
  return {
    valorProjetado,
    margemProjetada,
    margemBrutaPct: valorProjetado > 0 ? (margemProjetada / valorProjetado) * 100 : 0,
    margemLiquidaProjetada,
    margemLiquidaPct: valorProjetado > 0 ? (margemLiquidaProjetada / valorProjetado) * 100 : 0,
  };
}
