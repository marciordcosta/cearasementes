import type { CustoPersonalizado } from './types';

/**
 * Valor em R$ de um Custo Personalizado — 'reais' já é o valor; 'percentual' é
 * derivado aplicando esse % sobre o total de vendas (não o contrário: o % É a
 * informação original nesse tipo, ex. uma taxa de plataforma).
 */
export function valorReaisCustoPersonalizado(custo: CustoPersonalizado, totalVendas: number): number {
  return custo.tipo === 'percentual' ? (totalVendas * custo.valor) / 100 : custo.valor;
}

/** Soma de todos os Custos Personalizados, em R$ e como % do total de vendas (média das últimas safras). */
export function calcularTotalCustosPersonalizados(custos: CustoPersonalizado[], totalVendas: number): { totalReais: number; pctDasVendas: number } {
  const totalReais = custos.reduce((soma, c) => soma + valorReaisCustoPersonalizado(c, totalVendas), 0);
  return { totalReais, pctDasVendas: totalVendas > 0 ? (totalReais / totalVendas) * 100 : 0 };
}
