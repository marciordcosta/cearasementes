import { fetchAllRows } from '@/lib/fetchAll';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { RegistroBancoParseado, RegistroSistemaParseado } from './parsing';
import type { ArquivoConciliacao, LancamentoBanco, LancamentoSistema, NovoLancamentoManual, TipoArquivo } from './types';

type ArquivoRow = Database['public']['Tables']['conciliacao_arquivos']['Row'];
type BancoRow = Database['public']['Tables']['conciliacao_lancamentos_banco']['Row'];
type SistemaRow = Database['public']['Tables']['conciliacao_lancamentos_sistema']['Row'];

/**
 * O Postgres recusa um upsert em lote se duas linhas do MESMO lote tiverem
 * a mesma chave de conflito ("ON CONFLICT DO UPDATE command cannot affect
 * row a second time") — acontece de verdade: um relatório real teve a
 * mesma linha impressa duas vezes (bug do próprio MAX-Manager perto de
 * quebra de página). Mantém só a última ocorrência de cada chave; linhas
 * sem chave (fitid/documento nulo) nunca colidem, passam direto.
 */
function dedupPorChave<T>(itens: T[], chave: (item: T) => string | null): T[] {
  const vistos = new Map<string, T>();
  const semChave: T[] = [];
  for (const item of itens) {
    const k = chave(item);
    if (k === null) semChave.push(item);
    else vistos.set(k, item);
  }
  return [...vistos.values(), ...semChave];
}

const NOME_TAXA_CARTAO = 'Administradora de Cartão';

function arquivoFromRow(row: ArquivoRow): ArquivoConciliacao {
  return { id: row.id, nomeArquivo: row.nome_arquivo, tipo: row.tipo, bancoCodigo: row.banco_codigo, bancoNome: row.banco_nome, enviadoEm: row.enviado_em };
}

function bancoFromRow(row: BancoRow): LancamentoBanco {
  return {
    id: row.id,
    arquivoId: row.arquivo_id,
    origem: row.origem,
    bancoCodigo: row.banco_codigo,
    bancoNome: row.banco_nome,
    data: row.data,
    valor: row.valor,
    descricao: row.descricao,
    formaPagamento: row.forma_pagamento,
    conciliado: row.conciliado,
    desativado: row.desativado,
    marcado: row.marcado,
    observacao: row.observacao,
    grupoId: row.grupo_id,
  };
}

function sistemaFromRow(row: SistemaRow): LancamentoSistema {
  return {
    id: row.id,
    arquivoId: row.arquivo_id,
    origem: row.origem,
    tipoLancamento: row.tipo_lancamento,
    cliente: row.cliente,
    documento: row.documento,
    nf: row.nf,
    vendedor: row.vendedor,
    formaPagamentoRaw: row.forma_pagamento_raw,
    valor: row.valor,
    data: row.data,
    conciliado: row.conciliado,
    desativado: row.desativado,
    taxaValor: row.taxa_valor,
    taxaPercentual: row.taxa_percentual,
    grupoId: row.grupo_id,
  };
}

export async function fetchArquivos(): Promise<ArquivoConciliacao[]> {
  const { data, error } = await supabase.from('conciliacao_arquivos').select('*').order('enviado_em', { ascending: false });
  if (error) throw error;
  return data.map(arquivoFromRow);
}

export async function fetchLancamentosBanco(): Promise<LancamentoBanco[]> {
  const rows = await fetchAllRows<BancoRow>((from, to) => supabase.from('conciliacao_lancamentos_banco').select('*').order('data').range(from, to));
  return rows.map(bancoFromRow);
}

export async function fetchLancamentosSistema(): Promise<LancamentoSistema[]> {
  const rows = await fetchAllRows<SistemaRow>((from, to) => supabase.from('conciliacao_lancamentos_sistema').select('*').order('data').range(from, to));
  return rows.map(sistemaFromRow);
}

/**
 * Grava o arquivo OFX + seus lançamentos já parseados (parseOFX). Upsert
 * por `fitid` (o próprio banco garante que é único por transação) — reenviar
 * um extrato com dias sobrepostos atualiza a linha existente em vez de
 * duplicar. `conciliado`/`marcado`/`observacao`/`grupo_id` ficam de fora do
 * payload de propósito: assim o upsert nunca desfaz uma conciliação já
 * feita, só atualiza os dados brutos da transação. Linha sem fitid (OFX que
 * não traz essa tag) sempre entra como nova, igual antes.
 */
