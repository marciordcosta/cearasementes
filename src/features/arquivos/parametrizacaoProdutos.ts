import { paraNumero } from './metricas';
import type { ProdutoParametrizacao } from './types';

/**
 * Compara nomes de produto ignorando acento, caixa e espaçamento — usado em
 * toda a cadeia laudo/Parametrização/Tabela de Preço, pra não duplicar essa
 * normalização em cada arquivo. Colapsa qualquer sequência de espaços (duplo
 * espaço, espaço não separável etc. — comuns em nome digitado à mão em
 * épocas diferentes) numa só, senão dois nomes visualmente idênticos
 * escapavam da comparação por essa única diferença invisível.
 */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Reduz um nome de produto ao "grupo" que importa pra Parametrização — 1ª e
 * 3ª palavra (geralmente Gênero + Tratamento, pulando a variedade/cultivar
 * específica no meio): "Panicum Mombaça Incrustado" -> "Panicum Incrustado",
 * "Brachiaria Decumbens Incrustado" -> "Brachiaria Incrustado", "Milho
 * Hibrido BRS2022" -> "Milho BRS2022". Nome com menos de 3 palavras não tem
 * o que reduzir (ex.: "Panicum Tradicional" fica igual). Um cadastro só de
 * grupo em Parametrização passa a valer pra qualquer produto — do laudo ou
 * da Tabela de Preço — que reduza pro mesmo grupo, sem precisar cadastrar
 * cada variedade separadamente.
 */
export function grupoDoNome(nome: string): string {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (palavras.length >= 3) return `${palavras[0]} ${palavras[2]}`;
  return palavras.join(' ');
}

function encontrarProduto(nomeProduto: string, produtos: ProdutoParametrizacao[]): ProdutoParametrizacao | null {
  const alvo = normalizarNome(grupoDoNome(nomeProduto));
  return produtos.find((p) => normalizarNome(grupoDoNome(p.nomeProduto)) === alvo) ?? null;
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

/** Modo de plantio padrão do produto (Cova ou Lanço) — só pré-seleciona o modo ao adicionar no Guia de Plantio, nunca entra em cálculo. Null = sem preferência cadastrada. */
export function resolverModoPlantio(nomeProduto: string, produtos: ProdutoParametrizacao[]): 'cova' | 'lanco' | null {
  return encontrarProduto(nomeProduto, produtos)?.modoPlantio ?? null;
}

/** Margem de tolerância (%) do produto pra arredondar sacos — 25% se não cadastrado (ver arredondarSacos em GuiaPlantioModal.tsx). */
export function resolverMargemTolerancia(nomeProduto: string, produtos: ProdutoParametrizacao[]): number {
  const percentual = paraNumero(encontrarProduto(nomeProduto, produtos)?.margemTolerancia ?? null);
  return percentual ?? 25;
}
