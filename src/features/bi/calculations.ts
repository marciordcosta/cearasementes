import { MESES_PT } from '@/lib/format';
import type { CoberturaItens } from './aggregate';
import type {
  CarrierAgg,
  FilteredCarrierRow,
  FilteredItemView,
  FilteredPriceTableView,
  ItemAgg,
  MonthAggregate,
  MonthlyPriceTable,
  PeriodMode,
  PeriodStats,
  PriceTableAgg,
} from './types';

export interface PeriodContext {
  mode: PeriodMode;
  seasonStartMonth: number; // 1-12
}

/**
 * Ano civil: cada período é o próprio ano ("2025"). Safra: um período cobre
 * seasonStartMonth do ano Y até o mês anterior do ano Y+1 ("2024/2025").
 */
export function getPeriodKeyFor(ctx: PeriodContext, year: number, month: number): string {
  if (ctx.mode === 'season') {
    return month >= ctx.seasonStartMonth ? `${year}/${year + 1}` : `${year - 1}/${year}`;
  }
  return String(year);
}

export function getPeriodLabel(ctx: PeriodContext, key: string): string {
  if (key === 'all') return ctx.mode === 'season' ? 'Todas as Safras' : 'Todos os Anos';
  if (ctx.mode === 'season') {
    const [y1, y2] = key.split('/');
    return `Safra ${y1.slice(2)}/${y2.slice(2)}`;
  }
  return key;
}

export function getAvailableYears(ctx: PeriodContext, priceTables: PriceTableAgg[], carriers: Map<string, CarrierAgg>): string[] {
  const periods = new Set<string>();
  priceTables.forEach((t) => t.monthly.forEach((m) => periods.add(getPeriodKeyFor(ctx, m.year, m.month))));
  carriers.forEach((c) =>
    c.monthly.forEach((_, key) => {
      const [y, mo] = key.split('-');
      periods.add(getPeriodKeyFor(ctx, Number(y), Number(mo)));
    }),
  );
  return Array.from(periods).sort();
}

export function tablePeriodStats(ctx: PeriodContext, t: PriceTableAgg, periodKey: string): PeriodStats | null {
  const months = t.monthly.filter((m) => getPeriodKeyFor(ctx, m.year, m.month) === periodKey);
  if (months.length === 0) return null;
  const clientSet = new Set<string>();
  let avulsos = 0;
  months.forEach((m) => {
    m.clientSet.forEach((code) => clientSet.add(code));
    avulsos += m.avulsos;
  });
  return {
    valorBruto: months.reduce((s, m) => s + m.valorBruto, 0),
    desconto: months.reduce((s, m) => s + m.desconto, 0),
    valorLiquido: months.reduce((s, m) => s + m.valor, 0),
    registros: months.reduce((s, m) => s + m.registros, 0),
    qtdCliente: clientSet.size + avulsos,
  };
}

/**
 * Contagem de clientes DEDUPLICADA entre Tabelas de Preço diferentes — um cliente que comprou em
 * "Varejo" e "Atacado" no mesmo período conta 1 vez, não 2. `qtdCliente` de `PeriodStats`/
 * `FilteredPriceTableView` já dedup DENTRO de uma tabela só; somar esses valores entre tabelas
 * (como os totais faziam antes) infla a contagem pra qualquer cliente que compra em mais de uma
 * Tabela. Mesma técnica já usada em `getMonthAggregate` (Set único compartilhado antes do `.size`).
 */
export function qtdClientesDeduplicados(tabelas: { monthly: MonthlyPriceTable[] }[]): number {
  const clientSet = new Set<string>();
  let avulsos = 0;
  tabelas.forEach((t) =>
    t.monthly.forEach((m) => {
      m.clientSet.forEach((code) => clientSet.add(code));
      avulsos += m.avulsos;
    }),
  );
  return clientSet.size + avulsos;
}

