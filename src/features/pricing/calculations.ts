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
 * Chave "mesmo produto entre fornecedores/telas" pronta pra agrupar (Map/objeto) — prioriza SÓ
 * Cultivar (campo próprio, ver Produto.cultivar) quando o produto tem Cultivar cadastrado: mais
 * confiável que reconhecer por texto, já que não depende do nome ter sido digitado igual nem do
 * destaque em negrito ter sido marcado certo — mesma fonte de dados usada pro casamento
 * laudo↔produto no Catálogo Online e na Parametrização (ver calculoSemeadura.ts/
 * parametrizacaoProdutos.ts), "amarrando" os vários lugares do sistema que precisam achar "o mesmo
 * produto" na mesma informação. DE PROPÓSITO sem Categoria nem Subcategoria/Classe em jogo — no
 * catálogo, Tradicional/Incrustado do mesmo Cultivar continuam o MESMO produto agrupado, mesmo
 * cadastrados em Classes diferentes (bug real, corrigido: "Brach Decumbens Incrustado" x "Brach
 * Decumbens Tradicional" com Classe diferente cadastrada ficavam separados). Produto sem Cultivar
 * cadastrado (ainda não migrado) cai no critério antigo — só nome destacado (ou 2ª palavra), também
 * sem exigir a mesma Subcategoria (ver chaveComparacaoNome). Único lugar que monta essa chave;
 * compra.ts, compraComparacao.ts, PricingTable.tsx, catalogoPdf.ts e GraficoRepresentacaoModal.tsx
 * reaproveitam em vez de remontar a mesma string cada um por conta própria.
 */
export function chaveComparacaoProduto(produto: { nome: string; cultivar: string | null }): string {
  if (produto.cultivar) return `cultivar:${produto.cultivar.trim().toUpperCase()}`;
  return chaveComparacaoNome(produto.nome);
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
/**
 * Frete Kg/% "de verdade" pra esse canal — da Transportadora vinculada (módulo Fretes, ao vivo) ou
 * do valor manual do próprio canal, sem Transportadora. `freteMinimo` só existe quando há
 * Transportadora vinculada (é cadastro dela, não do canal) — usado hoje só no Catálogo Online
 * (Orçamento, ver publicarCatalogoOnline em pricing/api.ts), NÃO entra no cálculo interno de preço
 * (calcularCanal nunca aplicou piso de frete, e isso não muda aqui).
 */
export function resolverFreteEfetivo(canal: Canal, transportadoraPorId: Map<string, Transportadora>): { freteKgEfetivo: number; fretePctEfetivo: number; freteMinimo: number } {
  const transportadora = canal.transportadoraId ? transportadoraPorId.get(canal.transportadoraId) : undefined;
  return {
    freteKgEfetivo: transportadora ? transportadora.valorPorKg : canal.freteKg,
    fretePctEfetivo: transportadora && transportadora.valorPorNfTipo === 'percentual' ? transportadora.valorPorNf * 100 : canal.fretePct,
    freteMinimo: transportadora?.freteMinimo ?? 0,
  };
}

/**
 * Frete que o CLIENTE paga no Catálogo Online — diferente de resolverFreteEfetivo (esse é o CUSTO
 * real pra empresa, usado no cálculo interno de preço/margem): por padrão usa o "Frete cobrado do
 * cliente" configurado no canal (Fixo ou R$/Kg, ver Canal.freteAdicionalTipo/freteAdicionalValor),
 * não o valor ao vivo da Transportadora. O piso mínimo (freteMinimo) sempre vem da Transportadora
 * vinculada, os 2 modos — é um limite comercial, não uma cobrança calculada. Modo "Transportadora" é
 * a exceção: nesse caso passa direto o valor/percentual dela ao vivo, igual sempre foi (sem override
 * manual nenhum) — as tabelas nesse modo cobram do cliente exatamente o frete real da Transportadora.
 */
export function resolverFreteCatalogo(
  canal: Canal,
  transportadoraPorId: Map<string, Transportadora>,
): { freteKgEfetivo: number; fretePctEfetivo: number; freteFixo: number; freteMinimo: number } {
  const transportadora = canal.transportadoraId ? transportadoraPorId.get(canal.transportadoraId) : undefined;
  const freteMinimo = transportadora?.freteMinimo ?? 0;
  if (canal.freteAdicionalTipo === 'transportadora') {
    return {
      freteKgEfetivo: transportadora ? transportadora.valorPorKg : canal.freteKg,
      fretePctEfetivo: transportadora && transportadora.valorPorNfTipo === 'percentual' ? transportadora.valorPorNf * 100 : canal.fretePct,
      freteFixo: 0,
      freteMinimo,
    };
  }
  return {
    freteKgEfetivo: canal.freteAdicionalTipo === 'kg' ? canal.freteAdicionalValor : 0,
    fretePctEfetivo: 0,
    freteFixo: canal.freteAdicionalTipo === 'fixo' ? canal.freteAdicionalValor : 0,
    freteMinimo,
  };
}

/**
 * Simulação de parcelas do Boleto no Catálogo Online — total de produtos (sem frete, o desconto/
 * parcelamento nunca mexe no frete) dividido pelo valor mínimo por boleto, arredondado pra baixo
 * (cada parcela nunca fica menor que o mínimo) e travado em parcelasMax: passando do limite, mantém
 * a qtd máxima e cada parcela fica maior que o mínimo (total ÷ parcelasMax). Mínimo de 1 parcela
 * sempre que houver total a cobrar, mesmo abaixo do valor mínimo configurado.
 */
export function calcularParcelasBoleto(totalProdutos: number, valorMinimo: number, parcelasMax: number): { parcelas: number; valorParcela: number } {
  if (totalProdutos <= 0) return { parcelas: 1, valorParcela: 0 };
  const limite = Math.max(1, Math.floor(parcelasMax) || 1);
  const parcelasCalc = valorMinimo > 0 ? Math.floor(totalProdutos / valorMinimo) : 1;
  const parcelas = Math.min(Math.max(1, parcelasCalc), limite);
  return { parcelas, valorParcela: totalProdutos / parcelas };
}

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
  const { freteKgEfetivo, fretePctEfetivo } = resolverFreteEfetivo(canal, transportadoraPorId);

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
  // pra calcular o custo dela. Modo "Transportadora" (ver FreteAdicionalTipo) é a exceção: em vez de
  // um valor digitado à mão, passa o frete REAL (ao vivo, já calculado acima em freteKgComponente)
  // inteiro pro cliente — a tabela nesse modo não embute frete nenhum na margem, cobra exatamente o
  // que a Transportadora cobra.
  const freteAdicionalReais =
    canal.freteAdicionalTipo === 'transportadora'
      ? freteKgComponente
      : canal.freteAdicionalValor
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

/**
 * Status de publicação pendente de UM produto num canal — mesma regra usada pra elegibilidade em
 * "Publicar" (Imprimir + "precisa ajuste" + Fornecedor visível no PDF), comparando o preço calculado
 * AGORA com o que já está publicado (ver fetchPrecosCatalogoPublicoPorCanal em pricing/api.ts).
 * Reaproveitado tanto na grade principal (vários canais, ver PricingPage.tsx) quanto na tela cheia
 * por canal (ver ChannelFullscreenModal.tsx) — o botão "🌐 Publicar N pendentes" nos dois lugares usa
 * isso pra saber o que mudou. `null` = nada pendente (já publicado igual, ou nunca elegível mesmo).
 * Tolerância de 1 centavo na comparação de preço, pra não acusar diferença por arredondamento.
 */
export function statusPublicacaoPendente(
  produto: Produto,
  canal: Canal,
  precoPublicado: number | undefined,
  categoria: Categoria,
  subcategoria: Subcategoria | undefined,
  transportadoraPorId: Map<string, Transportadora>,
  canaisPorId: Map<string, Canal>,
  resolverDescontoBi: ((canal: Canal, produto: Produto) => number | null) | undefined,
  fornecedorVisivelPdf: boolean,
): 'novo' | 'preco' | 'remover' | null {
  const elegivel = produto.imprimir && !!produto.codigo && !(produto.precos[canal.id]?.precisaAjuste ?? false) && fornecedorVisivelPdf;
  if (!elegivel) return precoPublicado !== undefined ? 'remover' : null;
  if (precoPublicado === undefined) return 'novo';
  const precoAtual = calcularCanal(produto, canal, categoria, subcategoria, transportadoraPorId, canaisPorId, true, resolverDescontoBi).preco;
  return Math.abs(precoAtual - precoPublicado) > 0.005 ? 'preco' : null;
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
