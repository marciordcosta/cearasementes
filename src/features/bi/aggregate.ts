import { MESES_PT } from '@/lib/format';
import type { EntregaRow, VendaRow } from './api';
import type { CarrierAgg, MonthlyPriceTable, PriceTableAgg } from './types';

function parseDataISO(iso: string | null): { year: number; month: number } | null {
  if (!iso) return null;
  const [y, m] = iso.split('-');
  return { year: Number(y), month: Number(m) };
}

/** Uma linha por entrega -> agregado por transportadora (+ por mês), igual ao process124 original. */
export function agregarEntregas(rows: EntregaRow[]): Map<string, CarrierAgg> {
  const carriers = new Map<string, CarrierAgg>();
  for (const row of rows) {
    const nome = row.transportadora;
    if (!carriers.has(nome)) carriers.set(nome, { nome, pedidos: 0, valor: 0, monthly: new Map() });
    const c = carriers.get(nome)!;
    c.pedidos += 1;
    c.valor += row.valor;

    const data = parseDataISO(row.data_pedido);
    if (data) {
      const key = `${data.year}-${String(data.month).padStart(2, '0')}`;
      if (!c.monthly.has(key)) c.monthly.set(key, { pedidos: 0, valor: 0 });
      const m = c.monthly.get(key)!;
      m.pedidos += 1;
      m.valor += row.valor;
    }
  }
  return carriers;
}

/**
 * Uma linha por venda -> agrupa por Tabela de Preço (o nome já vem limpo do
 * Supabase) e soma por mês. Diferente do BI local original — que agrupava por
 * arquivo importado — aqui agrupamos pelo nome da tabela em toda a base
 * unificada, então múltiplos uploads do mesmo mês/tabela se somam corretamente.
 */
export function agregarVendas(rows: VendaRow[]): PriceTableAgg[] {
  const porTabela = new Map<string, VendaRow[]>();
  for (const row of rows) {
    const lista = porTabela.get(row.tabela_preco) ?? [];
    lista.push(row);
    porTabela.set(row.tabela_preco, lista);
  }

  return Array.from(porTabela.entries()).map(([name, tabelaRows]) => {
    const overall = { valorBruto: 0, desconto: 0, valorLiquido: 0, registros: 0, clientes: new Set<string>() };
    const monthlyMap = new Map<string, { valorLiquido: number; valorBruto: number; desconto: number; registros: number; clientes: Set<string> }>();

    for (const row of tabelaRows) {
      overall.valorBruto += row.valor_bruto;
      overall.desconto += row.desconto;
      overall.valorLiquido += row.valor_liquido;
      overall.registros += 1;
      if (row.codigo_cliente) overall.clientes.add(row.codigo_cliente);

      const data = parseDataISO(row.data_venda);
      if (data) {
        const key = `${data.year}-${String(data.month).padStart(2, '0')}`;
        if (!monthlyMap.has(key)) {
          monthlyMap.set(key, { valorLiquido: 0, valorBruto: 0, desconto: 0, registros: 0, clientes: new Set() });
        }
        const mm = monthlyMap.get(key)!;
        mm.valorLiquido += row.valor_liquido;
        mm.valorBruto += row.valor_bruto;
        mm.desconto += row.desconto;
        mm.registros += 1;
        if (row.codigo_cliente) mm.clientes.add(row.codigo_cliente);
      }
    }

    const monthly: MonthlyPriceTable[] = Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, m]) => {
        const [y, mo] = key.split('-');
        return {
          year: Number(y),
          month: Number(mo),
          label: `${MESES_PT[Number(mo) - 1]}/${y}`,
          valor: m.valorLiquido,
          valorBruto: m.valorBruto,
          desconto: m.desconto,
          registros: m.registros,
          clientSet: m.clientes,
        };
      });

    return {
      name,
      overall: {
        valorBruto: overall.valorBruto,
        desconto: overall.desconto,
        valorLiquido: overall.valorLiquido,
        registros: overall.registros,
        qtdCliente: overall.clientes.size,
      },
      monthly,
    };
  });
}
