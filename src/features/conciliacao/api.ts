import { fetchAllRows } from '@/lib/fetchAll';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { RegistroBancoParseado, RegistroSistemaParseado } from './parsing';
import type { ArquivoConciliacao, LancamentoBanco, LancamentoSistema, NovoLancamentoManual, TipoArquivo } from './types';

type ArquivoRow = Database['public']['Tables']['conciliacao_arquivos']['Row'];
type BancoRow = Database['public']['Tables']['conciliacao_lancamentos_banco']['Row'];
type SistemaRow = Database['public']['Tables']['conciliacao_lancamentos_sistema']['Row'];
type GrupoRow = Database['public']['Tables']['conciliacao_grupos']['Row'];

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
    grupoId: row.grupo_id,
    observacao: row.observacao,
    valorBrutoCartao: row.valor_bruto_cartao,
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
    dataVencimento: row.data_vencimento,
    conciliado: row.conciliado,
    desativado: row.desativado,
    taxaValor: row.taxa_valor,
    taxaPercentual: row.taxa_percentual,
    grupoId: row.grupo_id,
    observacao: row.observacao,
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

export interface AvisoGrupo {
  avisoDiferenca: string;
  /** true depois que o usuário clica no "x" pra dispensar a notificação no modal de pendências — o aviso em si (e o "!" no lançamento) continuam existindo, só some da lista de pendências. */
  avisoDispensado: boolean;
}

/** grupoId -> aviso (valor/forma de pagamento diferentes) mostrado ao usuário quando ele confirmou essa conciliação mesmo com a diferença sinalizada — só grupos que tiveram aviso aparecem aqui. */
export async function fetchGruposComAviso(): Promise<Map<string, AvisoGrupo>> {
  const rows = await fetchAllRows<GrupoRow>((from, to) => supabase.from('conciliacao_grupos').select('*').not('aviso_diferenca', 'is', null).range(from, to));
  return new Map(rows.filter((g) => g.aviso_diferenca).map((g) => [g.id, { avisoDiferenca: g.aviso_diferenca as string, avisoDispensado: g.aviso_dispensado }]));
}

/** "x" no modal de pendências — dispensa só a NOTIFICAÇÃO desse grupo, o aviso gravado (e o "!" no lançamento) continuam intactos. */
export async function dispensarAvisoDivergenca(grupoId: string): Promise<void> {
  const { error } = await supabase.from('conciliacao_grupos').update({ aviso_dispensado: true }).eq('id', grupoId);
  if (error) throw error;
}

/** Observação livre (informações adicionais) num lançamento do Banco — `null` apaga a observação. */
export async function salvarObservacaoBanco(id: string, observacao: string | null): Promise<LancamentoBanco> {
  const { data, error } = await supabase.from('conciliacao_lancamentos_banco').update({ observacao }).eq('id', id).select('*').single();
  if (error) throw error;
  return bancoFromRow(data);
}

/** Observação livre (informações adicionais) num lançamento do Sistema — mesma regra do Banco, `null` apaga a observação. */
export async function salvarObservacaoSistema(id: string, observacao: string | null): Promise<LancamentoSistema> {
  const { data, error } = await supabase.from('conciliacao_lancamentos_sistema').update({ observacao }).eq('id', id).select('*').single();
  if (error) throw error;
  return sistemaFromRow(data);
}

/** Todos os pares (Banco, Sistema) descartados de uma sugestão específica — ver `descartarSugestao`. */
export async function fetchSugestoesDescartadas(): Promise<{ bancoId: string; sistemaId: string }[]> {
  const rows = await fetchAllRows<Database['public']['Tables']['conciliacao_sugestoes_descartadas']['Row']>((from, to) =>
    supabase.from('conciliacao_sugestoes_descartadas').select('*').range(from, to),
  );
  return rows.map((r) => ({ bancoId: r.banco_id, sistemaId: r.sistema_id }));
}

