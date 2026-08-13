import { fetchAllRows } from '@/lib/fetchAll';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { ArquivoLaudo, ChecklistOpcao, ChecklistPergunta, FatorPlantio, ManualPlantio, NovoLaudoInput, ProdutoParametrizacao } from './types';

type ArquivoRow = Database['public']['Tables']['arquivos_laudos']['Row'];
type ProdutoParametrizacaoRow = Database['public']['Tables']['arquivos_parametrizacao_produtos']['Row'];
type FatorPlantioRow = Database['public']['Tables']['arquivos_fatores_plantio']['Row'];
type ChecklistPerguntaRow = Database['public']['Tables']['arquivos_checklist_perguntas']['Row'];
type ChecklistOpcaoRow = Database['public']['Tables']['arquivos_checklist_opcoes']['Row'];

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
    categoria: row.categoria,
    especie: row.especie,
    processo: row.processo,
    pesoEmbalagem: row.peso_embalagem,
    pms: row.pms,
    testeForma: row.teste_forma,
    testeData: row.teste_data,
    testePlantadas: row.teste_plantadas,
    testeGerminadas: row.teste_germinadas,
    testePesoPlantado: row.teste_peso_plantado,
    testeFotos: row.teste_fotos ?? [],
    testeObservacao: row.teste_observacao,
    testeDataResultado: row.teste_data_resultado,
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
      categoria: input.categoria || null,
      especie: input.especie || null,
      processo: input.processo || null,
      peso_embalagem: input.pesoEmbalagem || null,
      pms: null,
      teste_forma: null,
      teste_data: null,
      teste_plantadas: null,
      teste_germinadas: null,
      teste_peso_plantado: null,
      teste_fotos: null,
      teste_observacao: null,
      teste_data_resultado: null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return fromRow(data);
}

/** Corrige só os metadados — não mexe no arquivo já enviado. */
export async function atualizarLaudo(
  id: string,
  patch: {
    nomeProduto: string;
    lote: string;
    anoSafra: string;
    pureza: string;
    germinacao: string;
    validade: string;
    categoria: string;
    processo: string;
    pesoEmbalagem: string;
    pms: string;
  },
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
      categoria: patch.categoria || null,
      processo: patch.processo || null,
      peso_embalagem: patch.pesoEmbalagem || null,
      pms: patch.pms || null,
    })
    .eq('id', id);
  if (error) throw error;
}

export interface PatchTeste {
  testeForma: 'sementes' | 'peso' | null;
  testeData: string | null;
  testePlantadas: number | null;
  testeGerminadas: number | null;
  testePesoPlantado: number | null;
  testeFotos: string[];
  testeObservacao: string | null;
  testeDataResultado: string | null;
}

/** Teste de germinação de campo (nosso, feito com frequência) — um resultado por laudo, editar substitui o anterior. */
export async function atualizarTeste(id: string, patch: PatchTeste): Promise<void> {
  const { error } = await supabase
    .from('arquivos_laudos')
    .update({
      teste_forma: patch.testeForma,
      teste_data: patch.testeData,
      teste_plantadas: patch.testePlantadas,
      teste_germinadas: patch.testeGerminadas,
      teste_peso_plantado: patch.testePesoPlantado,
      teste_fotos: patch.testeFotos,
      teste_data_resultado: patch.testeDataResultado,
      teste_observacao: patch.testeObservacao,
    })
    .eq('id', id);
  if (error) throw error;
}

/** Grava só a lista de fotos (sem tocar nos demais campos do teste) — chamado a cada foto adicionada/removida, pra persistir na hora, sem esperar o "Salvar" do resto do formulário. */
export async function atualizarFotosTeste(id: string, testeFotos: string[]): Promise<void> {
  const { error } = await supabase.from('arquivos_laudos').update({ teste_fotos: testeFotos }).eq('id', id);
  if (error) throw error;
}

