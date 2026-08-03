import { fetchAllRows } from '@/lib/fetchAll';
import { supabase } from '@/lib/supabase';

export interface EntregaRow {
  transportadora: string;
  valor: number;
  data_pedido: string | null;
}

export interface VendaRow {
  id: string;
  tabela_preco: string;
  codigo_cliente: string | null;
  valor_bruto: number;
  desconto: number;
  valor_liquido: number;
  data_venda: string | null;
}

/** Um item (produto) de uma venda do Relatório 396 detalhado (ver migração 0023) — só existe pra vendas importadas no formato novo, que já trazem o custo unitário do próprio dia da venda. */
export interface ItemVendaRow {
  venda_id: string;
  cod_interno: string | null;
  produto: string;
  qtd: number;
  vlr_com_desc: number;
  custo_unitario: number;
}

export async function fetchEntregas(): Promise<EntregaRow[]> {
  return fetchAllRows((from, to) =>
    supabase.from('entregas_transportadora').select('transportadora, valor, data_pedido').range(from, to),
  );
}

export async function fetchVendas(): Promise<VendaRow[]> {
  return fetchAllRows((from, to) =>
    supabase
      .from('vendas_tabela_preco')
      .select('id, tabela_preco, codigo_cliente, valor_bruto, desconto, valor_liquido, data_venda')
      .range(from, to),
  );
}

export async function fetchVendaItens(): Promise<ItemVendaRow[]> {
  return fetchAllRows((from, to) =>
    supabase.from('vendas_tabela_preco_itens').select('venda_id, cod_interno, produto, qtd, vlr_com_desc, custo_unitario').range(from, to),
  );
}
