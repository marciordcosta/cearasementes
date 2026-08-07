import type { PeriodContext } from '@/features/bi/calculations';
import { getPeriodKeyFor, getPeriodLabel } from '@/features/bi/calculations';
import type { ItemAgg } from '@/features/bi/types';

/** Mesma definição de "Safra" usada por padrão no BI (DashboardPage.tsx) — começa em agosto. */
export const SAFRA_PADRAO: PeriodContext = { mode: 'season', seasonStartMonth: 8 };

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
