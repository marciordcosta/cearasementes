import { fetchAllRows } from '@/lib/fetchAll';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import { inferirNomeCategoriaDoNome, inferirPesoDoNome } from './produtoInferencia';
import type { Canal, Categoria, Fornecedor, FreteAdicionalTipo, Produto, TipoImposto } from './types';

type CanalRow = Database['public']['Tables']['canais_preco']['Row'];
type CategoriaRow = Database['public']['Tables']['categorias']['Row'];
type ProdutoRow = Database['public']['Tables']['produtos']['Row'];
type FornecedorRow = Database['public']['Tables']['fornecedores']['Row'];

function canalFromRow(row: CanalRow): Canal {
  return {
    id: row.id,
    nome: row.nome,
    desconto: row.desconto,
    comissao: row.comissao,
    cartao: row.cartao,
    outrosEncargos: row.outros_encargos,
    freteKg: row.frete_kg,
    fretePct: row.frete_pct,
    freteAdicionalTipo: row.frete_adicional_tipo,
    freteAdicionalValor: row.frete_adicional_valor,
    tipoImposto: row.tipo_imposto,
    visivel: row.visivel,
    freteIncluso: row.frete_incluso,
    corIndice: row.cor_indice,
    ordem: row.ordem,
    transportadoraId: row.transportadora_id,
  };
}

export async function fetchCanais(): Promise<Canal[]> {
  const rows = await fetchAllRows<CanalRow>((from, to) => supabase.from('canais_preco').select('*').order('ordem').range(from, to));
  return rows.map(canalFromRow);
}

/**
 * Cria a Tabela de Preço e já grava, de verdade, a margem padrão (20%) pra
 * toda categoria existente e um "preço em branco" pra todo produto
 * existente — sem isso, um canal novo nasce sem categoria_margens/
 * produto_precos persistidos, e some na próxima vez que a página carrega
 * (mesmo já tendo aparecido corretamente na tela até o reload).
 * Auto-suficiente (busca categorias/produtos ela mesma) pra poder ser
 * chamada tanto da tela de Parametrização quanto do fluxo de Uploads.
 */
