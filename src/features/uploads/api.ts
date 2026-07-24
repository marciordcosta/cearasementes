import { fetchAllRows } from '@/lib/fetchAll';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { Intervalo } from './periodos';
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

/**
 * Upsert (não insert puro) por (tabela_preco, num_doc) — se o mesmo documento
 * já foi importado antes (upload com datas sobrepostas a um upload anterior),
 * atualiza a linha existente em vez de duplicar a venda. Linhas sem num_doc
 * mapeado (null) não têm essa proteção — sempre entram como novas, igual
 * antes.
 */
export async function inserirVendas396(registros: VendaInsert[]): Promise<void> {
  if (registros.length === 0) return;
  const { error } = await supabase.from('vendas_tabela_preco').upsert(registros, { onConflict: 'tabela_preco,num_doc' });
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
 * Períodos de cabeçalho dos uploads bem-sucedidos anteriores do mesmo grupo
 * (tipo_relatorio + tabela_preco) — usado só pelo 396, pra saber se o
 * cabeçalho do upload novo repete (se sobrepõe a) o de algum upload
 * anterior da mesma Tabela de Preço.
 */
export async function listarPeriodosGrupo(tipo: TipoRelatorio, tabelaPreco: string | null): Promise<Intervalo[]> {
  let query = supabase.from('uploads_log').select('data_min, data_max').eq('tipo_relatorio', tipo).neq('status', 'erro').not('data_min', 'is', null).not('data_max', 'is', null);
  query = tabelaPreco === null ? query.is('tabela_preco', null) : query.eq('tabela_preco', tabelaPreco);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => ({ inicio: new Date(`${r.data_min}T00:00:00`), fim: new Date(`${r.data_max}T00:00:00`) }));
}

/**
 * Menor/maior `data_venda` já gravada no banco pra essa Tabela de Preço —
 * usado só quando o cabeçalho do upload novo se sobrepõe ao de um upload
 * anterior, pra saber até onde os dados REAIS avançam (o cabeçalho sozinho
 * não serve pra isso: costuma pedir sempre o mesmo período amplo em toda
 * exportação, não avança conforme os dados vão sendo importados).
 */
export async function obterExtensaoVendas(tabelaPreco: string): Promise<Intervalo | null> {
  const base = () => supabase.from('vendas_tabela_preco').select('data_venda').eq('tabela_preco', tabelaPreco).not('data_venda', 'is', null);
  const [{ data: minRows, error: e1 }, { data: maxRows, error: e2 }] = await Promise.all([
    base().order('data_venda', { ascending: true }).limit(1),
    base().order('data_venda', { ascending: false }).limit(1),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (!minRows?.[0] || !maxRows?.[0]) return null;
  return { inicio: new Date(`${minRows[0].data_venda}T00:00:00`), fim: new Date(`${maxRows[0].data_venda}T00:00:00`) };
}

/** Apaga todos os uploads de um grupo mesclado de uma vez — cascade (upload_log_id) cuida dos dados vinculados. */
export async function apagarGrupoUploads(ids: string[]): Promise<void> {
  const { error } = await supabase.from('uploads_log').delete().in('id', ids);
  if (error) throw error;
}

/**
 * Apaga o(s) registro(s) de log anteriores de um tipo de relatório — usado
 * pelo 124 e pelo 333, que não têm nº de documento pra deduplicar como o
 * 396: cada novo upload substitui o anterior por completo em vez de
 * acumular. Cascade (upload_log_id) apaga junto os dados vinculados do 124;
 * o 333 não tem vínculo (sincroniza custo direto em `produtos`).
 */
export async function apagarUploadsAnteriores(tipo: TipoRelatorio): Promise<void> {
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
