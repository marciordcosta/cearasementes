import { chaveComparacaoNome } from './calculations';
import type { Fornecedor, Produto } from './types';

export interface ItemComparacaoFornecedor {
  fornecedorNome: string;
  produtoNome: string;
  /** R$/Kg — a comparação justa entre fornecedores, mesmo quando o peso do saco difere. */
  valorKg: number;
  /** Custo do saco fechado (R$) — informativo, junto do R$/Kg (peso do saco pode diferir entre fornecedores). */
  valorSaco: number;
}

export interface GrupoComparacaoFornecedores {
  /** Nome do primeiro produto do grupo (sem marcação), só pra ordenar/exibir — cada item da lista mantém o próprio nome. */
  nomeGrupo: string;
  /** Do fornecedor mais barato pro mais caro (R$/Kg). */
  itens: ItemComparacaoFornecedor[];
}

/**
 * Agrupa produtos de fornecedores DIFERENTES com o mesmo nome "destacado" no cadastro e mesma
 * Classe (subcategoria) — mesmo critério da busca inteligente do Planejamento de Compra (ver
 * chaveComparacaoNome em calculations.ts e compra.ts) — só que aqui pra comparar preço (R$/Kg),
 * não demanda. Só entram grupos com mais de 1 fornecedor (senão não tem o que comparar);
 * ordenados alfabeticamente pelo nome, cada um com os fornecedores do mais barato pro mais caro.
 */
export function calcularComparacaoFornecedores(produtos: Produto[], fornecedores: Fornecedor[]): GrupoComparacaoFornecedores[] {
  const fornecedorPorId = new Map(fornecedores.map((f) => [f.id, f]));
  const grupos = new Map<string, { nomeGrupo: string; itens: ItemComparacaoFornecedor[] }>();

  for (const produto of produtos) {
    if (!produto.fornecedorId) continue;
    const fornecedor = fornecedorPorId.get(produto.fornecedorId);
    if (!fornecedor) continue;
    const nomeLimpo = produto.nome.replace(/[*_]/g, '');
    const chave = `${chaveComparacaoNome(produto.nome)}::${produto.subcategoriaId ?? ''}`;
    const grupo = grupos.get(chave) ?? { nomeGrupo: nomeLimpo, itens: [] };
    grupo.itens.push({ fornecedorNome: fornecedor.nome, produtoNome: nomeLimpo, valorKg: produto.valorKg, valorSaco: produto.custo });
    grupos.set(chave, grupo);
  }

  return Array.from(grupos.values())
    .filter((g) => new Set(g.itens.map((i) => i.fornecedorNome)).size > 1)
    .map((g) => ({ nomeGrupo: g.nomeGrupo, itens: [...g.itens].sort((a, b) => a.valorKg - b.valorKg) }))
    .sort((a, b) => a.nomeGrupo.localeCompare(b.nomeGrupo, 'pt-BR'));
}
