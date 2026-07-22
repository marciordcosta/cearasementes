import { MESES_PT } from '@/lib/format';
import type {
  CarrierAgg,
  FilteredCarrierRow,
  FilteredPriceTableView,
  MonthAggregate,
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
  months.forEach((m) => m.clientSet.forEach((code) => clientSet.add(code)));
  return {
    valorBruto: months.reduce((s, m) => s + m.valorBruto, 0),
    desconto: months.reduce((s, m) => s + m.desconto, 0),
    valorLiquido: months.reduce((s, m) => s + m.valor, 0),
    registros: months.reduce((s, m) => s + m.registros, 0),
    qtdCliente: clientSet.size,
  };
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
  let found = false;

  priceTables.forEach((t) => {
    t.monthly.forEach((m) => {
      if (m.year === year && m.month === month) {
        found = true;
        valorLiquido += m.valor;
        registros += m.registros;
        m.clientSet.forEach((code) => clientSet.add(code));
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
    qtdCliente: clientSet.size,
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