/** Sobe uma foto do Teste de Campo pro bucket "laudos" (path prefixado por laudo, pra não misturar com o PDF na raiz) e devolve a URL pública. */
export async function enviarFotoTeste(laudoId: string, arquivo: File): Promise<string> {
  const caminho = `teste-fotos/${laudoId}/${Date.now()}_${arquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type || undefined });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
}

/** Apaga uma foto do Teste de Campo do Storage — best-effort, mesmo padrão de apagarLaudo (deriva o caminho da própria URL pública). */
export async function apagarFotoTeste(url: string): Promise<void> {
  const marcador = `/${BUCKET}/`;
  const idx = url.indexOf(marcador);
  if (idx === -1) return;
  await supabase.storage.from(BUCKET).remove([decodeURIComponent(url.slice(idx + marcador.length))]);
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

function produtoParametrizacaoFromRow(row: ProdutoParametrizacaoRow): ProdutoParametrizacao {
  return {
    id: row.id,
    nomeProduto: row.nome_produto,
    pmsBase: row.pms_base,
    densidadeBase: row.densidade_base,
    indiceSobrevivencia: row.indice_sobrevivencia,
    maxPlantulasCova: row.max_plantulas_cova,
    perdaMedia: row.perda_media,
    perdaBaixa: row.perda_baixa,
    maxPlantulasMetroLinear: row.max_plantulas_metro_linear,
    modoPlantio: row.modo_plantio === 'cova' || row.modo_plantio === 'lanco' ? row.modo_plantio : null,
    margemTolerancia: row.margem_tolerancia,
    observacaoEtiqueta: row.observacao_etiqueta,
  };
}

/** Parametrização de Produtos (PMS base, Densidade base, Índice de Sobrevivência, Peso do Saco por nome) — lista curta, sem paginação. */
export async function fetchParametrizacaoProdutos(): Promise<ProdutoParametrizacao[]> {
  const { data, error } = await supabase.from('arquivos_parametrizacao_produtos').select('*').order('nome_produto');
  if (error) throw error;
  return data.map(produtoParametrizacaoFromRow);
}

/**
 * `nome_produto` é a chave de conflito (não `id`) — é o "grupo" (ver
 * grupoDoNome), único por constraint no banco (migração 0040). Isso garante
 * 1 linha por grupo mesmo sob concorrência: editar PMS e Densidade em
 * sequência rápida, cada um antes do outro saber que o grupo acabou de ser
 * criado, não cria mais duas linhas — o segundo upsert bate na mesma linha
 * que o primeiro acabou de inserir.
 */
export async function salvarParametrizacaoProduto(produto: {
  nomeProduto: string;
  pmsBase: string;
  densidadeBase: string;
  indiceSobrevivencia: string;
  maxPlantulasCova: string;
  perdaMedia: string;
  perdaBaixa: string;
  maxPlantulasMetroLinear: string;
  modoPlantio: 'cova' | 'lanco' | null;
  margemTolerancia: string;
  observacaoEtiqueta: string;
}): Promise<void> {
  const { error } = await supabase.from('arquivos_parametrizacao_produtos').upsert(
    {
      nome_produto: produto.nomeProduto,
      pms_base: produto.pmsBase || null,
      densidade_base: produto.densidadeBase || null,
      indice_sobrevivencia: produto.indiceSobrevivencia || null,
      max_plantulas_cova: produto.maxPlantulasCova || null,
      perda_media: produto.perdaMedia || null,
      perda_baixa: produto.perdaBaixa || null,
      max_plantulas_metro_linear: produto.maxPlantulasMetroLinear || null,
      modo_plantio: produto.modoPlantio,
      margem_tolerancia: produto.margemTolerancia || null,
      observacao_etiqueta: produto.observacaoEtiqueta || null,
    },
    { onConflict: 'nome_produto' },
  );
  if (error) throw error;
}

/** Corrige o grupo (nome_produto) de uma linha já cadastrada — usado quando a extração automática (1ª + 3ª palavra) não pegou o nome certo. */
export async function renomearParametrizacaoProduto(id: string, novoNome: string): Promise<void> {
  const { error } = await supabase.from('arquivos_parametrizacao_produtos').update({ nome_produto: novoNome }).eq('id', id);
  if (error) throw error;
}

export async function apagarParametrizacaoProduto(id: string): Promise<void> {
  const { error } = await supabase.from('arquivos_parametrizacao_produtos').delete().eq('id', id);
  if (error) throw error;
}

function fatorPlantioFromRow(row: FatorPlantioRow): FatorPlantio {
  return { chave: row.chave, categoria: row.categoria, rotulo: row.rotulo, fator: row.fator, resumo: row.resumo };
}

/** Fatores globais (Modo de Plantio, Condição de Implantação) — 5 linhas fixas, sempre as mesmas. */
export async function fetchFatoresPlantio(): Promise<FatorPlantio[]> {
  const { data, error } = await supabase.from('arquivos_fatores_plantio').select('*').order('categoria').order('fator', { ascending: false });
  if (error) throw error;
  return data.map(fatorPlantioFromRow);
}

export async function atualizarFatorPlantio(chave: string, fator: string): Promise<void> {
  const { error } = await supabase.from('arquivos_fatores_plantio').update({ fator }).eq('chave', chave);
  if (error) throw error;
}

/** Resumo técnico da condição (só faz sentido pras linhas categoria='condicao') — mostrado no Guia de Plantio. */
export async function atualizarResumoCondicao(chave: string, resumo: string): Promise<void> {
  const { error } = await supabase.from('arquivos_fatores_plantio').update({ resumo }).eq('chave', chave);
  if (error) throw error;
}

function checklistOpcaoFromRow(row: ChecklistOpcaoRow): ChecklistOpcao {
  return { id: row.id, perguntaId: row.pergunta_id, ordem: row.ordem, texto: row.texto, condicaoChave: row.condicao_chave };
}

/** Checklist de Diagnóstico de Campo (Guia de Plantio) — perguntas já com suas opções, ordenadas. */
export async function fetchChecklistPlantio(): Promise<ChecklistPergunta[]> {
  const [perguntasRows, opcoesRows] = await Promise.all([
    fetchAllRows<ChecklistPerguntaRow>((from, to) => supabase.from('arquivos_checklist_perguntas').select('*').order('ordem').range(from, to)),
    fetchAllRows<ChecklistOpcaoRow>((from, to) => supabase.from('arquivos_checklist_opcoes').select('*').order('ordem').range(from, to)),
  ]);
  return perguntasRows.map((p) => ({
    id: p.id,
    ordem: p.ordem,
    pergunta: p.pergunta,
    opcoes: opcoesRows.filter((o) => o.pergunta_id === p.id).map(checklistOpcaoFromRow),
  }));
}

export async function inserirPerguntaChecklist(pergunta: string, ordem: number): Promise<ChecklistPergunta> {
  const { data, error } = await supabase.from('arquivos_checklist_perguntas').insert({ pergunta, ordem }).select('*').single();
  if (error) throw error;
  return { id: data.id, ordem: data.ordem, pergunta: data.pergunta, opcoes: [] };
}

export async function atualizarPerguntaChecklist(id: string, pergunta: string): Promise<void> {
  const { error } = await supabase.from('arquivos_checklist_perguntas').update({ pergunta }).eq('id', id);
  if (error) throw error;
}

export async function apagarPerguntaChecklist(id: string): Promise<void> {
  const { error } = await supabase.from('arquivos_checklist_perguntas').delete().eq('id', id);
  if (error) throw error;
}

export async function inserirOpcaoChecklist(perguntaId: string, texto: string, condicaoChave: string, ordem: number): Promise<ChecklistOpcao> {
  const { data, error } = await supabase
    .from('arquivos_checklist_opcoes')
    .insert({ pergunta_id: perguntaId, texto, condicao_chave: condicaoChave, ordem })
    .select('*')
    .single();
  if (error) throw error;
  return checklistOpcaoFromRow(data);
}

export async function atualizarOpcaoChecklist(id: string, patch: { texto?: string; condicaoChave?: string }): Promise<void> {
  const { error } = await supabase
    .from('arquivos_checklist_opcoes')
    .update({
      ...(patch.texto !== undefined ? { texto: patch.texto } : {}),
      ...(patch.condicaoChave !== undefined ? { condicao_chave: patch.condicaoChave } : {}),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function apagarOpcaoChecklist(id: string): Promise<void> {
  const { error } = await supabase.from('arquivos_checklist_opcoes').delete().eq('id', id);
  if (error) throw error;
}

/** Manual de Plantio (texto opcional que acompanha o PDF do Guia de Plantio) — uma linha só, id fixo 'default'. */
export async function fetchManualPlantio(): Promise<ManualPlantio | null> {
  const { data, error } = await supabase.from('arquivos_manual_plantio').select('*').eq('id', 'default').maybeSingle();
  if (error) throw error;
  return data ? { titulo: data.titulo, corpo: data.corpo } : null;
}

export async function salvarManualPlantio(manual: ManualPlantio): Promise<void> {
  const { error } = await supabase.from('arquivos_manual_plantio').upsert({ id: 'default', titulo: manual.titulo, corpo: manual.corpo });
  if (error) throw error;
}
