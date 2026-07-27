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