/** Retorna quantas linhas foram de fato gravadas (após deduplicar por fitid dentro do próprio arquivo). */
export async function importarOfx(nomeArquivo: string, bancoCodigo: string, bancoNome: string, registros: RegistroBancoParseado[]): Promise<number> {
  const { data: arquivo, error: errArquivo } = await supabase
    .from('conciliacao_arquivos')
    .insert({ nome_arquivo: nomeArquivo, tipo: 'ofx', banco_codigo: bancoCodigo, banco_nome: bancoNome })
    .select('id')
    .single();
  if (errArquivo) throw errArquivo;
  if (registros.length === 0) return 0;

  const registrosUnicos = dedupPorChave(registros, (r) => r.fitid);
  const { error } = await supabase.from('conciliacao_lancamentos_banco').upsert(
    registrosUnicos.map((r) => ({
      arquivo_id: arquivo.id,
      origem: 'ofx' as const,
      banco_codigo: r.bancoCodigo,
      banco_nome: r.bancoNome,
      data: r.data,
      valor: r.valor,
      descricao: r.descricao,
      forma_pagamento: r.formaPagamento,
      fitid: r.fitid,
    })),
    { onConflict: 'fitid' },
  );
  if (error) throw error;
  return registrosUnicos.length;
}

/**
 * Mais da metade das linhas do relatório do Sistema não tem `documento`
 * (ex.: depósito em dinheiro no banco não gera nº de documento) — sem uma
 * chave só de `documento`, essas linhas nunca deduplicavam e cada reenvio
 * as duplicava de novo (confirmado nos dados reais: 506 de ~795 linhas
 * sem documento, dobrando a cada reimportação). Cai pro conjunto de campos
 * disponível mais específico (cliente + vendedor + forma de pagamento) —
 * não é infalível (duas linhas idênticas nesses campos, mesmo dia, mesmo
 * valor, ainda colidiriam), mas cobre o caso real.
 */
function chaveDedupSistema(r: RegistroSistemaParseado): string | null {
  if (r.documento) return r.documento;
  if (!r.cliente) return null;
  return `${r.cliente}|${r.vendedor ?? ''}|${r.formaPagamentoRaw ?? ''}`;
}

/**
 * Grava o relatório do sistema (Max Data) + seus lançamentos já parseados
 * (parseMatricial). Upsert por (`chave_dedup`, `data`, `valor`) — reenviar
 * o mesmo relatório atualiza a linha existente em vez de duplicar.
 * `conciliado`/`taxa_*`/`grupo_id` ficam de fora do payload de propósito:
 * um reenvio nunca desfaz conciliação já feita. Retorna quantas linhas
 * foram de fato gravadas (após deduplicar dentro do próprio arquivo).
 */
export async function importarSistema(nomeArquivo: string, tipoLancamento: 'Entrada' | 'Saída', registros: RegistroSistemaParseado[]): Promise<number> {
  const { data: arquivo, error: errArquivo } = await supabase
    .from('conciliacao_arquivos')
    .insert({ nome_arquivo: nomeArquivo, tipo: 'sistema', banco_codigo: null, banco_nome: null, sub_grupo: tipoLancamento })
    .select('id')
    .single();
  if (errArquivo) throw errArquivo;
  if (registros.length === 0) return 0;

  const registrosUnicos = dedupPorChave(registros, (r) => {
    const chave = chaveDedupSistema(r);
    return chave ? `${chave}|${r.data}|${r.valor}` : null;
  });
  const { error } = await supabase.from('conciliacao_lancamentos_sistema').upsert(
    registrosUnicos.map((r) => ({
      arquivo_id: arquivo.id,
      origem: 'sistema' as const,
      tipo_lancamento: r.tipoLancamento,
      cliente: r.cliente,
      documento: r.documento,
      nf: r.nf,
      vendedor: r.vendedor,
      forma_pagamento_raw: r.formaPagamentoRaw,
      valor: r.valor,
      data: r.data,
      chave_dedup: chaveDedupSistema(r),
    })),
    { onConflict: 'chave_dedup,data,valor' },
  );
  if (error) throw error;
  return registrosUnicos.length;
}

/**
 * Apaga todos os arquivos (e, em cascata, os lançamentos) de um sub-grupo —
 * banco (ex. "Banco do Brasil") pro ofx, tipo de lançamento ("Entrada"/
 * "Saída") pro sistema. É o que roda quando o usuário apaga a linha
 * mesclada correspondente na tela de Uploads.
 */
export async function apagarGrupoConciliacao(tipo: TipoArquivo, subGrupo: string): Promise<void> {
  const coluna = tipo === 'ofx' ? 'banco_nome' : 'sub_grupo';
  const { error } = await supabase.from('conciliacao_arquivos').delete().eq('tipo', tipo).eq(coluna, subGrupo);
  if (error) throw error;
}