/** Junta faturamento (tabelas de preço) + transportadoras de um mês/ano específico. */
export function getMonthAggregate(
  priceTables: PriceTableAgg[],
  carriers: Map<string, CarrierAgg>,
  year: number,
  month: number,
): MonthAggregate | null {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  let valorLiquido = 0;
  let registros = 0;
  let pedidos = 0;
  let valorTransportado = 0;
  const clientSet = new Set<string>();
  let avulsos = 0;
  let found = false;

  priceTables.forEach((t) => {
    t.monthly.forEach((m) => {
      if (m.year === year && m.month === month) {
        found = true;
        valorLiquido += m.valor;
        registros += m.registros;
        m.clientSet.forEach((code) => clientSet.add(code));
        avulsos += m.avulsos;
      }
    });
  });
  carriers.forEach((c) => {
    const m = c.monthly.get(key);
    if (m) {
      found = true;
      pedidos += m.pedidos;
      valorTransportado += m.valor;
    }
  });

  if (!found) return null;
  return {
    key,
    year,
    month,
    label: `${MESES_PT[month - 1]}/${year}`,
    valorLiquido,
    registros,
    qtdCliente: clientSet.size + avulsos,
    pedidos,
    valorTransportado,
  };
}

export function getPeriodMonthlyBreakdown(
  ctx: PeriodContext,
  priceTables: PriceTableAgg[],
  carriers: Map<string, CarrierAgg>,
  periodKey: string,
): MonthAggregate[] {
  const monthKeys = new Set<string>();
  priceTables.forEach((t) =>
    t.monthly.forEach((m) => {
      if (getPeriodKeyFor(ctx, m.year, m.month) === periodKey) monthKeys.add(`${m.year}-${String(m.month).padStart(2, '0')}`);
    }),
  );
  carriers.forEach((c) =>
    c.monthly.forEach((_, key) => {
      const [y, mo] = key.split('-');
      if (getPeriodKeyFor(ctx, Number(y), Number(mo)) === periodKey) monthKeys.add(key);
    }),
  );

  return Array.from(monthKeys)
    .sort()
    .map((key) => {
      const [y, mo] = key.split('-');
      return getMonthAggregate(priceTables, carriers, Number(y), Number(mo))!;
    });
}

/**
 * Rótulos dos 12 "meses" de UM período, na ordem em que aparecem nele — em
 * ano civil é sempre Jan..Dez; em safra é seasonStartMonth..seasonStartMonth-1
 * (ex.: safra que começa em Julho vira Jul..Jun). Usado como eixo X comum
 * pra sobrepor vários períodos no mesmo gráfico de linha.
 */
export function mesesDoPeriodo(ctx: PeriodContext): string[] {
  const inicio = ctx.mode === 'season' ? ctx.seasonStartMonth : 1;
  return Array.from({ length: 12 }, (_, i) => MESES_PT[(inicio - 1 + i) % 12]);
}

/** Posição (0-11) de um mês-calendário dentro do período, na mesma ordem de mesesDoPeriodo. */
export function posicaoNoPeriodo(ctx: PeriodContext, mes: number): number {
  const inicio = ctx.mode === 'season' ? ctx.seasonStartMonth : 1;
  return (mes - inicio + 12) % 12;
}

export function getFilteredPriceTables(
  ctx: PeriodContext,
  priceTables: PriceTableAgg[],
  selectedPeriod: string,
): FilteredPriceTableView[] {
  return priceTables
    .map((t): FilteredPriceTableView | null => {
      const stats = selectedPeriod === 'all' ? t.overall : tablePeriodStats(ctx, t, selectedPeriod);
      if (!stats) return null;
      const monthly = selectedPeriod === 'all' ? t.monthly : t.monthly.filter((m) => getPeriodKeyFor(ctx, m.year, m.month) === selectedPeriod);
      return {
        name: t.name,
        valorBruto: stats.valorBruto,
        desconto: stats.desconto,
        valorLiquido: stats.valorLiquido,
        totalReg: stats.registros,
        qtdCliente: stats.qtdCliente,
        monthly,
        ref: t,
      };
    })
    .filter((v): v is FilteredPriceTableView => v !== null);
}

