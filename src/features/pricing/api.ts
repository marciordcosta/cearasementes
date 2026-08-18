import { fetchAllRows } from '@/lib/fetchAll';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import { inferirNomeCategoriaDoNome, inferirPesoDoNome } from './produtoInferencia';
import type { Canal, Categoria, CustoPersonalizado, Fornecedor, FreteAdicionalTipo, Produto, Subcategoria, TipoImposto } from './types';

type CanalRow = Database['public']['Tables']['canais_preco']['Row'];
type CategoriaRow = Database['public']['Tables']['categorias']['Row'];
type ProdutoRow = Database['public']['Tables']['produtos']['Row'];
type FornecedorRow = Database['public']['Tables']['fornecedores']['Row'];
type SubcategoriaRow = Database['public']['Tables']['subcategorias']['Row'];
type CustoPersonalizadoRow = Database['public']['Tables']['custos_personalizados']['Row'];

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
    margemPorReferencia: row.margem_por_referencia,
    whatsapp: row.whatsapp,
    mostrarDetalhesPlantio: row.mostrar_detalhes_plantio,
    pagamentoHabilitado: row.pagamento_habilitado,
    pagamentoAvistaDescontoPct: row.pagamento_avista_desconto_pct,
    pagamentoBoletoValorMinimo: row.pagamento_boleto_valor_minimo,
    pagamentoBoletoParcelasMax: row.pagamento_boleto_parcelas_max,
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
      margem_por_referencia: false,
    })
    .select('*')
    .single();
  if (error) throw error;

  const [categoriasIds, produtosIds] = await Promise.all([
    fetchAllRows<{ id: string }>((from, to) => supabase.from('categorias').select('id').range(from, to)),
    fetchAllRows<{ id: string }>((from, to) => supabase.from('produtos').select('id').range(from, to)),
  ]);

  if (categoriasIds.length > 0) {
    const { error: errMargens } = await supabase
      .from('categoria_margens')
      .insert(categoriasIds.map((c) => ({ categoria_id: c.id, canal_id: data.id, margem_pct: 20 })));
    if (errMargens) throw errMargens;
  }
  if (produtosIds.length > 0) {
    const { error: errPrecos } = await supabase
      .from('produto_precos')
      .insert(produtosIds.map((p) => ({ produto_id: p.id, canal_id: data.id, preco: null, manual: false, precisa_ajuste: false })));
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

  // Cada Tabela nova é independente das outras (canal_id próprio em categoria_margens/produto_precos) — sem risco em paralelo.
  await Promise.all(
    faltantes.map((nome, i) =>
      inserirCanal({
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
        ordem: canaisExistentes.length + i,
      }),
    ),
  );
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
    fetchAllRows<Database['public']['Tables']['categoria_margens']['Row']>((from, to) =>
      supabase.from('categoria_margens').select('*').range(from, to),
    ),
  ]);

  return categoriasRows.map((row) => {
    const margens: Record<string, number> = {};
    const tolerancias: Record<string, number> = {};
    const referenciaCanalId: Record<string, string> = {};
    const referenciaAjustePct: Record<string, number> = {};
    margensRows
      .filter((m) => m.categoria_id === row.id)
      .forEach((m) => {
        margens[m.canal_id] = m.margem_pct;
        if (m.tolerancia_pct !== null) tolerancias[m.canal_id] = m.tolerancia_pct;
        if (m.referencia_canal_id !== null) referenciaCanalId[m.canal_id] = m.referencia_canal_id;
        if (m.referencia_ajuste_pct) referenciaAjustePct[m.canal_id] = m.referencia_ajuste_pct;
      });
    return {
      id: row.id,
      nome: row.nome,
      estadual: row.estadual,
      interestadual: row.interestadual,
      ordem: row.ordem,
      margens,
      tolerancias,
      referenciaCanalId,
      referenciaAjustePct,
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

  return {
    id: data.id,
    nome: data.nome,
    estadual: data.estadual,
    interestadual: data.interestadual,
    ordem: data.ordem,
    margens,
    tolerancias: {},
    referenciaCanalId: {},
    referenciaAjustePct: {},
  };
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

/** valor null = apaga a tolerância configurada (volta a não ter alerta pra essa categoria+canal). */
export async function upsertCategoriaMargemTolerancia(categoriaId: string, canalId: string, valor: number | null): Promise<void> {
  const { error } = await supabase
    .from('categoria_margens')
    .upsert({ categoria_id: categoriaId, canal_id: canalId, tolerancia_pct: valor });
  if (error) throw error;
}

/** valor null = essa categoria volta a não ter referência escolhida pra esse canal (só importa se o canal estiver em "por referência"). */
export async function upsertCategoriaReferencia(categoriaId: string, canalId: string, valor: string | null): Promise<void> {
  const { error } = await supabase
    .from('categoria_margens')
    .upsert({ categoria_id: categoriaId, canal_id: canalId, referencia_canal_id: valor });
  if (error) throw error;
}

export async function upsertCategoriaReferenciaAjuste(categoriaId: string, canalId: string, valor: number): Promise<void> {
  const { error } = await supabase
    .from('categoria_margens')
    .upsert({ categoria_id: categoriaId, canal_id: canalId, referencia_ajuste_pct: valor });
  if (error) throw error;
}

export async function fetchSubcategorias(): Promise<Subcategoria[]> {
  const [subcategoriasRows, margensRows] = await Promise.all([
    fetchAllRows<SubcategoriaRow>((from, to) => supabase.from('subcategorias').select('*').order('ordem').range(from, to)),
    fetchAllRows<{ subcategoria_id: string; canal_id: string; margem_pct: number }>((from, to) =>
      supabase.from('subcategoria_margens').select('*').range(from, to),
    ),
  ]);

  return subcategoriasRows.map((row) => {
    const margens: Record<string, number> = {};
    margensRows.filter((m) => m.subcategoria_id === row.id).forEach((m) => (margens[m.canal_id] = m.margem_pct));
    return { id: row.id, categoriaId: row.categoria_id, nome: row.nome, ordem: row.ordem, margens };
  });
}

/** Sem linhas em subcategoria_margens na criação — começa sem overrides, herdando tudo da categoria pai. */
export async function inserirSubcategoria(input: { categoriaId: string; nome: string; ordem: number }): Promise<Subcategoria> {
  const { data, error } = await supabase
    .from('subcategorias')
    .insert({ categoria_id: input.categoriaId, nome: input.nome, ordem: input.ordem })
    .select('*')
    .single();
  if (error) throw error;
  return { id: data.id, categoriaId: data.categoria_id, nome: data.nome, ordem: data.ordem, margens: {} };
}

export async function apagarSubcategoria(id: string): Promise<void> {
  const { error } = await supabase.from('subcategorias').delete().eq('id', id);
  if (error) throw error;
}

export async function upsertSubcategoriaMargem(subcategoriaId: string, canalId: string, margemPct: number): Promise<void> {
  const { error } = await supabase
    .from('subcategoria_margens')
    .upsert({ subcategoria_id: subcategoriaId, canal_id: canalId, margem_pct: margemPct });
  if (error) throw error;
}

/** Campo deixado em branco no painel — apaga o override, volta a herdar a margem da categoria pai. */
export async function apagarSubcategoriaMargem(subcategoriaId: string, canalId: string): Promise<void> {
  const { error } = await supabase.from('subcategoria_margens').delete().eq('subcategoria_id', subcategoriaId).eq('canal_id', canalId);
  if (error) throw error;
}

function fornecedorFromRow(row: FornecedorRow): Fornecedor {
  return { id: row.id, nome: row.nome, ordem: row.ordem, visivelGrade: row.visivel_grade, visivelPdf: row.visivel_pdf };
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

export async function atualizarFornecedor(id: string, patch: Partial<Pick<FornecedorRow, 'nome' | 'ordem' | 'visivel_grade' | 'visivel_pdf'>>): Promise<void> {
  const { error } = await supabase.from('fornecedores').update(patch).eq('id', id);
  if (error) throw error;
}

export async function apagarFornecedor(id: string): Promise<void> {
  const { error } = await supabase.from('fornecedores').delete().eq('id', id);
  if (error) throw error;
}

function custoPersonalizadoFromRow(row: CustoPersonalizadoRow): CustoPersonalizado {
  return { id: row.id, descricao: row.descricao, tipo: row.tipo, valor: row.valor, ordem: row.ordem };
}

export async function fetchCustosPersonalizados(): Promise<CustoPersonalizado[]> {
  const rows = await fetchAllRows<CustoPersonalizadoRow>((from, to) => supabase.from('custos_personalizados').select('*').order('ordem').range(from, to));
  return rows.map(custoPersonalizadoFromRow);
}

export async function inserirCustoPersonalizado(input: { descricao: string; tipo: 'reais' | 'percentual'; valor: number; ordem: number }): Promise<CustoPersonalizado> {
  const { data, error } = await supabase.from('custos_personalizados').insert(input).select('*').single();
  if (error) throw error;
  return custoPersonalizadoFromRow(data);
}

export async function atualizarCustoPersonalizado(
  id: string,
  patch: Partial<Pick<CustoPersonalizadoRow, 'descricao' | 'tipo' | 'valor' | 'ordem'>>,
): Promise<void> {
  const { error } = await supabase.from('custos_personalizados').update(patch).eq('id', id);
  if (error) throw error;
}

export async function apagarCustoPersonalizado(id: string): Promise<void> {
  const { error } = await supabase.from('custos_personalizados').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchProdutos(): Promise<Produto[]> {
  const [produtosRows, precosRows] = await Promise.all([
    fetchAllRows<ProdutoRow>((from, to) => supabase.from('produtos').select('*').range(from, to)),
    fetchAllRows<{ produto_id: string; canal_id: string; preco: number | null; manual: boolean; precisa_ajuste: boolean }>((from, to) =>
      supabase.from('produto_precos').select('*').range(from, to),
    ),
  ]);

  return produtosRows.map((row) => {
    const precos: Produto['precos'] = {};
    precosRows
      .filter((p) => p.produto_id === row.id)
      .forEach((p) => (precos[p.canal_id] = { preco: p.preco, manual: p.manual, precisaAjuste: p.precisa_ajuste }));
    return {
      id: row.id,
      nome: row.nome,
      codigo: row.codigo,
      categoriaId: row.categoria_id,
      custo: row.custo,
      valorKg: row.valor_kg,
      peso: row.peso,
      despesaExtraValor: row.despesa_extra_valor,
      cubagem: row.cubagem,
      fornecedorId: row.fornecedor_id,
      subcategoriaId: row.subcategoria_id,
      imprimir: row.imprimir,
      usarDescontoReal: row.usar_desconto_real,
      mostrarDetalhesCatalogo: row.mostrar_detalhes_catalogo,
      cultivar: row.cultivar,
      precos,
    };
  });
}

export async function inserirProduto(
  input: { nome: string; codigo: string | null; categoriaId: string; custo: number; valorKg: number; peso: number },
  canais: Canal[],
): Promise<Produto> {
  const { data, error } = await supabase
    .from('produtos')
    .insert({
      nome: input.nome,
      codigo: input.codigo,
      categoria_id: input.categoriaId,
      custo: input.custo,
      valor_kg: input.valorKg,
      peso: input.peso,
      despesa_extra_valor: 0,
      despesa_extra_destino: 'frete',
      cubagem: null,
      fornecedor_id: null,
      subcategoria_id: null,
      imprimir: true,
      usar_desconto_real: false,
      mostrar_detalhes_catalogo: true,
      cultivar: null,
    })
    .select('*')
    .single();
  if (error) throw error;

  const precos: Produto['precos'] = {};
  if (canais.length > 0) {
    const { error: errPrecos } = await supabase
      .from('produto_precos')
      .insert(canais.map((c) => ({ produto_id: data.id, canal_id: c.id, preco: null, manual: false, precisa_ajuste: false })));
    if (errPrecos) throw errPrecos;
    canais.forEach((c) => (precos[c.id] = { preco: null, manual: false, precisaAjuste: false }));
  }

  return {
    id: data.id,
    nome: data.nome,
    codigo: data.codigo,
    categoriaId: data.categoria_id,
    custo: data.custo,
    valorKg: data.valor_kg,
    peso: data.peso,
    despesaExtraValor: data.despesa_extra_valor,
    cubagem: data.cubagem,
    fornecedorId: data.fornecedor_id,
    subcategoriaId: data.subcategoria_id,
    imprimir: data.imprimir,
    usarDescontoReal: data.usar_desconto_real,
    mostrarDetalhesCatalogo: data.mostrar_detalhes_catalogo,
    cultivar: data.cultivar,
    precos,
  };
}

export async function atualizarProduto(
  id: string,
  patch: Partial<
    Pick<
      ProdutoRow,
      | 'nome'
      | 'codigo'
      | 'categoria_id'
      | 'custo'
      | 'valor_kg'
      | 'peso'
      | 'despesa_extra_valor'
      | 'cubagem'
      | 'fornecedor_id'
      | 'subcategoria_id'
      | 'imprimir'
      | 'usar_desconto_real'
      | 'mostrar_detalhes_catalogo'
      | 'cultivar'
    >
  >,
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

/** Marca (ou desmarca) que a linha desse produto, só nesse canal, precisa de ajuste — destaca na Tabela de Preços e some do catálogo em PDF desse canal. */
export async function atualizarPrecisaAjuste(produtoId: string, canalId: string, precisaAjuste: boolean): Promise<void> {
  const { error } = await supabase.from('produto_precos').update({ precisa_ajuste: precisaAjuste }).eq('produto_id', produtoId).eq('canal_id', canalId);
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
      // Recalcula valor_kg junto — senão o Editar Produto mostraria um valor desatualizado em relação ao custo recém-sincronizado.
      const valorKg = produto.peso > 0 ? Math.round((item.custo / produto.peso) * 10000) / 10000 : 0;
      await atualizarProduto(produto.id, { custo: item.custo, valor_kg: valorKg });
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
      const pesoInferido = inferirPesoDoNome(item.nome);
      linhas.push({
        nome: item.nome,
        codigo: item.codigo,
        categoria_id: categoriaInferida?.id ?? categoriaPadraoId!,
        custo: item.custo,
        // Retroalimentado a partir do custo importado — o Editar Produto ajusta com precisão depois.
        valor_kg: pesoInferido > 0 ? Math.round((item.custo / pesoInferido) * 10000) / 10000 : 0,
        peso: pesoInferido,
        despesa_extra_valor: 0,
        despesa_extra_destino: 'frete' as const,
        cubagem: null,
        fornecedor_id: null,
        subcategoria_id: null,
        imprimir: true,
        usar_desconto_real: false,
        mostrar_detalhes_catalogo: true,
        cultivar: null,
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

// ---------- Catálogo Online (link público, ver 0069/0070_catalogo_publico*.sql) ----------

/** "revenda-ce", a partir de "Revenda CE" — vira o link público (/catalogo/<slug>) em vez do uuid do canal. */
function paraSlugCatalogo(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface ItemCatalogoPublicoInput {
  produtoId: string;
  nome: string;
  categoriaNome: string;
  subcategoriaNome: string | null;
  fornecedorNome: string | null;
  preco: number;
  peso: number;
  pesoUsado: number;
  /** = resolverPlantioParaProduto(...).kgHaLanco (calculoSemeadura.ts) — null sem laudo correspondente. */
  plantioKgHaLanco: number | null;
  plantioSementesCovaBase: number | null;
  plantioPms: number | null;
  /** = resolverPlantioParaProduto(...).vc — só exibição no card (Fornecedor > VC% > PMS > Validade). */
  plantioVc: number | null;
  /** = resolverPlantioParaProduto(...).pmsManual — PMS cru desse lote, nunca o base da Parametrização. */
  plantioPmsManual: string | null;
  plantioValidade: string | null;
  plantioMargemTolerancia: number;
  /** = resolverPlantioParaProduto(...).precisaPesoPorCova — true: calculadora mostra Peso/cova (g) em vez de Sementes/cova no modo Covas. */
  plantioPrecisaPesoPorCova: boolean;
  /** = resolverPlantioParaProduto(...).modoPadrao — modo (Lanço/Covas/Linha) cadastrado em Parametrização pra esse Cultivar+Processo; modo inicial da Calculadora de plantio. */
  plantioModoPadrao: 'cova' | 'lanco' | 'linha' | null;
  /** = Produto.mostrarDetalhesCatalogo — false SOBREPÕE Canal.mostrarDetalhesPlantio e esconde VC%/Validade/PMS no card só pra esse item. */
  mostrarDetalhesCatalogo: boolean;
  /** = Produto.cultivar — pra agrupar "mesmo produto" na página/PDFs públicos (ver chaveComparacaoProduto em calculations.ts), igual já vale internamente. */
  cultivar: string | null;
  ordem: number;
}

/** Mapeia um item calculado (ver ItemCatalogoPublicoInput) pra linha de `catalogo_publico_itens` — usado por publicarCatalogoOnline (insere o lote inteiro de uma vez). */
function itemCatalogoParaRow(canalId: string, item: ItemCatalogoPublicoInput) {
  return {
    canal_id: canalId,
    produto_id: item.produtoId,
    nome: item.nome,
    categoria_nome: item.categoriaNome,
    subcategoria_nome: item.subcategoriaNome,
    fornecedor_nome: item.fornecedorNome,
    preco: item.preco,
    peso: item.peso,
    peso_usado: item.pesoUsado,
    plantio_kg_ha_lanco: item.plantioKgHaLanco,
    plantio_sementes_cova_base: item.plantioSementesCovaBase,
    plantio_pms: item.plantioPms,
    plantio_vc: item.plantioVc,
    plantio_pms_manual: item.plantioPmsManual,
    plantio_validade: item.plantioValidade,
    plantio_margem_tolerancia: item.plantioMargemTolerancia,
    plantio_precisa_peso_por_cova: item.plantioPrecisaPesoPorCova,
    plantio_modo_padrao: item.plantioModoPadrao,
    mostrar_detalhes_catalogo: item.mostrarDetalhesCatalogo,
    cultivar: item.cultivar,
    ordem: item.ordem,
  };
}

/**
 * "Publicar" o Catálogo Online de UM canal — apaga o snapshot anterior desse canal inteiro e
 * insere os itens já calculados (preço pronto, nunca custo/margem) de uma vez só, mais o slug
 * (link "bonito") e os dados de Frete/WhatsApp desse canal (ver resolverFreteEfetivo em
 * calculations.ts — base do cálculo de frete do Orçamento). Sempre chamado autenticado (o operador
 * já está logado quando clica "Publicar" na Precificação); a leitura pública
 * (fetchCatalogoPublicoPorSlug) não passa por aqui. Devolve o slug pra montar o link.
 */
export interface PagamentoConfigCanal {
  habilitado: boolean;
  avistaDescontoPct: number;
  boletoValorMinimo: number;
  boletoParcelasMax: number;
}

export async function publicarCatalogoOnline(
  canalId: string,
  canalNome: string,
  freteKgEfetivo: number,
  fretePctEfetivo: number,
  freteFixo: number,
  freteMinimo: number,
  temTransportadora: boolean,
  whatsapp: string | null,
  mostrarDetalhesPlantio: boolean,
  pagamento: PagamentoConfigCanal,
  itens: ItemCatalogoPublicoInput[],
): Promise<string> {
  const slug = paraSlugCatalogo(canalNome);
  const { error: errSlug } = await supabase.from('catalogo_publico_canais').upsert({
    canal_id: canalId,
    slug,
    nome: canalNome,
    frete_kg_efetivo: freteKgEfetivo,
    frete_pct_efetivo: fretePctEfetivo,
    frete_fixo: freteFixo,
    frete_minimo: freteMinimo,
    tem_transportadora: temTransportadora,
    whatsapp,
    mostrar_detalhes_plantio: mostrarDetalhesPlantio,
    pagamento_habilitado: pagamento.habilitado,
    pagamento_avista_desconto_pct: pagamento.avistaDescontoPct,
    pagamento_boleto_valor_minimo: pagamento.boletoValorMinimo,
    pagamento_boleto_parcelas_max: pagamento.boletoParcelasMax,
  });
  if (errSlug) throw errSlug;

  const { error: errDelete } = await supabase.from('catalogo_publico_itens').delete().eq('canal_id', canalId);
  if (errDelete) throw errDelete;
  if (itens.length > 0) {
    const { error: errInsert } = await supabase.from('catalogo_publico_itens').insert(itens.map((item) => itemCatalogoParaRow(canalId, item)));
    if (errInsert) throw errInsert;
  }
  return slug;
}

/**
 * produto_id -> preço já publicado desse canal — só o suficiente pra detectar "mudança pendente"
 * (preço diferente do calculado agora, ou item ativo/inativo divergindo do que está publicado) na
 * tela cheia por canal (ver ChannelFullscreenModal.tsx), sem trazer o item inteiro. Autenticado, mas
 * lê a mesma tabela pública — sem novidade de segurança, só um recorte de colunas.
 */
export async function fetchPrecosCatalogoPublicoPorCanal(canalId: string): Promise<Map<string, number>> {
  const rows = await fetchAllRows<{ produto_id: string; preco: number }>((from, to) =>
    supabase.from('catalogo_publico_itens').select('produto_id, preco').eq('canal_id', canalId).range(from, to),
  );
  return new Map(rows.map((r) => [r.produto_id, r.preco]));
}

/** Config (frete/whatsapp/pagamento/plantio) já publicada de 1 canal — ver statusPublicacaoPendenteCanal em calculations.ts, que compara isso com a config atual pra saber se precisa republicar. */
export interface ConfigCatalogoPublicoCanal {
  freteKgEfetivo: number;
  fretePctEfetivo: number;
  freteFixo: number;
  freteMinimo: number;
  temTransportadora: boolean;
  whatsapp: string | null;
  mostrarDetalhesPlantio: boolean;
  pagamentoHabilitado: boolean;
  pagamentoAvistaDescontoPct: number;
  pagamentoBoletoValorMinimo: number;
  pagamentoBoletoParcelasMax: number;
}

/** Null quando esse canal nunca foi publicado (nesse caso, item "novo" já cobre a pendência — não é config desatualizada, é primeira publicação). */
export async function fetchConfigCatalogoPublicoPorCanal(canalId: string): Promise<ConfigCatalogoPublicoCanal | null> {
  const { data, error } = await supabase
    .from('catalogo_publico_canais')
    .select(
      'frete_kg_efetivo, frete_pct_efetivo, frete_fixo, frete_minimo, tem_transportadora, whatsapp, mostrar_detalhes_plantio, pagamento_habilitado, pagamento_avista_desconto_pct, pagamento_boleto_valor_minimo, pagamento_boleto_parcelas_max',
    )
    .eq('canal_id', canalId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    freteKgEfetivo: data.frete_kg_efetivo,
    fretePctEfetivo: data.frete_pct_efetivo,
    freteFixo: data.frete_fixo,
    freteMinimo: data.frete_minimo,
    temTransportadora: data.tem_transportadora,
    whatsapp: data.whatsapp,
    mostrarDetalhesPlantio: data.mostrar_detalhes_plantio,
    pagamentoHabilitado: data.pagamento_habilitado,
    pagamentoAvistaDescontoPct: data.pagamento_avista_desconto_pct,
    pagamentoBoletoValorMinimo: data.pagamento_boleto_valor_minimo,
    pagamentoBoletoParcelasMax: data.pagamento_boleto_parcelas_max,
  };
}

export interface CatalogoPublico {
  canalNome: string | null;
  freteKgEfetivo: number;
  fretePctEfetivo: number;
  freteFixo: number;
  freteMinimo: number;
  temTransportadora: boolean;
  whatsapp: string | null;
  mostrarDetalhesPlantio: boolean;
  pagamentoHabilitado: boolean;
  pagamentoAvistaDescontoPct: number;
  pagamentoBoletoValorMinimo: number;
  pagamentoBoletoParcelasMax: number;
  itens: {
    id: string;
    nome: string;
    categoriaNome: string;
    subcategoriaNome: string | null;
    fornecedorNome: string | null;
    preco: number;
    peso: number;
    pesoUsado: number;
    plantioKgHaLanco: number | null;
    plantioSementesCovaBase: number | null;
    plantioPms: number | null;
    plantioVc: number | null;
    plantioPmsManual: string | null;
    plantioValidade: string | null;
    plantioMargemTolerancia: number | null;
    plantioPrecisaPesoPorCova: boolean;
    plantioModoPadrao: 'cova' | 'lanco' | 'linha' | null;
    mostrarDetalhesCatalogo: boolean;
    cultivar: string | null;
  }[];
}

/**
 * Leitura pública (sem login) — só essas 2 tabelas, nunca `produtos`/`canais_preco` com
 * Custo/Margem. Null quando o slug não bate com nenhum canal publicado. `limit(1)` (não
 * `maybeSingle`) — 2 Tabelas com nomes que gerem o MESMO slug (raro, mas possível) não têm nada
 * que impeça isso no banco; melhor mostrar uma delas do que a página inteira quebrar.
 */
export async function fetchCatalogoPublicoPorSlug(slug: string): Promise<CatalogoPublico | null> {
  const { data: canalRows } = await supabase.from('catalogo_publico_canais').select('*').eq('slug', slug).order('atualizado_em', { ascending: false }).limit(1);
  const canalRow = canalRows?.[0];
  if (!canalRow) return null;
  const { data: itensRows, error: errItens } = await supabase.from('catalogo_publico_itens').select('*').eq('canal_id', canalRow.canal_id).order('ordem');
  if (errItens) throw errItens;
  return {
    canalNome: canalRow.nome,
    freteKgEfetivo: canalRow.frete_kg_efetivo,
    fretePctEfetivo: canalRow.frete_pct_efetivo,
    freteFixo: canalRow.frete_fixo,
    freteMinimo: canalRow.frete_minimo,
    temTransportadora: canalRow.tem_transportadora,
    whatsapp: canalRow.whatsapp,
    mostrarDetalhesPlantio: canalRow.mostrar_detalhes_plantio,
    pagamentoHabilitado: canalRow.pagamento_habilitado,
    pagamentoAvistaDescontoPct: canalRow.pagamento_avista_desconto_pct,
    pagamentoBoletoValorMinimo: canalRow.pagamento_boleto_valor_minimo,
    pagamentoBoletoParcelasMax: canalRow.pagamento_boleto_parcelas_max,
    itens: (itensRows ?? []).map((i) => ({
      id: i.id,
      nome: i.nome,
      categoriaNome: i.categoria_nome,
      subcategoriaNome: i.subcategoria_nome,
      fornecedorNome: i.fornecedor_nome,
      preco: i.preco,
      peso: i.peso,
      pesoUsado: i.peso_usado,
      plantioKgHaLanco: i.plantio_kg_ha_lanco,
      plantioSementesCovaBase: i.plantio_sementes_cova_base,
      plantioPms: i.plantio_pms,
      plantioVc: i.plantio_vc,
      plantioPmsManual: i.plantio_pms_manual,
      plantioValidade: i.plantio_validade,
      plantioMargemTolerancia: i.plantio_margem_tolerancia,
      plantioPrecisaPesoPorCova: i.plantio_precisa_peso_por_cova,
      plantioModoPadrao: i.plantio_modo_padrao,
      mostrarDetalhesCatalogo: i.mostrar_detalhes_catalogo,
      cultivar: i.cultivar,
    })),
  };
}
