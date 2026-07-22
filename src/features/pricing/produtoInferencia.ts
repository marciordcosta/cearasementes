/**
 * Peso e categoria não vêm no Relatório 333 — mas o nome do produto quase
 * sempre carrega essa informação (ex.: "PANICUM TANZANIA INCRUSTADO 10KG").
 * Usado só na CRIAÇÃO de produto novo; produto já cadastrado nunca tem
 * peso/categoria tocados por uma reimportação (só o custo é atualizado).
 */

/** Extrai o peso do nome do produto, em Kg. Prioriza "10KG" sobre "500G"; ignora unidades que não são peso (ex.: "500M" de arame). */
export function inferirPesoDoNome(nome: string): number {
  const kg = nome.match(/(\d+(?:[.,]\d+)?)\s*KG\b/i);
  if (kg) return parseFloat(kg[1].replace(',', '.'));
  const g = nome.match(/(\d+(?:[.,]\d+)?)\s*G\b/i);
  if (g) return parseFloat(g[1].replace(',', '.')) / 1000;
  return 0;
}

const REGRAS_CATEGORIA_POR_NOME: { regex: RegExp; nomeCategoria: string }[] = [
  { regex: /PANICUM|BRACHIARIA|CAPIM/i, nomeCategoria: 'Capim' },
  { regex: /MILHO/i, nomeCategoria: 'Milho' },
  { regex: /SORGO/i, nomeCategoria: 'Sorgo' },
];

/** Nome da categoria (não o id) inferido pelo nome do produto, ou null se nenhuma regra bater. */
export function inferirNomeCategoriaDoNome(nome: string): string | null {
  const regra = REGRAS_CATEGORIA_POR_NOME.find((r) => r.regex.test(nome));
  return regra ? regra.nomeCategoria : null;
}