export function getFilteredCarrierRows(
  ctx: PeriodContext,
  carriers: Map<string, CarrierAgg>,
  selectedPeriod: string,
): FilteredCarrierRow[] {
  const rows: FilteredCarrierRow[] = [];
  carriers.forEach((c, name) => {
    if (selectedPeriod === 'all') {
      rows.push({ name, pedidos: c.pedidos, valor: c.valor });
      return;
    }
    let pedidos = 0;
    let valor = 0;
    c.monthly.forEach((m, key) => {
      const [y, mo] = key.split('-');
      if (getPeriodKeyFor(ctx, Number(y), Number(mo)) === selectedPeriod) {
        pedidos += m.pedidos;
        valor += m.valor;
      }
    });
    if (pedidos > 0) rows.push({ name, pedidos, valor });
  });
  return rows;
}

/** Encargos percentuais de uma Tabela de Preço (Canal, ver módulo Precificação) — imposto/comissão/cartão, já resolvidos num único número por Canal. */
export interface TaxasTabela {
  impostoPct: number;
  comissao: number;
  cartao: number;
}

/**
 * Monta a taxa de encargos (%) de cada Tabela de Preço (Canal) — chave é o
 * nome do Canal em minúsculo, pra casar com `tabela_preco` das vendas sem
 * depender de maiúsculas ("PADRÃO" vs "Padrão"). Imposto usa a MÉDIA das
 * Categorias cadastradas (estadual ou interestadual, conforme o Canal) em
 * vez do imposto exato do produto — a maioria dos produtos vendidos ainda
 * não tem Categoria cadastrada na Precificação (só um punhado cadastrado até
 * agora), então uma alíquota por produto deixaria a conta em branco pra
 * quase todo mundo; a média já é exata hoje mesmo assim, porque todas as
 * Categorias cadastradas têm a mesma alíquota (só muda se isso divergir no
 * futuro). Comissão e Cartão já são exatos, vêm direto do Canal.
 */
export function construirTaxasPorTabela(canais: { nome: string; comissao: number; cartao: number; tipoImposto: 'estadual' | 'interestadual' }[], categorias: { estadual: number; interestadual: number }[]): Map<string, TaxasTabela> {
  const impostoMedio = (tipo: 'estadual' | 'interestadual') =>
    categorias.length > 0 ? categorias.reduce((s, c) => s + c[tipo], 0) / categorias.length : 0;
  const mapa = new Map<string, TaxasTabela>();
  for (const canal of canais) {
    mapa.set(canal.nome.trim().toLowerCase(), { impostoPct: impostoMedio(canal.tipoImposto), comissao: canal.comissao, cartao: canal.cartao });
  }
  return mapa;
}

/** `tabelaFiltro` = 'all' pra visão Geral (soma todas as Tabelas de Preço) ou o nome de uma Tabela específica (ver seletor em AnaliseProdutosSection.tsx). */
export function getFilteredItems(
  ctx: PeriodContext,
  items: ItemAgg[],
  selectedPeriod: string,
  tabelaFiltro: string,
  taxasPorTabela: Map<string, TaxasTabela> = new Map(),
): FilteredItemView[] {
  return items
    .map((item): FilteredItemView | null => {
      const meses = item.monthly.filter(
        (m) => (tabelaFiltro === 'all' || m.tabela === tabelaFiltro) && (selectedPeriod === 'all' || getPeriodKeyFor(ctx, m.year, m.month) === selectedPeriod),
      );
      if (meses.length === 0) return null;
      const qtd = meses.reduce((s, m) => s + m.qtd, 0);
      const valorVendido = meses.reduce((s, m) => s + m.valorVendido, 0);
      const custoTotal = meses.reduce((s, m) => s + m.custoTotal, 0);
      if (qtd === 0 && valorVendido === 0) return null;
      // Cada mês/tabela usa a taxa da SUA PRÓPRIA Tabela de Preço — importa na visão "Geral", onde um
      // mesmo produto pode ter sido vendido em Tabelas com Canais (e portanto encargos) diferentes.
      const descontoReais = meses.reduce((s, m) => s + m.descontoTotal, 0);
      let impostoReais = 0;
      let comissaoReais = 0;
      let cartaoReais = 0;
      for (const m of meses) {
        const taxas = taxasPorTabela.get(m.tabela.trim().toLowerCase());
        if (!taxas) continue;
        impostoReais += (m.valorVendido * taxas.impostoPct) / 100;
        comissaoReais += (m.valorVendido * taxas.comissao) / 100;
        cartaoReais += (m.valorVendido * taxas.cartao) / 100;
      }
      const encargosDetalhe = { impostoReais, comissaoReais, cartaoReais, descontoReais };
      // Margem NÃO desconta o desconto — `valorVendido` já vem líquido de desconto (vlr_com_desc, ver
      // aggregate.ts), então o desconto já está refletido nele; subtrair de novo aqui contaria o mesmo
      // desconto duas vezes. Só imposto/comissão/cartão são custo "de verdade" ainda não refletido em `valorVendido`.
      const margem = valorVendido - custoTotal - (impostoReais + comissaoReais + cartaoReais);
      return {
        produto: item.produto,
        codInterno: item.codInterno,
        qtd,
        valorVendido,
        custoTotal,
        margem,
        margemPct: valorVendido > 0 ? margem / valorVendido : 0,
        encargosDetalhe,
        ref: item,
      };
    })
    .filter((v): v is FilteredItemView => v !== null);
}

