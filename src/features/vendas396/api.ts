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

function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
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

  // Em lotes: um `.in()` com milhares de ids de uma vez estoura o limite de tamanho da URL
  // (a chamada falha com um erro de rede sem mensagem, silenciosamente interrompendo a importação).
  for (const lote of emLotes(idsAfetados, 200)) {
    const { error: errDelItens } = await supabase.from('vendas_tabela_preco_itens').delete().in('venda_id', lote);
    if (errDelItens) throw errDelItens;
    const { error: errDelPag } = await supabase.from('vendas_tabela_preco_pagamentos').delete().in('venda_id', lote);
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

  for (const lote of emLotes(itemRows, 500)) {
    const { error } = await supabase.from('vendas_tabela_preco_itens').insert(lote);
    if (error) throw error;
  }
  for (const lote of emLotes(pagamentoRows, 500)) {
    const { error } = await supabase.from('vendas_tabela_preco_pagamentos').insert(lote);
    if (error) throw error;
  }

  return { vendas: vendaRows.length, itens: itemRows.length, pagamentos: pagamentoRows.length };
}

export interface VendaDetalhe {
  numVenda: number | null;
  cliente: string | null;
  data: string | null;
  vendedor: string | null;
  numNf: string | null;
  itens: { produto: string; qtd: number; vlrUnitario: number; vlrComDesc: number }[];
  pagamentos: { formaPagamento: string; numDoc: string | null; vencimento: string | null; valor: number }[];
}

/** "VE29705-1/3" (parcela) → "VE29705" — todas as parcelas de um recebimento são a mesma venda/pedido. */
function documentoBase(documento: string): string {
  return documento.replace(/-\d+\/\d+$/, '').trim();
}

/**
 * Busca os produtos e formas de pagamento da venda (Relatório 396) que gerou
 * um dado documento de recebimento da Conciliação. `documento` pode vir com
 * sufixo de parcela — ignorado, já que a venda de origem é sempre a mesma.
 * Retorna `null` se não achar (venda ainda não importada, ou documento sem
 * relação direta com uma venda do 396).
 */
export async function buscarVendaPorDocumento(documento: string): Promise<VendaDetalhe | null> {
  const base = documentoBase(documento);
  if (!base) return null;

  // O num_doc gravado no 396 também pode ter sufixo de parcela (às vezes numerado
  // diferente do lado Sistema) — casa por igualdade OU pelo prefixo "base-".
  const { data: pag, error: errPag } = await supabase
    .from('vendas_tabela_preco_pagamentos')
    .select('venda_id')
    .or(`num_doc.eq.${base},num_doc.like.${base}-*`)
    .limit(1);
  if (errPag) throw errPag;
  if (!pag || pag.length === 0) return null;
  const vendaId = pag[0].venda_id;

  const [{ data: venda, error: errVenda }, { data: itens, error: errItens }, { data: pagamentos, error: errPagamentos }] = await Promise.all([
    supabase.from('vendas_tabela_preco').select('num_venda, cliente, data_venda, vendedor, num_nf').eq('id', vendaId).single(),
    supabase.from('vendas_tabela_preco_itens').select('produto, qtd, vlr_unitario, vlr_com_desc').eq('venda_id', vendaId).order('criado_em', { ascending: true }),
    supabase.from('vendas_tabela_preco_pagamentos').select('forma_pagamento, num_doc, vencimento, valor').eq('venda_id', vendaId).order('criado_em', { ascending: true }),
  ]);
  if (errVenda) throw errVenda;
  if (errItens) throw errItens;
  if (errPagamentos) throw errPagamentos;

  return {
    numVenda: venda.num_venda,
    cliente: venda.cliente,
    data: venda.data_venda,
    vendedor: venda.vendedor,
    numNf: venda.num_nf,
    itens: (itens ?? []).map((i) => ({ produto: i.produto, qtd: i.qtd, vlrUnitario: i.vlr_unitario, vlrComDesc: i.vlr_com_desc })),
    pagamentos: (pagamentos ?? []).map((p) => ({ formaPagamento: p.forma_pagamento, numDoc: p.num_doc, vencimento: p.vencimento, valor: p.valor })),
  };
}
