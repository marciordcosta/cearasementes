import { fetchAllRows } from '@/lib/fetchAll';
import { supabase } from '@/lib/supabase';

export interface EntregaRow {
  transportadora: string;
  valor: number;
  data_pedido: string | null;
}

export interface VendaRow {
  tabela_preco: string;
  codigo_cliente: string | null;
  valor_bruto: number;
  desconto: number;
  valor_liquido: number;
  data_venda: string | null;
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
      .select('tabela_preco, codigo_cliente, valor_bruto, desconto, valor_liquido, data_venda')
      .range(from, to),
  );
}
