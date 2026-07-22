import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { LogUpload, MapeamentoColunas, TipoRelatorio } from './types';

type EntregaInsert = Database['public']['Tables']['entregas_transportadora']['Insert'];
type VendaInsert = Database['public']['Tables']['vendas_tabela_preco']['Insert'];

export async function carregarMapeamentoSalvo(tipo: TipoRelatorio): Promise<MapeamentoColunas | null> {
  const { data, error } = await supabase
    .from('upload_mapeamentos')
    .select('mapeamento')
    .eq('tipo_relatorio', tipo)
    .maybeSingle();
  if (error) throw error;
  return (data?.mapeamento as MapeamentoColunas | undefined) ?? null;
}

export async function salvarMapeamento(tipo: TipoRelatorio, mapeamento: MapeamentoColunas): Promise<void> {
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

export async function inserirVendas396(registros: VendaInsert[]): Promise<void> {
  if (registros.length === 0) return;
  const { error } = await supabase.from('vendas_tabela_preco').insert(registros);
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
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function listarUploadsRecentes(limite = 20) {
  const { data, error } = await supabase
    .from('uploads_log')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data;
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