export async function inserirLancamentoManualSistema(input: NovoLancamentoManual): Promise<void> {
  const { error } = await supabase.from('conciliacao_lancamentos_sistema').insert({
    arquivo_id: null,
    origem: 'manual',
    tipo_lancamento: input.valor >= 0 ? 'Entrada' : 'Saída',
    cliente: input.cliente,
    documento: null,
    nf: input.nf || null,
    vendedor: null,
    forma_pagamento_raw: 'Outros',
    valor: input.valor,
    data: input.data,
    conciliado: false,
    desativado: false,
    taxa_valor: 0,
    taxa_percentual: 0,
    grupo_id: null,
  });
  if (error) throw error;
}

export async function toggleDesativadoBanco(id: string, desativado: boolean): Promise<void> {
  const { error } = await supabase.from('conciliacao_lancamentos_banco').update({ desativado }).eq('id', id);
  if (error) throw error;
}

export async function toggleDesativadoSistema(id: string, desativado: boolean): Promise<void> {
  const { error } = await supabase.from('conciliacao_lancamentos_sistema').update({ desativado }).eq('id', id);
  if (error) throw error;
}

export async function toggleMarcado(id: string, marcado: boolean): Promise<void> {
  const { error } = await supabase.from('conciliacao_lancamentos_banco').update({ marcado }).eq('id', id);
  if (error) throw error;
}

export async function salvarObservacao(id: string, observacao: string): Promise<void> {
  const { error } = await supabase.from('conciliacao_lancamentos_banco').update({ observacao }).eq('id', id);
  if (error) throw error;
}

async function garantirLinhaTaxaCartao(dataRef: string): Promise<SistemaRow> {
  const { data: existente, error: errBusca } = await supabase
    .from('conciliacao_lancamentos_sistema')
    .select('*')
    .eq('origem', 'taxa_automatica')
    .maybeSingle();
  if (errBusca) throw errBusca;
  if (existente) return existente;

  const { data: nova, error: errInsert } = await supabase
    .from('conciliacao_lancamentos_sistema')
    .insert({
      arquivo_id: null,
      origem: 'taxa_automatica',
      tipo_lancamento: 'Saída',
      cliente: NOME_TAXA_CARTAO,
      documento: 'TAXA_CARTAO',
      nf: null,
      vendedor: null,
      forma_pagamento_raw: 'Taxa Cartão',
      valor: 0,
      data: dataRef,
      conciliado: true,
      desativado: false,
      taxa_valor: 0,
      taxa_percentual: 0,
      grupo_id: null,
    })
    .select('*')
    .single();
  if (errInsert) throw errInsert;
  return nova;
}

/**
 * Concilia N lançamentos do banco com M do sistema num único grupo — porte
 * de conciliar(). Quando algum lançamento do banco é CARTAO, calcula (e
 * acumula numa linha "Administradora de Cartão" automática) a diferença
 * entre o valor do sistema e o valor creditado no banco como taxa da
 * maquininha — mesma conta do protótipo original, par a par.
 */
export async function conciliar(bancoIds: string[], sistemaIds: string[]): Promise<void> {
  if (bancoIds.length === 0 || sistemaIds.length === 0) throw new Error('Selecione pelo menos 1 item do banco e 1 do sistema.');

  const { data: grupo, error: errGrupo } = await supabase.from('conciliacao_grupos').insert({}).select('id').single();
  if (errGrupo) throw errGrupo;

  const [{ data: bancoSelecionado, error: errB }, { data: sistemaSelecionado, error: errS }] = await Promise.all([
    supabase.from('conciliacao_lancamentos_banco').select('*').in('id', bancoIds),
    supabase.from('conciliacao_lancamentos_sistema').select('*').in('id', sistemaIds),
  ]);
  if (errB) throw errB;
  if (errS) throw errS;

  let taxaAcumulada = 0;
  for (const b of bancoSelecionado) {
    if (b.forma_pagamento !== 'CARTAO') continue;
    const valorOfx = Math.abs(b.valor);
    for (const s of sistemaSelecionado) {
      const valorSys = Math.abs(s.valor);
      if (valorSys <= 0 || valorSys < valorOfx) continue;
      const taxaValor = +(valorSys - valorOfx).toFixed(2);
      const taxaPercentual = +((taxaValor / valorSys) * 100).toFixed(2);
      await supabase.from('conciliacao_lancamentos_sistema').update({ taxa_valor: taxaValor, taxa_percentual: taxaPercentual }).eq('id', s.id);
      taxaAcumulada += taxaValor;
    }
  }

  if (taxaAcumulada > 0) {
    const linhaTaxa = await garantirLinhaTaxaCartao(bancoSelecionado[0]?.data ?? new Date().toISOString().slice(0, 10));
    await supabase
      .from('conciliacao_lancamentos_sistema')
      .update({ valor: +(linhaTaxa.valor - taxaAcumulada).toFixed(2) })
      .eq('id', linhaTaxa.id);
  }

  const { error: errUpdBanco } = await supabase.from('conciliacao_lancamentos_banco').update({ conciliado: true, marcado: false, grupo_id: grupo.id }).in('id', bancoIds);
  if (errUpdBanco) throw errUpdBanco;

  const { error: errUpdSistema } = await supabase.from('conciliacao_lancamentos_sistema').update({ conciliado: true, grupo_id: grupo.id }).in('id', sistemaIds);
  if (errUpdSistema) throw errUpdSistema;
}

