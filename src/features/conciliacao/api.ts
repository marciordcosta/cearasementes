import { fetchAllRows } from '@/lib/fetchAll';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { RegistroBancoParseado, RegistroSistemaParseado } from './parsing';
import type { ArquivoConciliacao, LancamentoBanco, LancamentoSistema, NovoLancamentoManual, TipoArquivo } from './types';

/** Um registro do arquivo novo que bate (por fitid) com um lançamento já CONCILIADO, mas com dado diferente do que já está gravado — mostrado antes de importar, pro usuário escolher se atualiza ou mantém o antigo. */
export interface ConflitoRegistroBanco {
  fitid: string;
  antigo: { data: string; valor: number; descricao: string | null };
  novo: RegistroBancoParseado;
}

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
 * Detecta, ANTES de gravar, quais registros do arquivo novo já existem (por
 * `fitid`), já estão CONCILIADOS, e têm valor/data/descrição diferentes do
 * que já está no banco — casos em que o upsert normal reescreveria o dado
 * bruto de um lançamento já conciliado sem avisar ninguém. Registros
 * idênticos ou não conciliados não entram aqui (não tem nada pra decidir).
 */
export async function detectarConflitosConciliados(registros: RegistroBancoParseado[]): Promise<ConflitoRegistroBanco[]> {
  const fitids = registros.map((r) => r.fitid).filter((f): f is string => f !== null);
  if (fitids.length === 0) return [];

  const { data: existentes, error } = await supabase
    .from('conciliacao_lancamentos_banco')
    .select('fitid, data, valor, descricao')
    .in('fitid', fitids)
    .eq('conciliado', true);
  if (error) throw error;
  if (!existentes || existentes.length === 0) return [];

  const existentePorFitid = new Map(existentes.map((e) => [e.fitid as string, e]));
  const conflitos: ConflitoRegistroBanco[] = [];
  for (const novo of registros) {
    if (!novo.fitid) continue;
    const antigo = existentePorFitid.get(novo.fitid);
    if (!antigo) continue;
    if (antigo.data === novo.data && Math.abs(antigo.valor - novo.valor) < 0.005 && (antigo.descricao ?? '') === novo.descricao) continue;
    conflitos.push({ fitid: novo.fitid, antigo: { data: antigo.data, valor: antigo.valor, descricao: antigo.descricao }, novo });
  }
  return conflitos;
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
 *
 * `fitidsParaManter`: fitids que o usuário escolheu MANTER como estavam (ver
 * detectarConflitosConciliados) — ficam de fora do upsert inteiro, não só do
 * conflito, preservando o registro antigo intacto.
 */
/** Retorna quantas linhas foram de fato gravadas (após deduplicar por fitid dentro do próprio arquivo e descontar as mantidas). */
export async function importarLancamentosBanco(
  nomeArquivo: string,
  bancoCodigo: string,
  bancoNome: string,
  registros: RegistroBancoParseado[],
  fitidsParaManter: Set<string> = new Set(),
): Promise<number> {
  const { data: arquivo, error: errArquivo } = await supabase
    .from('conciliacao_arquivos')
    .insert({ nome_arquivo: nomeArquivo, tipo: 'ofx', banco_codigo: bancoCodigo, banco_nome: bancoNome })
    .select('id')
    .single();
  if (errArquivo) throw errArquivo;
  if (registros.length === 0) return 0;

  const registrosUnicos = dedupPorChave(registros, (r) => r.fitid).filter((r) => !r.fitid || !fitidsParaManter.has(r.fitid));
  if (registrosUnicos.length === 0) return 0;
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
 * O MaxData gera número de documento pra toda venda normal — só recebimento
 * em dinheiro fica sem (confirmado nos dados reais de produção: 179 de
 * 11.881 linhas sem documento, todas com forma de pagamento "Dinheiro"; um
 * recorte bem pequeno, não a maioria). Pra essas, cai pro conjunto de campos
 * disponível mais específico (cliente + vendedor + forma de pagamento) —
 * não é infalível (duas linhas idênticas nesses campos, mesmo dia, mesmo
 * valor, ainda colidiriam), mas cobre o caso real.
 */
function chaveDedupSistema(r: RegistroSistemaParseado): string | null {
  if (r.documento) return r.documento;
  if (!r.cliente) return null;
  return `${r.cliente}|${r.vendedor ?? ''}|${r.formaPagamentoRaw ?? ''}`;
}

/** Um registro do arquivo novo cuja chave (`chaveDedupSistema`) bate com um lançamento já CONCILIADO, mas com valor/data diferentes do que já está gravado — ver detectarConflitosConciliadosSistema. */
export interface ConflitoRegistroSistema {
  chave: string;
  antigoId: string;
  antigo: { data: string | null; valor: number };
  novo: RegistroSistemaParseado;
}

/**
 * Detecta, ANTES de gravar, conflitos com lançamentos do Sistema já
 * CONCILIADOS. Diferente do lado Banco (upsert por `fitid` sozinho), aqui o
 * conflito de upsert é por (`chave_dedup`, `data`, `valor`) — os TRÊS juntos
 * fazem parte da chave. Isso significa que, se o valor ou a data mudar pra
 * uma linha que logicamente é "a mesma" (mesmo `chave_dedup`), o upsert
 * normal NÃO atualiza a linha existente — ele insere uma linha NOVA (pendente,
 * ao lado da antiga ainda conciliada), porque a chave de conflito não bate
 * mais. Por isso a "atualização" aqui precisa ser um UPDATE explícito por id
 * (ver atualizarLancamentoSistemaConciliado), não um upsert.
 */
export async function detectarConflitosConciliadosSistema(registros: RegistroSistemaParseado[]): Promise<ConflitoRegistroSistema[]> {
  const porChave = new Map<string, RegistroSistemaParseado>();
  for (const r of registros) {
    const chave = chaveDedupSistema(r);
    if (chave) porChave.set(chave, r);
  }
  const chaves = [...porChave.keys()];
  if (chaves.length === 0) return [];

  const { data: existentes, error } = await supabase
    .from('conciliacao_lancamentos_sistema')
    .select('id, chave_dedup, data, valor')
    .in('chave_dedup', chaves)
    .eq('conciliado', true);
  if (error) throw error;
  if (!existentes || existentes.length === 0) return [];

  const conflitos: ConflitoRegistroSistema[] = [];
  for (const existente of existentes) {
    if (!existente.chave_dedup) continue;
    const novo = porChave.get(existente.chave_dedup);
    if (!novo) continue;
    if (existente.data === novo.data && Math.abs(existente.valor - novo.valor) < 0.005) continue;
    conflitos.push({ chave: existente.chave_dedup, antigoId: existente.id, antigo: { data: existente.data, valor: existente.valor }, novo });
  }
  return conflitos;
}

/** Aplica o dado novo num lançamento do Sistema já conciliado (escolha "Atualizar" num conflito) — UPDATE explícito por id, nunca toca `conciliado`/`grupo_id`/`taxa_*`. */
export async function atualizarLancamentoSistemaConciliado(id: string, novo: RegistroSistemaParseado): Promise<void> {
  const { error } = await supabase
    .from('conciliacao_lancamentos_sistema')
    .update({
      cliente: novo.cliente,
      documento: novo.documento,
      nf: novo.nf,
      vendedor: novo.vendedor,
      forma_pagamento_raw: novo.formaPagamentoRaw,
      valor: novo.valor,
      data: novo.data,
      data_vencimento: novo.dataVencimento,
    })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Grava o relatório do sistema (Max Data) + seus lançamentos já parseados
 * (parseMatricial). Upsert por (`chave_dedup`, `data`, `valor`) — reenviar o
 * mesmo relatório sem mudar nada atualiza a linha existente em vez de
 * duplicar; se valor/data mudarem pra uma linha já conciliada, ver
 * detectarConflitosConciliadosSistema (o upsert sozinho criaria uma linha
 * nova em vez de atualizar, já que data/valor fazem parte da chave).
 * `conciliado`/`taxa_*`/`grupo_id` ficam de fora do payload de propósito:
 * um reenvio nunca desfaz conciliação já feita. Retorna quantas linhas
 * foram de fato gravadas (após deduplicar dentro do próprio arquivo e
 * descontar as excluídas por `chavesParaExcluir`).
 */
export async function importarSistema(
  nomeArquivo: string,
  tipoLancamento: 'Entrada' | 'Saída',
  registros: RegistroSistemaParseado[],
  chavesParaExcluir: Set<string> = new Set(),
): Promise<number> {
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
  }).filter((r) => {
    const chave = chaveDedupSistema(r);
    return !chave || !chavesParaExcluir.has(chave);
  });
  if (registrosUnicos.length === 0) return 0;
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

/** "2025-01-15" -> "2025-01-01" — cada mês tem sua própria linha de taxa (uma só, acumulando o mês inteiro), em vez de tudo somado numa linha só desde sempre. */
function primeiroDiaDoMes(data: string): string {
  return `${data.slice(0, 7)}-01`;
}

async function garantirLinhaTaxaCartao(dataRef: string): Promise<SistemaRow> {
  const primeiroDia = primeiroDiaDoMes(dataRef);
  const { data: existente, error: errBusca } = await supabase
    .from('conciliacao_lancamentos_sistema')
    .select('*')
    .eq('origem', 'taxa_automatica')
    .eq('data', primeiroDia)
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
      data: primeiroDia,
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

  // Uma linha de taxa por MÊS (não uma só desde sempre) — soma-se aqui por
  // mês do lançamento do Banco, cobrindo até o caso raro de uma conciliação
  // em lote que misture datas de meses diferentes.
  const taxaPorMes = new Map<string, number>();
  for (const b of bancoSelecionado) {
    if (b.forma_pagamento !== 'CARTAO') continue;
    const valorOfx = Math.abs(b.valor);
    const mes = b.data.slice(0, 7);
    for (const s of sistemaSelecionado) {
      const valorSys = Math.abs(s.valor);
      if (valorSys <= 0 || valorSys < valorOfx) continue;
      const taxaValor = +(valorSys - valorOfx).toFixed(2);
      const taxaPercentual = +((taxaValor / valorSys) * 100).toFixed(2);
      const { error } = await supabase.from('conciliacao_lancamentos_sistema').update({ taxa_valor: taxaValor, taxa_percentual: taxaPercentual }).eq('id', s.id);
      if (error) throw error;
      taxaPorMes.set(mes, (taxaPorMes.get(mes) ?? 0) + taxaValor);
    }
  }

  const linhasTaxaAtualizadas: SistemaRow[] = [];
  for (const [mes, taxaAcumulada] of taxaPorMes) {
    if (taxaAcumulada <= 0) continue;
    const linhaTaxa = await garantirLinhaTaxaCartao(`${mes}-01`);
    const { data, error } = await supabase
      .from('conciliacao_lancamentos_sistema')
      .update({ valor: +(linhaTaxa.valor - taxaAcumulada).toFixed(2) })
      .eq('id', linhaTaxa.id)
      .select('*')
      .single();
    if (error) throw error;
    linhasTaxaAtualizadas.push(data);
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

  // A(s) linha(s) de taxa automática não fazem parte de `sistemaIds` (são
  // sempre linhas fixas por mês, não selecionadas pelo usuário) — soma-se elas
  // na mão se foram tocadas, senão o card de "Administradora de Cartão"
  // ficaria com o valor antigo até a página ser recarregada.
  const idsJaAtualizados = new Set(sistemaAtualizados.map((s) => s.id));
  const todosSistema = [...sistemaAtualizados, ...linhasTaxaAtualizadas.filter((l) => !idsJaAtualizados.has(l.id))];

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
    // Mesma linha (do MÊS certo) que recebeu essa taxa lá na conciliação — o
    // mês vem da data do lançamento do Banco (Cartão), não do Sistema.
    const dataRefCartao = bancoDoGrupo.find((b) => b.forma_pagamento === 'CARTAO')?.data ?? bancoDoGrupo[0]?.data;
    const primeiroDia = dataRefCartao ? primeiroDiaDoMes(dataRefCartao) : null;
    const { data: linhaTaxa } = primeiroDia
      ? await supabase.from('conciliacao_lancamentos_sistema').select('*').eq('origem', 'taxa_automatica').eq('data', primeiroDia).maybeSingle()
      : { data: null };
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