/** "x" ao lado de "Conciliar" no painel de sugestões — nunca mais sugere ESSE par específico (outros candidatos continuam normais). `onConflict` ignora se o usuário já tinha descartado o mesmo par antes. */
export async function descartarSugestao(pares: { bancoId: string; sistemaId: string }[]): Promise<void> {
  if (pares.length === 0) return;
  const { error } = await supabase
    .from('conciliacao_sugestoes_descartadas')
    .upsert(
      pares.map((p) => ({ banco_id: p.bancoId, sistema_id: p.sistemaId })),
      { onConflict: 'banco_id,sistema_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

/** "Restaurar" no modal de descartados — volta a considerar esse par nas próximas buscas de sugestão. */
export async function restaurarSugestaoDescartada(bancoId: string, sistemaId: string): Promise<void> {
  const { error } = await supabase.from('conciliacao_sugestoes_descartadas').delete().eq('banco_id', bancoId).eq('sistema_id', sistemaId);
  if (error) throw error;
}

/**
 * Grava o arquivo do Banco (extrato BB ou recebíveis Stone) + seus
 * lançamentos já parseados. Upsert por `fitid` (chave composta a partir das
 * próprias colunas do arquivo — ver parsing.ts) — reenviar um arquivo com
 * dias sobrepostos atualiza a linha existente em vez de duplicar.
 * `conciliado`/`marcado`/`observacao`/`grupo_id` ficam de fora do payload de
 * propósito: assim o upsert nunca desfaz uma conciliação já feita, só
 * atualiza os dados brutos da transação.
 *
 * `tipo: 'ofx'` (em conciliacao_arquivos) é só o identificador interno
 * histórico do "lado Banco" — não significa mais literalmente um arquivo
 * .ofx, mas renomear exigiria migração pra alterar o check constraint,
 * então mantido por simplicidade.
 */
/** Retorna quantas linhas foram de fato gravadas (após deduplicar por fitid dentro do próprio arquivo). */
export async function importarLancamentosBanco(nomeArquivo: string, bancoCodigo: string, bancoNome: string, registros: RegistroBancoParseado[]): Promise<number> {
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
      valor_bruto_cartao: r.valorBrutoCartao,
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
      data_vencimento: r.dataVencimento,
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

/**
 * Quantos lançamentos desse sub-grupo já estão conciliados — usado só pra
 * avisar antes de apagar o grupo inteiro (Uploads). Apagar o lado Banco (ou
 * Sistema) não desfaz a conciliação do OUTRO lado: o lançamento que ficou do
 * outro lado continua marcado `conciliado=true`, agora sem contraparte
 * nenhuma (órfão) — daí o aviso.
 */
export async function contarConciliadosDoGrupo(tipo: TipoArquivo, subGrupo: string): Promise<number> {
  if (tipo === 'ofx') {
    const { count, error } = await supabase
      .from('conciliacao_lancamentos_banco')
      .select('id', { count: 'exact', head: true })
      .eq('banco_nome', subGrupo)
      .eq('conciliado', true);
    if (error) throw error;
    return count ?? 0;
  }
  const { count, error } = await supabase
    .from('conciliacao_lancamentos_sistema')
    .select('id', { count: 'exact', head: true })
    .eq('tipo_lancamento', subGrupo as 'Entrada' | 'Saída')
    .eq('conciliado', true);
  if (error) throw error;
  return count ?? 0;
}

export async function inserirLancamentoManualSistema(input: NovoLancamentoManual): Promise<LancamentoSistema> {
  const { data, error } = await supabase
    .from('conciliacao_lancamentos_sistema')
    .insert({
      arquivo_id: null,
      origem: 'manual',
      tipo_lancamento: input.valor >= 0 ? 'Entrada' : 'Saída',
      cliente: input.cliente.trim() || null,
      documento: input.documento.trim() || null,
      nf: input.nf.trim() || null,
      vendedor: null,
      // Guarda o próprio enum (PIX/CARTAO/BOLETO/...) como texto — getCategoriaSistema()
      // reconhece essas palavras, então a tag da grade já sai certa sem precisar de mapeamento à parte.
      forma_pagamento_raw: input.formaPagamento,
      valor: input.valor,
      data: input.data,
      data_vencimento: null,
      conciliado: false,
      desativado: false,
      taxa_valor: 0,
      taxa_percentual: 0,
      grupo_id: null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return sistemaFromRow(data);
}

/** "Baixa" do pré-lançamento: completa cliente/documento(pedido)/NF do registro manual criado a partir de um OFX sem par no Sistema — some do azul assim que a NF for preenchida. */
export async function completarPreLancamento(id: string, dados: { cliente: string; documento: string; nf: string }): Promise<void> {
  const { error } = await supabase
    .from('conciliacao_lancamentos_sistema')
    .update({ cliente: dados.cliente.trim() || null, documento: dados.documento.trim() || null, nf: dados.nf.trim() })
    .eq('id', id);
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

/** Completa a NF de um lançamento já pré-conciliado (conciliado=true, mas ainda sem NF) — vira conciliação "de verdade" (some do amarelo) sem precisar chamar conciliar() de novo, já que o grupo já existe. */
export async function salvarNfSistema(id: string, nf: string): Promise<void> {
  const { error } = await supabase.from('conciliacao_lancamentos_sistema').update({ nf }).eq('id', id);
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
      data_vencimento: null,
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

export interface ResultadoConciliar {
  bancoAtualizados: LancamentoBanco[];
  sistemaAtualizados: LancamentoSistema[];
}

/**
 * Concilia N lançamentos do banco com M do sistema num único grupo — porte
 * de conciliar(). Quando algum lançamento do banco é CARTAO, calcula (e
 * acumula numa linha "Administradora de Cartão" automática) a diferença
 * entre o valor do sistema e o valor creditado no banco como taxa da
 * maquininha — mesma conta do protótipo original, par a par.
 *
 * Retorna só as linhas que realmente mudaram (em vez de o chamador ter que
 * recarregar as tabelas inteiras do zero) — com o Sistema passando de
 * milhares de linhas, um refetch completo a cada conciliação deixava a
 * ação extremamente lenta.
 *
 * `avisoDiferenca`: quando a conciliação manual foi confirmada com o aviso
 * de valor/forma de pagamento diferentes na tela, o texto desse aviso fica
 * gravado no grupo — permite mostrar o "!" informativo nos lançamentos já
 * conciliados depois, sem recalcular nada (fica congelado no momento em
 * que o usuário confirmou "Conciliar mesmo assim?").
 */
export async function conciliar(bancoIds: string[], sistemaIds: string[], avisoDiferenca?: string | null): Promise<ResultadoConciliar> {
  if (bancoIds.length === 0 || sistemaIds.length === 0) throw new Error('Selecione pelo menos 1 item do banco e 1 do sistema.');

  const { data: grupo, error: errGrupo } = await supabase.from('conciliacao_grupos').insert({ aviso_diferenca: avisoDiferenca ?? null }).select('id').single();
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
      const { error } = await supabase.from('conciliacao_lancamentos_sistema').update({ taxa_valor: taxaValor, taxa_percentual: taxaPercentual }).eq('id', s.id);
      if (error) throw error;
      taxaAcumulada += taxaValor;
    }
  }

  let linhaTaxaAtualizada: SistemaRow | null = null;
  if (taxaAcumulada > 0) {
    const linhaTaxa = await garantirLinhaTaxaCartao(bancoSelecionado[0]?.data ?? new Date().toISOString().slice(0, 10));
    const { data, error } = await supabase
      .from('conciliacao_lancamentos_sistema')
      .update({ valor: +(linhaTaxa.valor - taxaAcumulada).toFixed(2) })
      .eq('id', linhaTaxa.id)
      .select('*')
      .single();
    if (error) throw error;
    linhaTaxaAtualizada = data;
  }

  const { data: bancoAtualizados, error: errUpdBanco } = await supabase
    .from('conciliacao_lancamentos_banco')
    .update({ conciliado: true, grupo_id: grupo.id })
    .in('id', bancoIds)
    .select('*');
  if (errUpdBanco) throw errUpdBanco;

  const { data: sistemaAtualizados, error: errUpdSistema } = await supabase
    .from('conciliacao_lancamentos_sistema')
    .update({ conciliado: true, grupo_id: grupo.id })
    .in('id', sistemaIds)
    .select('*');
  if (errUpdSistema) throw errUpdSistema;

  // A linha de taxa automática não faz parte de `sistemaIds` (é sempre a
  // mesma linha fixa, não uma selecionada pelo usuário) — some ela na mão
  // se foi tocada, senão o card de "Administradora de Cartão" ficaria com
  // o valor antigo até a página ser recarregada.
  const todosSistema = linhaTaxaAtualizada && !sistemaAtualizados.some((s) => s.id === linhaTaxaAtualizada!.id) ? [...sistemaAtualizados, linhaTaxaAtualizada] : sistemaAtualizados;

  // Um par que acabou de ser conciliado não faz mais sentido continuar na
  // lista de "descartados" (se por acaso um dia foi descartado antes) — some
  // sozinho, sem precisar restaurar manualmente. `.in()` duplo pega só a
  // interseção exata (banco_id de bancoIds E sistema_id de sistemaIds), nunca
  // apaga descarte de nenhum outro par.
  await supabase.from('conciliacao_sugestoes_descartadas').delete().in('banco_id', bancoIds).in('sistema_id', sistemaIds);

  return {
    bancoAtualizados: bancoAtualizados.map(bancoFromRow),
    sistemaAtualizados: todosSistema.map(sistemaFromRow),
  };
}

export interface ResultadoConciliarManual {
  bancoCriado: LancamentoBanco;
  sistemaAtualizado: LancamentoSistema;
}

/**
 * "Conciliar manual (Sistema → OFX)" — quando um lançamento do sistema não
 * tem correspondente real no banco, cria um lançamento de banco origem
 * 'manual' com os mesmos dados, já conciliado com ele. Retorna as duas
 * linhas afetadas pro chamador atualizar o estado local direto, sem
 * recarregar as tabelas inteiras (a de Sistema tem milhares de linhas).
 */
export async function conciliarManualSistema(sistemaId: string): Promise<ResultadoConciliarManual> {
  const { data: s, error: errS } = await supabase.from('conciliacao_lancamentos_sistema').select('*').eq('id', sistemaId).single();
  if (errS) throw errS;
  if (s.conciliado) throw new Error('Este item já está conciliado.');
  if (!s.nf) throw new Error('Conciliação manual só é permitida para lançamentos com NF.');

  const { data: grupo, error: errGrupo } = await supabase.from('conciliacao_grupos').insert({}).select('id').single();
  if (errGrupo) throw errGrupo;

  // Na grade Banco (OFX) a NF é a informação que o usuário reconhece de
  // relance — o nº de documento interno do Sistema não diz muito ali.
  const descricao = [s.cliente, s.forma_pagamento_raw, s.nf ? `NF ${s.nf}` : s.documento].filter(Boolean).join(' — ');
  const { data: bancoNovo, error: errBanco } = await supabase
    .from('conciliacao_lancamentos_banco')
    .insert({
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
      grupo_id: grupo.id,
    })
    .select('*')
    .single();
  if (errBanco) throw errBanco;

  const { data: sistemaAtualizado, error: errUpd } = await supabase
    .from('conciliacao_lancamentos_sistema')
    .update({ conciliado: true, grupo_id: grupo.id })
    .eq('id', sistemaId)
    .select('*')
    .single();
  if (errUpd) throw errUpd;

  return { bancoCriado: bancoFromRow(bancoNovo), sistemaAtualizado: sistemaFromRow(sistemaAtualizado) };
}

export interface ResultadoCancelarConciliacao {
  bancoIdsRemovidos: string[];
  bancoRevertidos: LancamentoBanco[];
  sistemaRevertidos: LancamentoSistema[];
  linhaTaxaAtualizada: LancamentoSistema | null;
}

/**
 * Desfaz um grupo de conciliação: reverte flags, apaga lançamentos
 * "manuais" criados só pra conciliar, e devolve a taxa de cartão
 * acumulada. Retorna as mudanças pro chamador aplicar no estado local
 * (sem recarregar as tabelas inteiras do zero).
 */
export async function cancelarConciliacao(grupoId: string): Promise<ResultadoCancelarConciliacao> {
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

  let bancoRevertidos: BancoRow[] = [];
  if (bancoParaReverter.length > 0) {
    const { data, error } = await supabase.from('conciliacao_lancamentos_banco').update({ conciliado: false, grupo_id: null }).in('id', bancoParaReverter).select('*');
    if (error) throw error;
    bancoRevertidos = data;
  }

  const taxaParaReverter = sistemaDoGrupo.reduce((soma, s) => soma + (s.taxa_valor > 0 ? s.taxa_valor : 0), 0);
  let sistemaRevertidos: SistemaRow[] = [];
  if (sistemaDoGrupo.length > 0) {
    const { data, error } = await supabase
      .from('conciliacao_lancamentos_sistema')
      .update({ conciliado: false, grupo_id: null })
      .in('id', sistemaDoGrupo.map((s) => s.id))
      .select('*');
    if (error) throw error;
    sistemaRevertidos = data;
  }

  let linhaTaxaAtualizada: SistemaRow | null = null;
  if (taxaParaReverter > 0) {
    const { data: linhaTaxa } = await supabase.from('conciliacao_lancamentos_sistema').select('*').eq('origem', 'taxa_automatica').maybeSingle();
    if (linhaTaxa) {
      const { data, error } = await supabase
        .from('conciliacao_lancamentos_sistema')
        .update({ valor: +(linhaTaxa.valor + taxaParaReverter).toFixed(2) })
        .eq('id', linhaTaxa.id)
        .select('*')
        .single();
      if (error) throw error;
      linhaTaxaAtualizada = data;
    }
  }

  return {
    bancoIdsRemovidos: manuaisParaApagar,
    bancoRevertidos: bancoRevertidos.map(bancoFromRow),
    sistemaRevertidos: sistemaRevertidos.map(sistemaFromRow),
    linhaTaxaAtualizada: linhaTaxaAtualizada ? sistemaFromRow(linhaTaxaAtualizada) : null,
  };
}
