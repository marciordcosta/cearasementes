import type { Transportadora } from '@/features/fretes/types';
import type { Canal, Categoria, Produto, ResultadoCalculo, Subcategoria } from './types';

/**
 * Peso cubado = volume (m³) x 300 — fator de cubagem padrão do frete
 * rodoviário. Cubagem é digitada como "C x L x A" em metros (ex.:
 * "0,60x0,40x0,10"); qualquer formato que não resulte em exatamente 3
 * números positivos é tratado como "sem cubagem" (usa o peso cadastrado).
 */
export function calcularPesoCubado(cubagem: string | null): number | null {
  if (!cubagem || !cubagem.trim()) return null;
  const partes = cubagem.split(/x/i).map((s) => parseFloat(s.trim().replace(',', '.')));
  if (partes.length !== 3 || partes.some((n) => isNaN(n) || n <= 0)) return null;
  const [c, l, a] = partes;
  return c * l * a * 300;
}

/** Peso a usar no cálculo de frete: cubado (se a cubagem estiver preenchida e for válida) ou o peso cadastrado. */
export function calcularPesoEfetivo(produto: Produto): number {
  return calcularPesoCubado(produto.cubagem) ?? produto.peso;
}

/**
 * As duas primeiras palavras do nome (sem a marcação de negrito/itálico, maiúsculas) — usado
 * pra decidir se a linha divisória entre produtos deve ficar espessa (produto "diferente" do
 * anterior), tanto na Tabela de Preços (PricingTable.tsx) quanto no catálogo em PDF.
 */
