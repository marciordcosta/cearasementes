import type { Transportadora } from '@/features/fretes/types';
import type { Canal, Categoria, Produto, ResultadoCalculo } from './types';

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
 */
export function calcularCanal(produto: Produto, canal: Canal, categoria: Categoria, transportadoraPorId: Map<string, Transportadora>): ResultadoCalculo {
  const transportadora = canal.transportadoraId ? transportadoraPorId.get(canal.transportadoraId) : undefined;
  const freteKgEfetivo = transportadora ? transportadora.valorPorKg : canal.freteKg;
  const fretePctEfetivo = transportadora && transportadora.valorPorNfTipo === 'percentual' ? transportadora.valorPorNf * 100 : canal.fretePct;

  const impostoPct = canal.tipoImposto === 'interestadual' ? categoria.interestadual : categoria.estadual;
  const margemAlvo = categoria.margens[canal.id] ?? 0;
  const encargosPct = canal.desconto + canal.comissao + canal.cartao;
  const outrosEncargos = canal.outrosEncargos || 0;

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

  const estado = produto.precos[canal.id] ?? { preco: null, manual: false };
  let preco: number;
  if (estado.manual && estado.preco !== null && !isNaN(estado.preco)) {
    preco = estado.preco;
  } else {
    const divisor = 1 - totalPct / 100;
    preco = divisor <= 0.01 ? custoBase / 0.01 : custoBase / divisor;
    preco = Math.round(preco);
  }

  const freteBruto = freteKgComponente + (preco * fretePctEfetivo) / 100;
  const freteReais = Math.max(0, freteBruto - freteAdicionalReais);
  const impostoReais = (preco * (impostoPct + encargosPct)) / 100 + outrosEncargos + valorDespesaExtra;
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