export async function inserirCanal(input: {
  nome: string;
  desconto: number;
  comissao: number;
  cartao: number;
  outrosEncargos: number;
  freteKg: number;
  fretePct: number;
  freteAdicionalTipo: FreteAdicionalTipo;
  freteAdicionalValor: number;
  tipoImposto: TipoImposto;
  transportadoraId?: string | null;
  ordem: number;
}): Promise<Canal> {
  const { data, error } = await supabase
    .from('canais_preco')
    .insert({
      nome: input.nome,
      desconto: input.desconto,
      comissao: input.comissao,
      cartao: input.cartao,
      outros_encargos: input.outrosEncargos,
      frete_kg: input.freteKg,
      frete_pct: input.fretePct,
      frete_adicional_tipo: input.freteAdicionalTipo,
      frete_adicional_valor: input.freteAdicionalValor,
      tipo_imposto: input.tipoImposto,
      visivel: true,
      frete_incluso: true,
      cor_indice: input.ordem,
      ordem: input.ordem,
      transportadora_id: input.transportadoraId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;

  const [{ data: categoriasIds, error: errCat }, { data: produtosIds, error: errProd }] = await Promise.all([
    supabase.from('categorias').select('id'),
    supabase.from('produtos').select('id'),
  ]);
  if (errCat) throw errCat;
  if (errProd) throw errProd;

  if (categoriasIds.length > 0) {
    const { error: errMargens } = await supabase
      .from('categoria_margens')
      .insert(categoriasIds.map((c) => ({ categoria_id: c.id, canal_id: data.id, margem_pct: 20 })));
    if (errMargens) throw errMargens;
  }
  if (produtosIds.length > 0) {
    const { error: errPrecos } = await supabase
      .from('produto_precos')
      .insert(produtosIds.map((p) => ({ produto_id: p.id, canal_id: data.id, preco: null, manual: false })));
    if (errPrecos) throw errPrecos;
  }

  return canalFromRow(data);
}

/**
 * Garante que exista uma Tabela de Preço (canal) com cada nome informado —
 * usado no upload do Relatório 396 pra criar automaticamente as tabelas que
 * aparecerem no arquivo e ainda não existirem, com parâmetros zerados
 * (o usuário ajusta depois em Parametrização de Custos). Retorna quantas
 * foram criadas.
 */
export async function garantirCanaisPreco(nomes: string[]): Promise<number> {
  const nomesUnicos = Array.from(new Set(nomes.map((n) => n.trim()).filter(Boolean)));
  if (nomesUnicos.length === 0) return 0;

  const canaisExistentes = await fetchCanais();
  const nomesExistentesLower = new Set(canaisExistentes.map((c) => c.nome.toLowerCase()));
  const faltantes = nomesUnicos.filter((nome) => !nomesExistentesLower.has(nome.toLowerCase()));

  let ordem = canaisExistentes.length;
  for (const nome of faltantes) {
    await inserirCanal({
      nome,
      desconto: 0,
      comissao: 0,
      cartao: 0,
      outrosEncargos: 0,
      freteKg: 0,
      fretePct: 0,
      freteAdicionalTipo: 'fixo',
      freteAdicionalValor: 0,
      tipoImposto: 'estadual',
      ordem: ordem++,
    });
  }
  return faltantes.length;
}

export async function atualizarCanal(id: string, patch: Partial<Omit<CanalRow, 'id' | 'criado_em'>>): Promise<void> {
  const { error } = await supabase.from('canais_preco').update(patch).eq('id', id);
  if (error) throw error;
}

export async function apagarCanal(id: string): Promise<void> {
  const { error } = await supabase.from('canais_preco').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchCategorias(): Promise<Categoria[]> {
  const [categoriasRows, margensRows] = await Promise.all([
    fetchAllRows<CategoriaRow>((from, to) => supabase.from('categorias').select('*').order('ordem').range(from, to)),
    fetchAllRows<{ categoria_id: string; canal_id: string; margem_pct: number }>((from, to) => supabase.from('categoria_margens').select('*').range(from, to)),
  ]);

  return categoriasRows.map((row) => {
    const margens: Record<string, number> = {};
    margensRows.filter((m) => m.categoria_id === row.id).forEach((m) => (margens[m.canal_id] = m.margem_pct));
    return {
      id: row.id,
      nome: row.nome,
      estadual: row.estadual,
      interestadual: row.interestadual,
      ordem: row.ordem,
      margens,
    };
  });
}

export async function inserirCategoria(input: { nome: string; estadual: number; interestadual: number; ordem: number }, canais: Canal[]): Promise<Categoria> {
  const { data, error } = await supabase
    .from('categorias')
    .insert({ nome: input.nome, estadual: input.estadual, interestadual: input.interestadual, ordem: input.ordem })
    .select('*')
    .single();
  if (error) throw error;

  const margens: Record<string, number> = {};
  if (canais.length > 0) {
    const { error: errMargens } = await supabase
      .from('categoria_margens')
      .insert(canais.map((c) => ({ categoria_id: data.id, canal_id: c.id, margem_pct: 20 })));
    if (errMargens) throw errMargens;
    canais.forEach((c) => (margens[c.id] = 20));
  }

  return { id: data.id, nome: data.nome, estadual: data.estadual, interestadual: data.interestadual, ordem: data.ordem, margens };
}

export async function atualizarCategoria(id: string, patch: Partial<Pick<CategoriaRow, 'nome' | 'estadual' | 'interestadual' | 'ordem'>>): Promise<void> {
  const { error } = await supabase.from('categorias').update(patch).eq('id', id);
  if (error) throw error;
}

export async function apagarCategoria(id: string): Promise<void> {
  const { error } = await supabase.from('categorias').delete().eq('id', id);
  if (error) throw error;
}

export async function upsertCategoriaMargem(categoriaId: string, canalId: string, margemPct: number): Promise<void> {
  const { error } = await supabase
    .from('categoria_margens')
    .upsert({ categoria_id: categoriaId, canal_id: canalId, margem_pct: margemPct });
  if (error) throw error;
}

function fornecedorFromRow(row: FornecedorRow): Fornecedor {
  return { id: row.id, nome: row.nome, ordem: row.ordem };
}

export async function fetchFornecedores(): Promise<Fornecedor[]> {
  const rows = await fetchAllRows<FornecedorRow>((from, to) => supabase.from('fornecedores').select('*').order('ordem').range(from, to));
  return rows.map(fornecedorFromRow);
}

export async function inserirFornecedor(input: { nome: string; ordem: number }): Promise<Fornecedor> {
  const { data, error } = await supabase.from('fornecedores').insert({ nome: input.nome, ordem: input.ordem }).select('*').single();
  if (error) throw error;
  return fornecedorFromRow(data);
}

export async function atualizarFornecedor(id: string, patch: Partial<Pick<FornecedorRow, 'nome' | 'ordem'>>): Promise<void> {
  const { error } = await supabase.from('fornecedores').update(patch).eq('id', id);
  if (error) throw error;
}

export async function apagarFornecedor(id: string): Promise<void> {
  const { error } = await supabase.from('fornecedores').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchProdutos(): Promise<Produto[]> {
  const [produtosRows, precosRows] = await Promise.all([
    fetchAllRows<ProdutoRow>((from, to) => supabase.from('produtos').select('*').range(from, to)),
    fetchAllRows<{ produto_id: string; canal_id: string; preco: number | null; manual: boolean }>((from, to) =>
      supabase.from('produto_precos').select('*').range(from, to),
    ),
  ]);

  return produtosRows.map((row) => {
    const precos: Produto['precos'] = {};
    precosRows.filter((p) => p.produto_id === row.id).forEach((p) => (precos[p.canal_id] = { preco: p.preco, manual: p.manual }));
    return {
      id: row.id,
      nome: row.nome,
      codigo: row.codigo,
      categoriaId: row.categoria_id,
      custo: row.custo,
      peso: row.peso,
      despesaExtraValor: row.despesa_extra_valor,
      cubagem: row.cubagem,
      fornecedorId: row.fornecedor_id,
      imprimir: row.imprimir,
      precos,
    };
  });
}

export async function inserirProduto(input: { nome: string; codigo: string | null; categoriaId: string; custo: number; peso: number }, canais: Canal[]): Promise<Produto> {
  const { data, error } = await supabase
    .from('produtos')
    .insert({
      nome: input.nome,
      codigo: input.codigo,
      categoria_id: input.categoriaId,
      custo: input.custo,
      peso: input.peso,
      despesa_extra_valor: 0,
      despesa_extra_destino: 'frete',
      cubagem: null,
      fornecedor_id: null,
      imprimir: true,
    })
    .select('*')
    .single();
  if (error) throw error;

  const precos: Produto['precos'] = {};
  if (canais.length > 0) {
    const { error: errPrecos } = await supabase
      .from('produto_precos')
      .insert(canais.map((c) => ({ produto_id: data.id, canal_id: c.id, preco: null, manual: false })));
    if (errPrecos) throw errPrecos;
    canais.forEach((c) => (precos[c.id] = { preco: null, manual: false }));
  }

  return {
    id: data.id,
    nome: data.nome,
    codigo: data.codigo,
    categoriaId: data.categoria_id,
    custo: data.custo,
    peso: data.peso,
    despesaExtraValor: data.despesa_extra_valor,
    cubagem: data.cubagem,
    fornecedorId: data.fornecedor_id,
    imprimir: data.imprimir,
    precos,
  };
}

export async function atualizarProduto(
  id: string,
  patch: Partial<Pick<ProdutoRow, 'nome' | 'codigo' | 'categoria_id' | 'custo' | 'peso' | 'despesa_extra_valor' | 'cubagem' | 'fornecedor_id' | 'imprimir'>>,
): Promise<void> {
  const payload: Database['public']['Tables']['produtos']['Update'] = { ...patch, atualizado_em: new Date().toISOString() };
  const { error } = await supabase.from('produtos').update(payload).eq('id', id);
  if (error) throw error;
}

export async function apagarProduto(id: string): Promise<void> {
  const { error } = await supabase.from('produtos').delete().eq('id', id);
  if (error) throw error;
}

/** Apaga TODOS os produtos (e, em cascata, os preços deles em cada canal). Mantém Tabelas de Preço e Categorias intactas. */
export async function apagarTodosProdutos(): Promise<void> {
  const { error } = await supabase.from('produtos').delete().not('id', 'is', null);
  if (error) throw error;
}

export async function upsertProdutoPreco(produtoId: string, canalId: string, preco: number | null, manual: boolean): Promise<void> {
  const { error } = await supabase.from('produto_precos').upsert({ produto_id: produtoId, canal_id: canalId, preco, manual });
  if (error) throw error;
}

const NOME_CATEGORIA_PADRAO = 'Sem Categoria';

/**
 * Garante a categoria placeholder usada por produtos que chegam sem
 * categoria conhecida (caso do Relatório 333, que só traz Código/Produto/
 * Custo) — cria com impostos zerados na primeira vez que for necessária.
 */
async function garantirCategoriaSemCategoria(categoriasExistentes: Categoria[], canais: Canal[]): Promise<string> {
  const achada = categoriasExistentes.find((c) => c.nome.toLowerCase() === NOME_CATEGORIA_PADRAO.toLowerCase());
  if (achada) return achada.id;
  const nova = await inserirCategoria({ nome: NOME_CATEGORIA_PADRAO, estadual: 0, interestadual: 0, ordem: categoriasExistentes.length }, canais);
  return nova.id;
}

export interface ResultadoSincronizacaoProdutos {
  criados: number;
  atualizados: number;
}

/**
 * Sincroniza Código Interno + Custo do Relatório 333 no cadastro de
 * produtos: atualiza o custo de quem já existe (por Código Interno) e
 * cadastra quem ainda não existe usando a categoria placeholder "Sem
 * Categoria" (o usuário reclassifica depois em Precificação). Não
 * duplica produto já cadastrado.
 */
export async function sincronizarProdutosCusto(itens: { codigo: string; nome: string; custo: number }[]): Promise<ResultadoSincronizacaoProdutos> {
  if (itens.length === 0) return { criados: 0, atualizados: 0 };

  const [canais, categorias, produtosExistentes] = await Promise.all([fetchCanais(), fetchCategorias(), fetchProdutos()]);
  const porCodigo = new Map(produtosExistentes.filter((p) => p.codigo).map((p) => [p.codigo as string, p]));

  const novosItens = itens.filter((item) => !porCodigo.has(item.codigo));
  const existentesItens = itens.filter((item) => porCodigo.has(item.codigo));

  let atualizados = 0;
  for (const item of existentesItens) {
    const produto = porCodigo.get(item.codigo)!;
    if (produto.custo !== item.custo) {
      await atualizarProduto(produto.id, { custo: item.custo });
      atualizados++;
    }
  }

  if (novosItens.length > 0) {
    let categoriaPadraoId: string | null = null;
    const linhas = [];
    for (const item of novosItens) {
      const nomeCategoriaInferida = inferirNomeCategoriaDoNome(item.nome);
      const categoriaInferida = nomeCategoriaInferida
        ? categorias.find((c) => c.nome.toLowerCase() === nomeCategoriaInferida.toLowerCase())
        : undefined;
      if (!categoriaInferida && categoriaPadraoId === null) {
        categoriaPadraoId = await garantirCategoriaSemCategoria(categorias, canais);
      }
      linhas.push({
        nome: item.nome,
        codigo: item.codigo,
        categoria_id: categoriaInferida?.id ?? categoriaPadraoId!,
        custo: item.custo,
        peso: inferirPesoDoNome(item.nome),
        despesa_extra_valor: 0,
        despesa_extra_destino: 'frete' as const,
        cubagem: null,
        fornecedor_id: null,
        imprimir: true,
      });
    }
    const { data, error } = await supabase.from('produtos').insert(linhas).select('id');
    if (error) throw error;

    if (canais.length > 0 && data.length > 0) {
      const precos = data.flatMap((p) => canais.map((c) => ({ produto_id: p.id, canal_id: c.id, preco: null, manual: false })));
      const { error: errPrecos } = await supabase.from('produto_precos').insert(precos);
      if (errPrecos) throw errPrecos;
    }
  }

  return { criados: novosItens.length, atualizados };
}
