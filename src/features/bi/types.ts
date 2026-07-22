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
  clientSet: Set<string>;
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
