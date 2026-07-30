import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAll';
import type { Database } from '@/types/database';
import type { LogUpload, MapeamentoColunas, TipoRelatorioMapeado } from './types';

type EntregaInsert = Database['public']['Tables']['entregas_transportadora']['Insert'];

export async function carregarMapeamentoSalvo(tipo: TipoRelatorioMapeado): Promise<MapeamentoColunas | null> {
  const { data, error } = await supabase
    .from('upload_mapeamentos')
    .select('mapeamento')
    .eq('tipo_relatorio', tipo)
    .maybeSingle();
  if (error) throw error;
  return (data?.mapeamento as MapeamentoColunas | undefined) ?? null;
}

export async function salvarMapeamento(tipo: TipoRelatorioMapeado, mapeamento: MapeamentoColunas): Promise<void> {
  const { error } = await supabase
    .from('upload_mapeamentos')
    .upsert({ tipo_relatorio: tipo, mapeamento, atualizado_em: new Date().toISOString() });
  if (error) throw error;
}

export async function inserirEntregas124(registros: EntregaInsert[]): Promise<void> {
  if (registros.length === 0) return;
  const { error } = await supabase.from('entregas_transportadora').insert(registros);
  if (error) throw error;
}

/** Retorna o id da linha de log criada — os registros importados são marcados com esse id (upload_log_id). */
export async function registrarLogUpload(log: LogUpload): Promise<string> {
  const { data, error } = await supabase
    .from('uploads_log')
    .insert({
      arquivo_nome: log.arquivoNome,
      tipo_relatorio: log.tipoRelatorio,
      linhas_importadas: log.linhasImportadas,
      status: log.status,
      mensagem: log.mensagem ?? null,
      tabela_preco: log.tabelaPreco ?? null,
      data_min: log.dataMin ?? null,
      data_max: log.dataMax ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

/** Histórico completo (não só os 20 mais recentes) — necessário pra mesclar corretamente os grupos na tela. */
export async function listarUploadsRecentes() {
  return fetchAllRows<Database['public']['Tables']['uploads_log']['Row']>((from, to) =>
    supabase.from('uploads_log').select('*').order('criado_em', { ascending: false }).range(from, to),
  );
}

/**
 * Apaga todos os uploads de um grupo mesclado de uma vez — cascade
 * (upload_log_id) cuida dos dados vinculados. Um grupo acumula o id de TODO
 * upload já feito pra esse tipo/tabela desde sempre (sem filtro de período)
 * — em lotes de 200 pra nunca estourar o limite de tamanho de URL do
 * `.in()` num grupo com muito histórico (mesma causa do bug real que já
 * travou a importação do 396).
 */
export async function apagarGrupoUploads(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from('uploads_log').delete().in('id', ids.slice(i, i + 200));
    if (error) throw error;
  }
}

/**
 * Apaga o(s) registro(s) de log anteriores de um tipo de relatório — usado
 * pelo 124, que não tem nº de documento pra deduplicar como o 396: cada
 * novo upload substitui o anterior por completo em vez de acumular.
 * Cascade (upload_log_id) apaga junto os dados vinculados.
 */
export async function apagarUploadsAnteriores(tipo: TipoRelatorioMapeado): Promise<void> {
  const { error } = await supabase.from('uploads_log').delete().eq('tipo_relatorio', tipo);
  if (error) throw error;
}

/**
 * Apaga o registro de upload e, em cascata (FK upload_log_id), todas as
 * linhas de entregas_transportadora/vendas_tabela_preco que vieram dele.
 * Uploads feitos antes da coluna upload_log_id existir não têm esse vínculo
 * — o delete remove só a linha do histórico nesses casos.
 */
export async function apagarUpload(id: string): Promise<void> {
  const { error } = await supabase.from('uploads_log').delete().eq('id', id);
  if (error) throw error;
}
