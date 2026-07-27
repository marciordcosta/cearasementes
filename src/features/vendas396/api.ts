import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { Venda396 } from './types';

type VendaInsert = Database['public']['Tables']['vendas_tabela_preco']['Insert'];
type ItemInsert = Database['public']['Tables']['vendas_tabela_preco_itens']['Insert'];
type PagamentoInsert = Database['public']['Tables']['vendas_tabela_preco_pagamentos']['Insert'];

export interface ResultadoImportacaoVendas396 {
  vendas: number;
  itens: number;
  pagamentos: number;
}

function somaCampo(itens: Venda396['itens'], campo: 'vlrSemDesc' | 'vlrDesc' | 'vlrComDesc'): number {
  return +itens.reduce((soma, it) => soma + it[campo], 0).toFixed(2);
}

/**
 * Grava as vendas (+ itens + pagamentos) desse upload. Upsert por
 * (tabela_preco, num_venda) — reenviar um arquivo com período sobreposto a
 * um upload anterior atualiza a venda existente em vez de duplicar; os
 * itens/pagamentos dela são substituídos por completo (apaga e regrava),
 * já que a venda pode ter sido editada no sistema de origem entre um
 * envio e outro.
 */
export async function importarVendas396(uploadLogId: string, tabelaPreco: string, arquivoOrigem: string, vendas: Venda396[]): Promise<ResultadoImportacaoVendas396> {
  if (vendas.length === 0) return { vendas: 0, itens: 0, pagamentos: 0 };

  const vendaRows: VendaInsert[] = vendas.map((v) => ({
    tabela_preco: tabelaPreco,
    num_venda: v.numVenda,
    codigo_cliente: v.codCliente,
    cliente: v.cliente,
    vendedor: v.vendedor,
    cpf_cnpj: v.cpfCnpj,
    num_nf: v.numNf,
    data_venda: v.data,
    hora_venda: v.hora,
    valor_bruto: somaCampo(v.itens, 'vlrSemDesc'),
    desconto: somaCampo(v.itens, 'vlrDesc'),
    valor_liquido: somaCampo(v.itens, 'vlrComDesc'),
    arquivo_origem: arquivoOrigem,
    upload_log_id: uploadLogId,
  }));

  const { data: vendasSalvas, error: errVendas } = await supabase
    .from('vendas_tabela_preco')
    .upsert(vendaRows, { onConflict: 'tabela_preco,num_venda' })
    .select('id, num_venda');
  if (errVendas) throw errVendas;

  const idPorNumVenda = new Map(vendasSalvas.map((v) => [v.num_venda, v.id]));
  const idsAfetados = [...idPorNumVenda.values()];

  if (idsAfetados.length > 0) {
    const { error: errDelItens } = await supabase.from('vendas_tabela_preco_itens').delete().in('venda_id', idsAfetados);
    if (errDelItens) throw errDelItens;
    const { error: errDelPag } = await supabase.from('vendas_tabela_preco_pagamentos').delete().in('venda_id', idsAfetados);
    if (errDelPag) throw errDelPag;
  }

  const itemRows: ItemInsert[] = [];
  const pagamentoRows: PagamentoInsert[] = [];
  for (const v of vendas) {
    const vendaId = idPorNumVenda.get(v.numVenda);
    if (!vendaId) continue;
    for (const it of v.itens) {
      itemRows.push({
        venda_id: vendaId,
        cod_interno: it.codInterno,
        produto: it.produto,
        vlr_unitario: it.vlrUnitario,
        qtd: it.qtd,
        vlr_sem_desc: it.vlrSemDesc,
        vlr_desc: it.vlrDesc,
        vlr_com_desc: it.vlrComDesc,
        custo_unitario: it.custoUnitario,
      });
    }
    for (const p of v.pagamentos) {
      pagamentoRows.push({ venda_id: vendaId, forma_pagamento: p.formaPagamento, num_doc: p.numDoc, vencimento: p.vencimento, valor: p.valor });
    }
  }

  if (itemRows.length > 0) {
    const { error } = await supabase.from('vendas_tabela_preco_itens').insert(itemRows);
    if (error) throw error;
  }
  if (pagamentoRows.length > 0) {
    const { error } = await supabase.from('vendas_tabela_preco_pagamentos').insert(pagamentoRows);
    if (error) throw error;
  }

  return { vendas: vendaRows.length, itens: itemRows.length, pagamentos: pagamentoRows.length };
}
