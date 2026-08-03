import { MESES_PT } from '@/lib/format';
import type { EntregaRow, ItemVendaRow, VendaRow } from './api';
import type { CarrierAgg, ItemAgg, MonthlyItem, MonthlyPriceTable, PriceTableAgg } from './types';

function parseDataISO(iso: string | null): { year: number; month: number } | null {
  if (!iso) return null;
  const [y, m] = iso.split('-');
  return { year: Number(y), month: Number(m) };
}

/**
 * Código-balcão do Consumidor Final no Max-Manager — usado em toda venda
 * sem cadastro de cliente (quase metade das vendas reais). Contar por
 * código (Set) juntaria centenas de pessoas diferentes num "cliente só" —
 * por isso essas vendas somam direto na contagem em vez de deduplicar.
 */
const CODIGO_CONSUMIDOR_FINAL = '1';

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
    const overall = { valorBruto: 0, desconto: 0, valorLiquido: 0, registros: 0, clientes: new Set<string>(), avulsos: 0 };
    const monthlyMap = new Map<string, { valorLiquido: number; valorBruto: number; desconto: number; registros: number; clientes: Set<string>; avulsos: number }>();

    for (const row of tabelaRows) {
      overall.valorBruto += row.valor_bruto;
      overall.desconto += row.desconto;
      overall.valorLiquido += row.valor_liquido;
      overall.registros += 1;
      if (row.codigo_cliente === CODIGO_CONSUMIDOR_FINAL) overall.avulsos += 1;
      else if (row.codigo_cliente) overall.clientes.add(row.codigo_cliente);

      const data = parseDataISO(row.data_venda);
      if (data) {
        const key = `${data.year}-${String(data.month).padStart(2, '0')}`;
        if (!monthlyMap.has(key)) {
          monthlyMap.set(key, { valorLiquido: 0, valorBruto: 0, desconto: 0, registros: 0, clientes: new Set(), avulsos: 0 });
        }
        const mm = monthlyMap.get(key)!;
        mm.valorLiquido += row.valor_liquido;
        mm.valorBruto += row.valor_bruto;
        mm.desconto += row.desconto;
        mm.registros += 1;
        if (row.codigo_cliente === CODIGO_CONSUMIDOR_FINAL) mm.avulsos += 1;
        else if (row.codigo_cliente) mm.clientes.add(row.codigo_cliente);
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
          avulsos: m.avulsos,
        };
      });

    return {
      name,
      overall: {
        valorBruto: overall.valorBruto,
        desconto: overall.desconto,
        valorLiquido: overall.valorLiquido,
        registros: overall.registros,
        qtdCliente: overall.clientes.size + overall.avulsos,
      },
      monthly,
    };
  });
}

/**
 * Uma linha por item (produto) de uma venda -> agrupa por produto (usando
 * cod_interno quando existe, senão o nome — unifica o mesmo produto vendido
 * em Tabelas de Preço diferentes) e soma por (tabela, mês). Tabela e mês/ano
 * de cada item vêm da venda-mãe (`venda_id`), por isso recebe `vendas`
 * também — só pra montar esse cruzamento, não usa o resto dos campos da
 * venda. A visão "Geral" (todas as tabelas somadas) e a visão "por Tabela"
 * usam o MESMO `monthly`, só filtrando por `tabela` ou não (ver
 * getFilteredItems em calculations.ts).
 */
export function agregarItens(vendas: VendaRow[], itens: ItemVendaRow[]): ItemAgg[] {
  const infoPorVenda = new Map<string, { year: number; month: number; tabela: string }>();
  for (const v of vendas) {
    const data = parseDataISO(v.data_venda);
    if (data) infoPorVenda.set(v.id, { ...data, tabela: v.tabela_preco });
  }

  const porProduto = new Map<string, { produto: string; codInterno: string | null; itens: ItemVendaRow[] }>();
  for (const item of itens) {
    const chave = item.cod_interno || item.produto;
    if (!porProduto.has(chave)) porProduto.set(chave, { produto: item.produto, codInterno: item.cod_interno, itens: [] });
    porProduto.get(chave)!.itens.push(item);
  }

  return Array.from(porProduto.values()).map(({ produto, codInterno, itens: itensDoProduto }) => {
    const monthlyMap = new Map<string, { year: number; month: number; tabela: string; qtd: number; valorVendido: number; custoTotal: number }>();

    for (const item of itensDoProduto) {
      const info = infoPorVenda.get(item.venda_id);
      if (!info) continue;
      const key = `${info.tabela}|${info.year}-${String(info.month).padStart(2, '0')}`;
      if (!monthlyMap.has(key)) monthlyMap.set(key, { year: info.year, month: info.month, tabela: info.tabela, qtd: 0, valorVendido: 0, custoTotal: 0 });
      const mm = monthlyMap.get(key)!;
      mm.qtd += item.qtd;
      mm.valorVendido += item.vlr_com_desc;
      mm.custoTotal += item.custo_unitario * item.qtd;
    }

    const monthly: MonthlyItem[] = Array.from(monthlyMap.values())
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .map((m) => ({ ...m, label: `${MESES_PT[m.month - 1]}/${m.year}` }));

    return { produto, codInterno, monthly };
  });
}

/**
 * Cobertura de detalhamento por item, por (tabela, mês) — quantas vendas
 * daquele mês/tabela têm item(ns) importado(s) vs. o total de vendas. Usado
 * só pra avisar na tela quando a Análise por Produto está vendo uma fração
 * das vendas do período (ex.: um ano importado só no formato antigo, sem
 * itens) — sem isso, um total "certinho" mas incompleto passa despercebido.
 */
export interface CoberturaItens {
  tabela: string;
  year: number;
  month: number;
  totalVendas: number;
  vendasComItem: number;
}

export function agregarCoberturaItens(vendas: VendaRow[], itens: ItemVendaRow[]): CoberturaItens[] {
  const vendaIdsComItem = new Set(itens.map((i) => i.venda_id));
  const porChave = new Map<string, CoberturaItens>();
  for (const v of vendas) {
    const data = parseDataISO(v.data_venda);
    if (!data) continue;
    const key = `${v.tabela_preco}|${data.year}-${String(data.month).padStart(2, '0')}`;
    if (!porChave.has(key)) porChave.set(key, { tabela: v.tabela_preco, year: data.year, month: data.month, totalVendas: 0, vendasComItem: 0 });
    const c = porChave.get(key)!;
    c.totalVendas += 1;
    if (vendaIdsComItem.has(v.id)) c.vendasComItem += 1;
  }
  return Array.from(porChave.values());
}
