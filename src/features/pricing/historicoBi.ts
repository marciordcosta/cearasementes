import { CODIGOS_PRODUTO_UNIFICADOS } from '@/features/bi/aggregate';
import type { PeriodContext } from '@/features/bi/calculations';
import { getPeriodKeyFor, getPeriodLabel } from '@/features/bi/calculations';
import type { ItemAgg } from '@/features/bi/types';
import type { Transportadora } from '@/features/fretes/types';
import { MESES_PT } from '@/lib/format';
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
  /** Margem bruta como % do Valor Médio (não dos R$) — comparável em pontos percentuais com a margem de hoje, mesmo quando a margem em R$ daquela safra é pequena. Calculada sobre o Valor Médio LÍQUIDO (vlr_com_desc) — ver PricingTable.tsx pra a versão "regrossada" (com o desconto somado de volta) usada na comparação por Safra. */
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
      const margemBrutaPct = valorMedio > 0 ? ((valorMedio - custoMedio) / valorMedio) * 100 : 0;
      mapaSafras.set(key, { key, label: getPeriodLabel(ctx, key), custoMedio, valorMedio, margemBrutaPct, qtd: acc.qtd });
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
  /**
   * Desconto médio REAL dado nessa safra, como % do valor SEM desconto
   * (vlr_desc / vlr_sem_desc) — vem direto do 396, não é estimado. Usado
   * pra "regrossar" o Valor Médio da safra (somar o desconto de volta)
   * antes de calcular a Margem Bruta daquela safra — `valorVendido`/
   * `valorMedio` aqui já saem líquidos de desconto (vlr_com_desc), então
   * sem isso a margem histórica saía descontada duas vezes na comparação
   * com a margem atual (preço de tabela cheio).
   */
  descontoPct: number;
}

/**
 * MB agregada (Margem Bruta de TODA a Tabela, ponderada pelas quantidades
 * vendidas) por Safra — soma direto os totais de TODOS os itens do BI cuja
 * `tabela` bate com esse canal, sem passar pelo cruzamento por Código (então
 * cobre a tabela inteira, mesmo produto sem Código cadastrado na Precificação).
 */
