import { paraNumero } from './metricas';
import type { ProdutoParametrizacao } from './types';

function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function encontrarProduto(nomeProduto: string, produtos: ProdutoParametrizacao[]): ProdutoParametrizacao | null {
  const alvo = normalizarNome(nomeProduto);
  return produtos.find((p) => normalizarNome(p.nomeProduto) === alvo) ?? null;
}

/** PMS base do produto, como texto cru (pra exibir na grade exatamente como foi cadastrado) — null se não houver cadastro pra esse produto. */
export function resolverPmsBaseTexto(nomeProduto: string, produtos: ProdutoParametrizacao[]): string | null {
  return encontrarProduto(nomeProduto, produtos)?.pmsBase ?? null;
}

/** PMS base do produto, já convertido pra número (pra entrar na conta de kg/ha). */
export function resolverPmsBase(nomeProduto: string, produtos: ProdutoParametrizacao[]): number | null {
  return paraNumero(resolverPmsBaseTexto(nomeProduto, produtos));
}

/** Densidade base do produto, como texto cru — não é editável por lote, então isso é sempre o que a grade mostra. */
export function resolverDensidadeBaseTexto(nomeProduto: string, produtos: ProdutoParametrizacao[]): string | null {
  return encontrarProduto(nomeProduto, produtos)?.densidadeBase ?? null;
}

/** Densidade base do produto, já convertida pra número (pra entrar na conta de kg/ha). */
export function resolverDensidadeBase(nomeProduto: string, produtos: ProdutoParametrizacao[]): number | null {
  return paraNumero(resolverDensidadeBaseTexto(nomeProduto, produtos));
}

/** Índice de Sobrevivência do produto, como fração (0 a 1) — ex.: cadastro "35" (%) vira 0.35. Null se não cadastrado. */
export function resolverIndiceSobrevivencia(nomeProduto: string, produtos: ProdutoParametrizacao[]): number | null {
  const percentual = paraNumero(encontrarProduto(nomeProduto, produtos)?.indiceSobrevivencia ?? null);
  return percentual === null ? null : percentual / 100;
}
