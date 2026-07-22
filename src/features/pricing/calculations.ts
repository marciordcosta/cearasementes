import type { Canal, Categoria, Produto, ResultadoCalculo } from './types';

/**
 * Markup "por dentro": o preço é o custo dividido por (1 - soma de todos os
 * percentuais), não multiplicado — assim imposto/encargos/frete/margem são
 * garantidos sobre o PREÇO final, não sobre o custo. Portado 1:1 do
 * precificacao-inteligente.html original (função calcularCanal).
 */
export function calcularCanal(produto: Produto, canal: Canal, categoria: Categoria): ResultadoCalculo {
  const impostoPct = canal.tipoImposto === 'interestadual' ? categoria.interestadual : categoria.estadual;
  const margemAlvo = categoria.margens[canal.id] ?? 0;
  const encargosPct = canal.desconto + canal.comissao + canal.cartao;
  const outrosEncargos = canal.outrosEncargos || 0;

  const freteKgComponente = produto.peso * canal.freteKg;
  const valorDespesaExtra = produto.despesaExtraValor || 0;
  const despesaParaFrete = produto.despesaExtraDestino === 'frete' ? valorDespesaExtra : 0;
  const despesaParaImposto = produto.despesaExtraDestino === 'impostos' ? valorDespesaExtra : 0;

  // Frete Adicional: parcela do frete já cobrada à parte do cliente — precisa
  // ser abatida do CUSTO BASE antes de calcular o preço sugerido, senão o
  // preço fica gordo demais (calculado como se a empresa cobrisse o frete
  // inteiro) e a margem sobe sozinha em vez do preço sugerido cair.
  const freteAdicionalReais = canal.freteAdicionalValor
    ? canal.freteAdicionalTipo === 'kg'
      ? produto.peso * canal.freteAdicionalValor
      : canal.freteAdicionalValor
    : 0;

  const custoBase = Math.max(0, produto.custo + freteKgComponente + outrosEncargos + valorDespesaExtra - freteAdicionalReais);
  const totalPct = impostoPct + encargosPct + canal.fretePct + margemAlvo;

  const estado = produto.precos[canal.id] ?? { preco: null, manual: false };
  let preco: number;
  if (estado.manual && estado.preco !== null && !isNaN(estado.preco)) {
    preco = estado.preco;
  } else {
    const divisor = 1 - totalPct / 100;
    preco = divisor <= 0.01 ? custoBase / 0.01 : custoBase / divisor;
    preco = Math.round(preco);
  }

  const freteBruto = freteKgComponente + (preco * canal.fretePct) / 100 + despesaParaFrete;
  const freteReais = Math.max(0, freteBruto - freteAdicionalReais);
  const impostoReais = (preco * (impostoPct + encargosPct)) / 100 + outrosEncargos + despesaParaImposto;
  const freteConsiderado = canal.freteIncluso !== false;
  const margemReais = preco - produto.custo - impostoReais - (freteConsiderado ? freteReais : 0);
  const margemPct = preco > 0 ? (margemReais / preco) * 100 : 0;

  return {
    preco,
    freteReais,
    impostoReais,
    margemReais,
    margemPct,
    margemAlvo,
    impostoPct,
    encargosPct,
    outrosEncargos,
    freteBruto,
    freteAdicionalReais,
    despesaParaFrete,
    despesaParaImposto,
  };
}

export function margemClasse(margemPct: number, alvo: number): 'good' | 'warn' | 'bad' {
  if (margemPct < 0) return 'bad';
  if (margemPct < alvo * 0.6) return 'warn';
  return 'good';
}

export function montarTituloFrete(r: ResultadoCalculo, freteIncluso: boolean): string {
  const partes: string[] = [];
  if (r.freteAdicionalReais > 0) {
    partes.push(`Valor do Frete R$ ${r.freteBruto.toFixed(2)} — Cobrado do Cliente R$ ${r.freteAdicionalReais.toFixed(2)}`);
  }
  if (r.despesaParaFrete > 0) {
    partes.push(`Produto contém despesa extra de R$ ${r.despesaParaFrete.toFixed(2)}`);
  }
  if (!freteIncluso) {
    partes.push('Frete não considerado no cálculo da margem');
  }
  return partes.join(' — ');
}

export function gerarCorCanal(indice: number) {
  const hue = Math.round((210 + indice * 137.508) % 360);
  return {
    dark: `hsl(${hue}, 55%, 32%)`,
    mid: `hsl(${hue}, 55%, 45%)`,
    soft: `hsl(${hue}, 60%, 94%)`,
    subtle: `hsl(${hue}, 40%, 97%)`,
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