/**
 * "Conciliar manual (Sistema → OFX)" — quando um lançamento do sistema não
 * tem correspondente real no banco, cria um lançamento de banco origem
 * 'manual' com os mesmos dados, já conciliado com ele.
 */
export async function conciliarManualSistema(sistemaId: string): Promise<void> {
  const { data: s, error: errS } = await supabase.from('conciliacao_lancamentos_sistema').select('*').eq('id', sistemaId).single();
  if (errS) throw errS;
  if (s.conciliado) throw new Error('Este item já está conciliado.');

  const { data: grupo, error: errGrupo } = await supabase.from('conciliacao_grupos').insert({}).select('id').single();
  if (errGrupo) throw errGrupo;

  const descricao = [s.cliente, s.forma_pagamento_raw, s.documento].filter(Boolean).join(' — ');
  const { error: errBanco } = await supabase.from('conciliacao_lancamentos_banco').insert({
    arquivo_id: null,
    origem: 'manual',
    banco_codigo: '999',
    banco_nome: 'Manual',
    data: s.data ?? '1900-01-01',
    valor: s.valor,
    descricao,
    forma_pagamento: 'OUTRO',
    conciliado: true,
    desativado: false,
    marcado: false,
    observacao: null,
    grupo_id: grupo.id,
  });
  if (errBanco) throw errBanco;

  const { error: errUpd } = await supabase.from('conciliacao_lancamentos_sistema').update({ conciliado: true, grupo_id: grupo.id }).eq('id', sistemaId);
  if (errUpd) throw errUpd;
}

/** Desfaz um grupo de conciliação: reverte flags, apaga lançamentos "manuais" criados só pra conciliar, e devolve a taxa de cartão acumulada. */
export async function cancelarConciliacao(grupoId: string): Promise<void> {
  const [{ data: bancoDoGrupo, error: errB }, { data: sistemaDoGrupo, error: errS }] = await Promise.all([
    supabase.from('conciliacao_lancamentos_banco').select('*').eq('grupo_id', grupoId),
    supabase.from('conciliacao_lancamentos_sistema').select('*').eq('grupo_id', grupoId),
  ]);
  if (errB) throw errB;
  if (errS) throw errS;

  const manuaisParaApagar = bancoDoGrupo.filter((b) => b.origem === 'manual').map((b) => b.id);
  const bancoParaReverter = bancoDoGrupo.filter((b) => b.origem !== 'manual').map((b) => b.id);

  if (manuaisParaApagar.length > 0) {
    const { error } = await supabase.from('conciliacao_lancamentos_banco').delete().in('id', manuaisParaApagar);
    if (error) throw error;
  }
  if (bancoParaReverter.length > 0) {
    const { error } = await supabase.from('conciliacao_lancamentos_banco').update({ conciliado: false, grupo_id: null }).in('id', bancoParaReverter);
    if (error) throw error;
  }

  const taxaParaReverter = sistemaDoGrupo.reduce((soma, s) => soma + (s.taxa_valor > 0 ? s.taxa_valor : 0), 0);
  if (sistemaDoGrupo.length > 0) {
    const { error } = await supabase
      .from('conciliacao_lancamentos_sistema')
      .update({ conciliado: false, grupo_id: null })
      .in('id', sistemaDoGrupo.map((s) => s.id));
    if (error) throw error;
  }

  if (taxaParaReverter > 0) {
    const { data: linhaTaxa } = await supabase.from('conciliacao_lancamentos_sistema').select('*').eq('origem', 'taxa_automatica').maybeSingle();
    if (linhaTaxa) {
      await supabase
        .from('conciliacao_lancamentos_sistema')
        .update({ valor: +(linhaTaxa.valor + taxaParaReverter).toFixed(2) })
        .eq('id', linhaTaxa.id);
    }
  }
}
