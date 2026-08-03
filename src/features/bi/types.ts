export type PeriodMode = 'calendar' | 'season';

export interface MonthlyCarrier {
  pedidos: number;
  valor: number;
}

export interface CarrierAgg {
  nome: string;
  pedidos: number;
  valor: number;
  /** chave 'YYYY-MM' -> totais do mês */
  monthly: Map<string, MonthlyCarrier>;
}

export interface MonthlyPriceTable {
  year: number;
  month: number;
  label: string;
  valor: number;
  valorBruto: number;
  desconto: number;
  registros: number;
  /** Códigos de cliente DE VERDADE (exclui o código-balcão do Consumidor Final) — cada um conta 1 vez, não importa quantas vendas fez. */
  clientSet: Set<string>;
  /** Vendas com o código-balcão do Consumidor Final (venda sem cadastro) — cada venda é uma pessoa diferente na prática, então soma direto em vez de cair no clientSet (que dedup por código). */
  avulsos: number;
}

export interface PriceTableAgg {
  name: string;
  overall: {
    valorBruto: number;
    desconto: number;
    valorLiquido: number;
    registros: number;
    qtdCliente: number;
  };
  monthly: MonthlyPriceTable[];
}

export interface PeriodStats {
  valorBruto: number;
  desconto: number;
  valorLiquido: number;
  registros: number;
  qtdCliente: number;
}

export interface MonthAggregate {
  key: string;
  year: number;
  month: number;
  label: string;
  valorLiquido: number;
  registros: number;
  qtdCliente: number;
  pedidos: number;
  valorTransportado: number;
}

export interface FilteredPriceTableView {
  name: string;
  valorBruto: number;
  desconto: number;
  valorLiquido: number;
  totalReg: number;
  qtdCliente: number;
  monthly: MonthlyPriceTable[];
  ref: PriceTableAgg;
}

export interface FilteredCarrierRow {
  name: string;
  pedidos: number;
  valor: number;
}

export interface MonthlyItem {
  year: number;
  month: number;
  label: string;
  /** Tabela de Preço da venda que originou esse item — permite filtrar a Curva ABC por tabela, além da visão Geral (todas somadas). */
  tabela: string;
  qtd: number;
  valorVendido: number;
  custoTotal: number;
}

/**
 * Um produto, agregado por (cod_interno || produto) — unifica o mesmo
 * produto vendido em Tabelas de Preço diferentes (a visão "Geral" soma todo
 * mundo; a visão "por Tabela" filtra `monthly` por `tabela`). Só existe pra
 * vendas importadas no Relatório 396 detalhado (migração 0023); vendas no
 * formato antigo não têm item nenhum, então cobertura de margem/curva ABC é
 * parcial pra períodos anteriores a essa migração.
 */
export interface ItemAgg {
  produto: string;
  codInterno: string | null;
  monthly: MonthlyItem[];
}

export interface FilteredItemView {
  produto: string;
  codInterno: string | null;
  qtd: number;
  valorVendido: number;
  custoTotal: number;
  /** valorVendido - custoTotal. */
  margem: number;
  /** margem / valorVendido (0 se valorVendido for 0). */
  margemPct: number;
  ref: ItemAgg;
}
