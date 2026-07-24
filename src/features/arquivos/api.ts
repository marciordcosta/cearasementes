import { fetchAllRows } from '@/lib/fetchAll';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { ArquivoLaudo, NovoLaudoInput } from './types';

type ArquivoRow = Database['public']['Tables']['arquivos_laudos']['Row'];

const BUCKET = 'laudos';

function fromRow(row: ArquivoRow): ArquivoLaudo {
  return {
    id: row.id,
    nomeProduto: row.nome_produto,
    lote: row.lote,
    anoSafra: row.ano_safra,
    arquivoNome: row.arquivo_nome,
    arquivoUrl: row.arquivo_url,
    arquivoTipo: row.arquivo_tipo,
    tamanhoBytes: row.tamanho_bytes,
    enviadoEm: row.enviado_em,
    pureza: row.pureza,
    germinacao: row.germinacao,
    validade: row.validade,
  };
}

export async function fetchArquivosLaudos(): Promise<ArquivoLaudo[]> {
  const rows = await fetchAllRows<ArquivoRow>((from, to) => supabase.from('arquivos_laudos').select('*').order('enviado_em', { ascending: false }).range(from, to));
  return rows.map(fromRow);
}

/** Sobe o arquivo pro bucket "laudos" (Supabase Storage) e grava os metadados. */
export async function enviarLaudo(input: NovoLaudoInput): Promise<ArquivoLaudo> {
  const caminho = `${Date.now()}_${input.arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const { error: errUpload } = await supabase.storage.from(BUCKET).upload(caminho, input.arquivo, { contentType: input.arquivo.type || undefined });
  if (errUpload) throw errUpload;

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(caminho);

  const { data, error } = await supabase
    .from('arquivos_laudos')
    .insert({
      nome_produto: input.nomeProduto,
      lote: input.lote || null,
      ano_safra: input.anoSafra || null,
      arquivo_nome: input.arquivo.name,
      arquivo_url: publicUrlData.publicUrl,
      arquivo_tipo: input.arquivo.type || null,
      tamanho_bytes: input.arquivo.size,
      pureza: input.pureza || null,
      germinacao: input.germinacao || null,
      validade: input.validade || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return fromRow(data);
}

/** Corrige só os metadados — não mexe no arquivo já enviado. */
export async function atualizarLaudo(
  id: string,
  patch: { nomeProduto: string; lote: string; anoSafra: string; pureza: string; germinacao: string; validade: string },
): Promise<void> {
  const { error } = await supabase
    .from('arquivos_laudos')
    .update({
      nome_produto: patch.nomeProduto,
      lote: patch.lote || null,
      ano_safra: patch.anoSafra || null,
      pureza: patch.pureza || null,
      germinacao: patch.germinacao || null,
      validade: patch.validade || null,
    })
    .eq('id', id);
  if (error) throw error;
}

/** Apaga os metadados e, best-effort, o arquivo no Storage (o caminho é derivado da URL pública). */
export async function apagarLaudo(laudo: ArquivoLaudo): Promise<void> {
  const { error } = await supabase.from('arquivos_laudos').delete().eq('id', laudo.id);
  if (error) throw error;

  const marcador = `/${BUCKET}/`;
  const idx = laudo.arquivoUrl.indexOf(marcador);
  if (idx === -1) return;
  const caminho = decodeURIComponent(laudo.arquivoUrl.slice(idx + marcador.length));
  await supabase.storage.from(BUCKET).remove([caminho]);
}