/** Base de comparação da Curva ABC: Faturamento (valor vendido), Quantidade vendida ou Margem de lucro — ver seletor em AnaliseProdutosSection.tsx. */
export type CriterioABC = 'valor' | 'qtd' | 'margem';

/** Valor do item no critério escolhido — mesma função usada pra ordenar a tabela e pra acumular a Curva ABC, pra nunca desalinhar ordenação e classificação. */
export function valorCriterioABC(item: FilteredItemView, criterio: CriterioABC): number {
  if (criterio === 'qtd') return item.qtd;
  if (criterio === 'margem') return item.margem;
  return item.valorVendido;
}

/**
 * Classe A/B/C de cada item de `itensOrdenados` (já ordenados pelo mesmo
 * `criterio`, decrescente) pelo % acumulado do critério escolhido — A até
 * 80%, B até 95%, C no resto. Curva ABC clássica: poucos produtos concentram
 * a maior parte do total (padrão: faturamento; também pode ser por
 * quantidade ou margem). O 1º item (o mais dominante nesse critério) é
 * SEMPRE Classe A, mesmo que ele sozinho já ultrapasse 80% acumulado —
 * senão um produto extremamente concentrado (ex.: 81% da quantidade total
 * sozinho) cairia em B pela régua estrita, o que é contraintuitivo: ele
 * continua sendo o item mais importante da lista.
 */
export function classificarABC(itensOrdenados: FilteredItemView[], criterio: CriterioABC = 'valor'): ('A' | 'B' | 'C')[] {
  const total = itensOrdenados.reduce((s, i) => s + valorCriterioABC(i, criterio), 0);
  let acumulado = 0;
  return itensOrdenados.map((item, i) => {
    acumulado += valorCriterioABC(item, criterio);
    if (i === 0) return 'A';
    const pctAcumulado = total > 0 ? acumulado / total : 0;
    if (pctAcumulado <= 0.8) return 'A';
    if (pctAcumulado <= 0.95) return 'B';
    return 'C';
  });
}

/** Soma a cobertura de detalhamento por item no período/tabela selecionados — usado pra avisar quando a Análise por Produto está vendo só uma fração das vendas (ex.: ano importado sem item nenhum). */
export function getCoberturaFiltrada(ctx: PeriodContext, cobertura: CoberturaItens[], selectedPeriod: string, tabelaFiltro: string): { totalVendas: number; vendasComItem: number } {
  const filtrada = cobertura.filter(
    (c) => (tabelaFiltro === 'all' || c.tabela === tabelaFiltro) && (selectedPeriod === 'all' || getPeriodKeyFor(ctx, c.year, c.month) === selectedPeriod),
  );
  return {
    totalVendas: filtrada.reduce((s, c) => s + c.totalVendas, 0),
    vendasComItem: filtrada.reduce((s, c) => s + c.vendasComItem, 0),
  };
}