export function primeirasDuasPalavras(nome: string): string {
  return nome
    .replace(/[*_]/g, '')
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

/**
 * Nome "destacado" do produto — o trecho entre os primeiros *asteriscos* do
 * cadastro (mesma marcação de negrito do NomeComDestaque.tsx) — critério
 * preferido pra identificar "o mesmo produto" entre fornecedores/tratamentos
 * (busca inteligente do Planejamento de Compra, comparação de fornecedores,
 * agrupamento do gráfico de Representação por Categoria mãe): bem mais
 * preciso que primeirasDuasPalavras, que dá falso positivo/negativo
 * dependendo de como o nome foi digitado. Produto sem nenhum *destaque*
 * marcado cai pra primeirasDuasPalavras como fallback.
 */
export function chaveComparacaoNome(nome: string): string {
  const destaque = /\*(.+?)\*/.exec(nome);
  if (destaque) return destaque[1].trim().toUpperCase();
  return primeirasDuasPalavras(nome);
}

/**
 * Chave "mesmo produto entre fornecedores" pronta pra agrupar (Map/objeto) — nome destacado +
 * Classe (subcategoria). Único lugar que monta essa chave; compra.ts, compraComparacao.ts e
 * GraficoRepresentacaoModal.tsx reaproveitam em vez de remontar a mesma string cada um por conta
 * própria (o critério já mudou de ideia 2x nessa mesma sessão — ter 1 lugar só evita esquecer de
 * atualizar algum dos três da próxima vez).
 */
export function chaveComparacaoProduto(produto: { nome: string; subcategoriaId: string | null }): string {
  return `${chaveComparacaoNome(produto.nome)}::${produto.subcategoriaId ?? ''}`;
}


/**
 * Markup "por dentro": o preço é o custo dividido por (1 - soma de todos os
 * percentuais), não multiplicado — assim imposto/encargos/frete/margem são
 * garantidos sobre o PREÇO final, não sobre o custo. Portado 1:1 do
 * precificacao-inteligente.html original (função calcularCanal).
 *
 * Frete Kg/Frete NF do canal só valem no modo "Manual" (sem Transportadora
 * vinculada). Quando o canal tem `transportadoraId`, os valores usados no
 * cálculo vêm AO VIVO da Transportadora (módulo Fretes) — editar a taxa
 * dela lá atualiza automaticamente toda Tabela de Preço que a usa, sem
 * precisar reselecionar. Exceção: Custo NF fixo em R$ (ex.: Potyguar) não
 * tem como virar % dentro dessa fórmula — nesse caso o Frete NF (%) do
 * canal continua valendo (ajustável manualmente, ex. via Outros Encargos).
 *
 * Margem alvo: se o produto tem subcategoria E ela tem um valor próprio
 * pra esse canal, ele sobrepõe o da categoria pai — senão, usa o da
 * categoria (imposto nunca vem da subcategoria, só a margem).
 *
 * Sugestão de Margem por referência: se o canal tiver `margemPorReferencia` E a
 * categoria do produto tiver escolhido uma Tabela pra esse canal
 * (`categoria.referenciaCanalId[canal.id]`), o preço sugerido IGNORA margemAlvo
 * (%) e passa a mirar o mesmo Margem R$ que a Tabela referenciada calcula pra
 * esse produto — usando os encargos/frete/imposto DESTE canal pra resolver o
 * preço. A referência é escolhida POR CATEGORIA (não pra Tabela inteira): a
 * mesma Tabela pode mirar Tabelas diferentes conforme a categoria do produto.
 * `permitirReferencia` (default true) existe só pra impedir encadeamento: ao
 * resolver a meta, a chamada recursiva pra Tabela de referência sempre usa
 * `false`, ignorando a própria referência DELA (nunca uma cadeia A→B→C, só 1
 * nível).
 *
 * `resolverDescontoBi` (opcional): quando informado, é chamado pra CADA canal envolvido (o próprio
 * e, se houver, o de referência) pra tentar achar o desconto médio REAL desse produto (última
 * Safra vendida, ver historicoBi.ts) — null = sem dado do BI pra esse canal+produto, cai pro
 * `Canal.desconto` cadastrado. Callback (não um Map pronto) porque a fonte do dado (BI) mora num
 * módulo diferente (pricing/historicoBi.ts importa daqui, então essa função não pode importar de
 * lá de volta) e porque precisa resolver pra mais de 1 canal (self + referência) na mesma chamada.
 */
export function calcularCanal(
  produto: Produto,
  canal: Canal,
  categoria: Categoria,
  subcategoria: Subcategoria | undefined,
  transportadoraPorId: Map<string, Transportadora>,
  canaisPorId: Map<string, Canal>,
  permitirReferencia = true,
  resolverDescontoBi?: (canal: Canal, produto: Produto) => number | null,
): ResultadoCalculo {
  const transportadora = canal.transportadoraId ? transportadoraPorId.get(canal.transportadoraId) : undefined;
  const freteKgEfetivo = transportadora ? transportadora.valorPorKg : canal.freteKg;
  const fretePctEfetivo = transportadora && transportadora.valorPorNfTipo === 'percentual' ? transportadora.valorPorNf * 100 : canal.fretePct;

  const impostoPct = canal.tipoImposto === 'interestadual' ? categoria.interestadual : categoria.estadual;
  const margemAlvo = subcategoria?.margens[canal.id] ?? categoria.margens[canal.id] ?? 0;
  const descontoBi = resolverDescontoBi?.(canal, produto) ?? null;
  const descontoPct = descontoBi ?? canal.desconto;
  const descontoFonte: 'bi' | 'cadastro' = descontoBi !== null ? 'bi' : 'cadastro';
  const encargosPct = descontoPct + canal.comissao + canal.cartao;
  const outrosEncargos = canal.outrosEncargos || 0;
  const freteConsiderado = canal.freteIncluso !== false;

  const pesoCubadoValor = calcularPesoCubado(produto.cubagem);
  const pesoUsado = pesoCubadoValor ?? produto.peso;
  const freteKgComponente = pesoUsado * freteKgEfetivo;
  // Despesa extra não afeta mais o frete (o valor de Frete Kg muda de tabela
  // pra tabela, então uma despesa fixa "pro frete" não fazia sentido) — agora
  // entra sempre como mais Encargos. Pra frete de produtos cubados, ver `cubagem`.
  const valorDespesaExtra = produto.despesaExtraValor || 0;

  // Frete Adicional: parcela do frete já cobrada à parte do cliente — precisa
  // ser abatida do CUSTO BASE antes de calcular o preço sugerido, senão o
  // preço fica gordo demais (calculado como se a empresa cobrisse o frete
  // inteiro) e a margem sobe sozinha em vez do preço sugerido cair. Sempre
  // usa o peso CADASTRADO do produto, nunca o cubado — é uma cobrança
  // comercial ao cliente por peso real, não o peso que a transportadora usa
  // pra calcular o custo dela.
  const freteAdicionalReais = canal.freteAdicionalValor
    ? canal.freteAdicionalTipo === 'kg'
      ? produto.peso * canal.freteAdicionalValor
      : canal.freteAdicionalValor
    : 0;

  const custoBase = Math.max(0, produto.custo + freteKgComponente + outrosEncargos + valorDespesaExtra - freteAdicionalReais);
  const totalPct = impostoPct + encargosPct + fretePctEfetivo + margemAlvo;

  const referenciaCanalId = canal.margemPorReferencia ? categoria.referenciaCanalId[canal.id] : undefined;
  const canalReferencia = permitirReferencia && referenciaCanalId ? canaisPorId.get(referenciaCanalId) : undefined;
  const toleranciaPct = categoria.tolerancias[canal.id];
  // Base do alerta de tolerância: "por categoria" é a % sugerida de sempre (margemAlvo). "Por
  // referência" é diferente — a tabela "mãe" pode ter sido ajustada manualmente (preço bem
  // diferente do sugerido), e é ESSE valor real que esse canal está espelhando, não a % sugerida
  // da categoria. Por isso a tolerância aqui compara contra a margem R$ real da referência
  // (convertida pra %, pra esse mesmo produto), não margemAlvo.
  let margemAlvoTolerancia = margemAlvo;
  let precoSugerido: number;
  if (canalReferencia && canalReferencia.id !== canal.id) {
    const referencia = calcularCanal(produto, canalReferencia, categoria, subcategoria, transportadoraPorId, canaisPorId, false, resolverDescontoBi);
    // Ajuste "por dentro" (mesma convenção do resto do sistema): o % representa uma fração
    // da PRÓPRIA meta, não da margem de referência — tirando esse % da meta, volta pra
    // margem da referência. Por isso divide (não multiplica) pelo complemento do %.
    const divisorAjuste = 1 - (categoria.referenciaAjustePct[canal.id] || 0) / 100;
    const metaReais = divisorAjuste <= 0.01 ? referencia.margemReais / 0.01 : referencia.margemReais / divisorAjuste;
    const pctParaMeta = impostoPct + encargosPct + (freteConsiderado ? fretePctEfetivo : 0);
    const baseParaMeta = freteConsiderado ? custoBase : produto.custo + outrosEncargos + valorDespesaExtra;
    const divisorMeta = 1 - pctParaMeta / 100;
    precoSugerido = Math.round(divisorMeta <= 0.01 ? (metaReais + baseParaMeta) / 0.01 : (metaReais + baseParaMeta) / divisorMeta);
    margemAlvoTolerancia = referencia.margemPct;
  } else {
    const divisor = 1 - totalPct / 100;
    precoSugerido = Math.round(divisor <= 0.01 ? custoBase / 0.01 : custoBase / divisor);
  }

  const estado = produto.precos[canal.id] ?? { preco: null, manual: false };
  const preco = estado.manual && estado.preco !== null && !isNaN(estado.preco) ? estado.preco : precoSugerido;

  const freteBruto = freteKgComponente + (preco * fretePctEfetivo) / 100;
  const freteReais = Math.max(0, freteBruto - freteAdicionalReais);
  const impostoReais = (preco * (impostoPct + encargosPct)) / 100 + outrosEncargos + valorDespesaExtra;
  const margemReais = preco - produto.custo - impostoReais - (freteConsiderado ? freteReais : 0);
  const margemPct = preco > 0 ? (margemReais / preco) * 100 : 0;

  return {
    preco,
    precoSugerido,
    freteReais,
    impostoReais,
    margemReais,
    margemPct,
    margemAlvo,
    margemAlvoTolerancia,
    toleranciaPct,
    impostoPct,
    encargosPct,
    descontoPct,
    descontoFonte,
    outrosEncargos,
    freteBruto,
    freteAdicionalReais,
    despesaExtra: valorDespesaExtra,
    pesoUsado,
    pesoCubado: pesoCubadoValor !== null,
  };
}

export function margemClasse(margemPct: number, alvo: number): 'good' | 'warn' | 'bad' {
  if (margemPct < 0) return 'bad';
  if (margemPct < alvo * 0.6) return 'warn';
  return 'good';
}

/**
 * Fora da faixa [margemAlvo - toleranciaPct, margemAlvo + toleranciaPct]? — 'inferior' (abaixo,
 * risco de prejuízo) ou 'superior' (acima, fora do padrão) sobrepõem a cor normal do ML% (ver
 * margemClasse) na Tabela de Preços; null = dentro da faixa, ou sem tolerância configurada
 * (sempre o caso em canal "por referência").
 */
export function alertaTolerancia(margemPct: number, margemAlvo: number, toleranciaPct: number | undefined): 'inferior' | 'superior' | null {
  if (toleranciaPct === undefined) return null;
  if (margemPct < margemAlvo - toleranciaPct) return 'inferior';
  if (margemPct > margemAlvo + toleranciaPct) return 'superior';
  return null;
}

export function montarTituloFrete(r: ResultadoCalculo, freteIncluso: boolean): string {
  const partes: string[] = [];
  if (r.freteAdicionalReais > 0) {
    partes.push(`Valor do Frete R$ ${r.freteBruto.toFixed(2)} — Cobrado do Cliente R$ ${r.freteAdicionalReais.toFixed(2)}`);
  }
  if (r.pesoCubado) {
    partes.push(`Frete calculado com peso cubado (${r.pesoUsado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg)`);
  }
  if (!freteIncluso) {
    partes.push('Frete não considerado no cálculo da margem');
  }
  return partes.join(' — ');
}

/** Discrimina o que compõe a coluna "Encargos (R$)" — imposto + cada encargo do canal (só os que existirem). */
export function montarTituloEncargos(canal: Canal, r: ResultadoCalculo): string {
  const partes: string[] = [`Imposto ${r.impostoPct.toFixed(1)}%`];
  if (r.descontoPct) partes.push(`Desconto ${r.descontoPct.toFixed(1)}% (${r.descontoFonte === 'bi' ? 'real, última Safra' : 'cadastrado'})`);
  if (canal.comissao) partes.push(`Comissão ${canal.comissao.toFixed(1)}%`);
  if (canal.cartao) partes.push(`Cartão ${canal.cartao.toFixed(1)}%`);
  if (r.outrosEncargos) partes.push(`Outros Encargos R$ ${r.outrosEncargos.toFixed(2)}`);
  return partes.join(' + ');
}

export function gerarCorCanal(indice: number) {
  const hue = Math.round((210 + indice * 137.508) % 360);
  return {
    dark: `hsl(${hue}, 55%, 32%)`,
    mid: `hsl(${hue}, 55%, 45%)`,
    // Translúcidas (não sólidas) — assim compõem certo tanto no claro quanto
    // no escuro sem precisar de um valor por tema: sobre branco vira um tom
    // pastel, sobre navy escuro vira um tom escuro levemente colorido.
    soft: `hsla(${hue}, 65%, 55%, 0.14)`,
    subtle: `hsla(${hue}, 65%, 55%, 0.07)`,
  };
}

function indiceCategoria(categoriaId: string, categorias: Categoria[]): number {
  const idx = categorias.findIndex((c) => c.id === categoriaId);
  return idx === -1 ? categorias.length : idx;
}

/** Agrupa sempre por categoria (na ordem atual de `categorias`) e, dentro do grupo, por nome A-Z. */
export function ordenarProdutos(produtos: Produto[], categorias: Categoria[]): Produto[] {
  return [...produtos].sort((a, b) => {
    const diff = indiceCategoria(a.categoriaId, categorias) - indiceCategoria(b.categoriaId, categorias);
    if (diff !== 0) return diff;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });
}