export function construirMargemBrutaAgregadaPorSafra(items: ItemAgg[], canalNome: string, ctx: PeriodContext = SAFRA_PADRAO): Map<string, MargemBrutaAgregada> {
  const alvo = canalNome.trim().toLowerCase();
  const acumulado = new Map<string, { valorVendido: number; custoTotal: number; descontoTotal: number }>();
  for (const item of items) {
    for (const m of item.monthly) {
      if (m.tabela.trim().toLowerCase() !== alvo) continue;
      const key = getPeriodKeyFor(ctx, m.year, m.month);
      const acc = acumulado.get(key) ?? { valorVendido: 0, custoTotal: 0, descontoTotal: 0 };
      acc.valorVendido += m.valorVendido;
      acc.custoTotal += m.custoTotal;
      acc.descontoTotal += m.descontoTotal;
      acumulado.set(key, acc);
    }
  }
  const resultado = new Map<string, MargemBrutaAgregada>();
  acumulado.forEach(({ valorVendido, custoTotal, descontoTotal }, key) => {
    const margemBrutaPct = valorVendido > 0 ? ((valorVendido - custoTotal) / valorVendido) * 100 : 0;
    // valorVendido já é líquido de desconto (vlr_com_desc) — o "sem desconto" é valorVendido + descontoTotal.
    const valorSemDesconto = valorVendido + descontoTotal;
    const descontoPct = valorSemDesconto > 0 ? (descontoTotal / valorSemDesconto) * 100 : 0;
    resultado.set(key, { valorVendido, custoTotal, margemBrutaPct, descontoPct });
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

/** Base de comparação da Representação (%): Faturamento (valor vendido), Quantidade ou Margem Bruta — mesmos 3 critérios da Curva ABC do BI (ver CriterioABC em bi/calculations.ts), reaproveitados aqui. */
export type CriterioRepresentacao = 'valor' | 'qtd' | 'margem';

/** Rótulo de cada critério pro seletor — mesmos nomes já usados no Curva ABC do BI. */
export const ROTULO_CRITERIO_REPRESENTACAO: Record<CriterioRepresentacao, string> = {
  valor: 'Faturamento',
  qtd: 'Quantidade',
  margem: 'Margem Bruta',
};

/** Valor de UMA safra no critério escolhido — Margem Bruta pode dar negativo (produto vendido no prejuízo naquele ano), de propósito: não filtramos isso fora. */
function valorCriterioSafra(h: HistoricoSafra, criterio: CriterioRepresentacao): number {
  if (criterio === 'qtd') return h.qtd;
  if (criterio === 'margem') return (h.valorMedio - h.custoMedio) * h.qtd;
  return h.valorMedio * h.qtd;
}

/** Média (últimas MAX_SAFRAS_EXIBIDAS safras) do critério escolhido pra esse produto — histórico puro, sem projetar pro preço de hoje. */
function mediaCriterioUltimasSafras(porSafra: Map<string, HistoricoSafra>, criterio: CriterioRepresentacao): number {
  const ordenadas = Array.from(porSafra.values())
    .sort((a, b) => b.key.localeCompare(a.key))
    .slice(0, MAX_SAFRAS_EXIBIDAS);
  if (ordenadas.length === 0) return 0;
  return ordenadas.reduce((s, h) => s + valorCriterioSafra(h, criterio), 0) / ordenadas.length;
}

export type ClasseABC = 'A' | 'B' | 'C';

/**
 * Curva ABC clássica (Pareto: A até 80% acumulado, B até 95%, C no resto) —
 * mesma regra de classificarABC em bi/calculations.ts, reimplementada aqui
 * pra trabalhar direto sobre um valor já calculado (em vez de FilteredItemView[]
 * do módulo BI). O 1º item (maior valor) é SEMPRE Classe A, mesmo que ele
 * sozinho já ultrapasse 80% acumulado.
 */
function classificarABCPorValor(itens: { id: string; valor: number }[]): Map<string, ClasseABC> {
  const ordenados = [...itens].sort((a, b) => b.valor - a.valor);
  const total = ordenados.reduce((s, i) => s + i.valor, 0);
  const resultado = new Map<string, ClasseABC>();
  let acumulado = 0;
  ordenados.forEach((item, i) => {
    acumulado += item.valor;
    if (i === 0) {
      resultado.set(item.id, 'A');
      return;
    }
    const pctAcumulado = total > 0 ? acumulado / total : 0;
    resultado.set(item.id, pctAcumulado <= 0.8 ? 'A' : pctAcumulado <= 0.95 ? 'B' : 'C');
  });
  return resultado;
}

export interface Representatividade {
  pct: number;
  /** Média de quantidade vendida (mesma janela de safras) — sempre em unidades, independente do critério escolhido, só pra exibir no tooltip. */
  qtdMedia: number;
  /** Curva ABC (Pareto) entre os produtos que aparecem nessa mesma lista de Representação, pelo critério escolhido. */
  classe: ClasseABC;
  /** Valor médio bruto (na unidade do critério: R$ pra Faturamento/Margem, unidades pra Quantidade) que gerou o %. */
  valorCriterio: number;
}

/**
 * "Representação (%)" — quanto o Faturamento/Quantidade/Margem Bruta médio
 * (últimas MAX_SAFRAS_EXIBIDAS safras, cada produto com a sua própria
 * quantidade de safras disponíveis) de cada produto pesa em relação à SOMA
 * desses valores entre os produtos com Código cadastrado e batendo nessa
 * Tabela. Por construção, a soma das % sempre fecha 100% entre os produtos
 * que aparecem — não compara com o valor real da tabela inteira (que inclui
 * produto sem Código cadastrado, fora da conta aqui de propósito).
 */
export function calcularRepresentatividade(
  produtos: Produto[],
  historicoPorCodigo: Map<string, Map<string, HistoricoSafra>>,
  criterio: CriterioRepresentacao = 'valor',
): Map<string, Representatividade> {
  const porProduto = new Map<string, { valor: number; qtdMedia: number }>();
  let total = 0;
  for (const produto of produtos) {
    if (!produto.codigo) continue;
    const porSafra = historicoPorCodigo.get(codigoCanonico(produto.codigo));
    if (!porSafra) continue;
    const qtdMedia = mediaCriterioUltimasSafras(porSafra, 'qtd');
    if (qtdMedia <= 0) continue;
    const valor = mediaCriterioUltimasSafras(porSafra, criterio);
    porProduto.set(produto.id, { valor, qtdMedia });
    total += valor;
  }
  const resultado = new Map<string, Representatividade>();
  if (porProduto.size === 0) return resultado;
  const classes = classificarABCPorValor(Array.from(porProduto.entries()).map(([id, v]) => ({ id, valor: v.valor })));
  porProduto.forEach(({ valor, qtdMedia }, produtoId) =>
    resultado.set(produtoId, { pct: total !== 0 ? (valor / total) * 100 : 0, qtdMedia, classe: classes.get(produtoId)!, valorCriterio: valor }),
  );
  return resultado;
}

/**
 * "Representação Geral" — igual à Representação (%) por Tabela, só que
 * somando a média de cada produto em TODAS as Tabelas de Preço (não só
 * uma). Um produto vendido em várias Tabelas tem seu peso somado entre
 * elas antes de comparar com a soma geral de todo mundo — mede o quanto
 * aquele produto importa pro negócio inteiro, não só numa Tabela específica.
 */
export function calcularRepresentatividadeGeral(
  produtos: Produto[],
  canais: Canal[],
  items: ItemAgg[],
  criterio: CriterioRepresentacao = 'valor',
): Map<string, Representatividade> {
  const acumuladoPorProduto = new Map<string, { valor: number; qtdMedia: number }>();
  for (const canal of canais) {
    const historicoPorCodigo = construirHistoricoPorCodigo(items, canal.nome);
    for (const produto of produtos) {
      if (!produto.codigo) continue;
      const porSafra = historicoPorCodigo.get(codigoCanonico(produto.codigo));
      if (!porSafra) continue;
      const qtdMedia = mediaCriterioUltimasSafras(porSafra, 'qtd');
      if (qtdMedia <= 0) continue;
      const acc = acumuladoPorProduto.get(produto.id) ?? { valor: 0, qtdMedia: 0 };
      acc.valor += mediaCriterioUltimasSafras(porSafra, criterio);
      acc.qtdMedia += qtdMedia;
      acumuladoPorProduto.set(produto.id, acc);
    }
  }
  const total = Array.from(acumuladoPorProduto.values()).reduce((s, v) => s + v.valor, 0);
  const resultado = new Map<string, Representatividade>();
  if (acumuladoPorProduto.size === 0) return resultado;
  const classes = classificarABCPorValor(Array.from(acumuladoPorProduto.entries()).map(([id, v]) => ({ id, valor: v.valor })));
  acumuladoPorProduto.forEach(({ valor, qtdMedia }, produtoId) =>
    resultado.set(produtoId, { pct: total !== 0 ? (valor / total) * 100 : 0, qtdMedia, classe: classes.get(produtoId)!, valorCriterio: valor }),
  );
  return resultado;
}

export interface MargemAtualProjetada {
  valorProjetado: number;
  margemProjetada: number;
  margemBrutaPct: number;
  margemLiquidaProjetada: number;
  /** "M.C. prevista" — margem líquida (ML $, já com imposto/encargos/frete) projetada, em % do valor projetado. */
  margemLiquidaPct: number;
  /** Frete projetado (R$) — só quando o canal considera frete na margem (freteIncluso !== false), igual à conta de margemLiquidaProjetada. Usado no DRE (ver MargemResumoModal.tsx). */
  freteProjetado: number;
  /** Encargos projetado (R$) — imposto + desconto/comissão/cartão + outros encargos, mesma soma da coluna "Encargos (R$)" da grade. Usado no DRE (ali, Descontos é mostrado à parte — ver descontoProjetado). */
  encargosProjetado: number;
  /** Só a parcela de Desconto (canal.desconto) dentro de encargosProjetado — separada pro DRE mostrar como linha própria. */
  descontoProjetado: number;
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
  const freteConsiderado = canal.freteIncluso !== false;
  let valorProjetado = 0;
  let margemProjetada = 0;
  let margemLiquidaProjetada = 0;
  let freteProjetado = 0;
  let encargosProjetado = 0;
  let descontoProjetado = 0;
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
    if (freteConsiderado) freteProjetado += r.freteReais * qtdMedia;
    encargosProjetado += r.impostoReais * qtdMedia;
    descontoProjetado += ((r.preco * canal.desconto) / 100) * qtdMedia;
  }
  return {
    valorProjetado,
    margemProjetada,
    margemBrutaPct: valorProjetado > 0 ? (margemProjetada / valorProjetado) * 100 : 0,
    margemLiquidaProjetada,
    margemLiquidaPct: valorProjetado > 0 ? (margemLiquidaProjetada / valorProjetado) * 100 : 0,
    freteProjetado,
    encargosProjetado,
    descontoProjetado,
  };
}

export interface CurvaMensalTabela {
  tabela: string;
  /** 12 posições, alinhadas com `meses` do mesmo retorno — média (últimas MAX_SAFRAS_EXIBIDAS safras) do critério escolhido naquele mês, só nessa Tabela. */
  valores: number[];
}

export interface CurvaMensalProduto {
  /** 12 rótulos de mês (só o nome, sem ano) começando em SAFRA_PADRAO.seasonStartMonth — mesma ordem usada nas colunas de Safra. */
  meses: string[];
  tabelas: CurvaMensalTabela[];
}

/**
 * Curva de venda mensal de UM produto, uma linha por Tabela de Preço — cada
 * ponto é a MÉDIA (últimas MAX_SAFRAS_EXIBIDAS safras com dado nesse produto,
 * mesma janela/filosofia da Representação) daquele mês específico do "ano da
 * safra" (ex.: todo Agosto vira 1 ponto só, com a média dos Agostos das
 * últimas safras) — sem o ano no eixo, de propósito.
 */
export function construirCurvaMensalProduto(
  items: ItemAgg[],
  codigoProduto: string,
  criterio: CriterioRepresentacao,
  ctx: PeriodContext = SAFRA_PADRAO,
): CurvaMensalProduto {
  const meses = Array.from({ length: 12 }, (_, i) => MESES_PT[(ctx.seasonStartMonth - 1 + i) % 12]);
  const codigo = codigoCanonico(codigoProduto);
  const item = items.find((i) => i.codInterno === codigo);
  if (!item) return { meses, tabelas: [] };

  // Últimas (até) MAX_SAFRAS_EXIBIDAS safras com QUALQUER venda desse produto (em qualquer Tabela)
  // — mesma janela pra todas as Tabelas, pra ficarem comparáveis no mesmo gráfico.
  const safrasComDado = Array.from(new Set(item.monthly.map((m) => getPeriodKeyFor(ctx, m.year, m.month))))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, MAX_SAFRAS_EXIBIDAS);
  const safrasConsideradas = new Set(safrasComDado);

  const porTabela = new Map<string, Map<number, { soma: number; contagem: number }>>();
  for (const m of item.monthly) {
    if (!safrasConsideradas.has(getPeriodKeyFor(ctx, m.year, m.month))) continue;
    const posicao = (m.month - ctx.seasonStartMonth + 12) % 12;
    const valor = criterio === 'qtd' ? m.qtd : criterio === 'margem' ? m.valorVendido - m.custoTotal : m.valorVendido;
    const porMes = porTabela.get(m.tabela) ?? new Map<number, { soma: number; contagem: number }>();
    const acc = porMes.get(posicao) ?? { soma: 0, contagem: 0 };
    acc.soma += valor;
    acc.contagem += 1;
    porMes.set(posicao, acc);
    porTabela.set(m.tabela, porMes);
  }

  const tabelas: CurvaMensalTabela[] = Array.from(porTabela.entries()).map(([tabela, porMes]) => ({
    tabela,
    valores: Array.from({ length: 12 }, (_, posicao) => {
      const acc = porMes.get(posicao);
      return acc && acc.contagem > 0 ? acc.soma / acc.contagem : 0;
    }),
  }));

  return { meses, tabelas };
}
