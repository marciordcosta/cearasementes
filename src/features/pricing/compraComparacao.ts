import { chaveComparacaoProduto } from './calculations';
import type { Fornecedor, Produto } from './types';

export interface ItemComparacaoFornecedor {
  fornecedorNome: string;
  /** Nome cru, com a marcação de negrito/itálico do cadastro (asterisco/underscore) — pra imprimir com o mesmo destaque da grade. */
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
 * Agrupa produtos de fornecedores DIFERENTES com o mesmo Cultivar (ou nome "destacado", ver
 * chaveComparacaoProduto em calculations.ts) E o mesmo Processo (Subcategoria) — diferente das
 * outras telas que reaproveitam essa mesma chave (Tabela de Preços, Representação), que agrupam só
 * por Cultivar, sem olhar Processo. Aqui precisa dos dois: é uma comparação de COMPRA entre
 * fornecedores do MESMO produto (Incrustado com Incrustado, Tradicional com Tradicional...) — do
 * jeito que a Tabela de Preços agrupa, Incrustado e Tradicional do mesmo Cultivar cairiam juntos,
 * mas são produtos/preços bem diferentes pra decidir de quem comprar. Só entram grupos com mais de
 * 1 fornecedor (senão não tem o que comparar); ordenados alfabeticamente pelo nome, cada um com os
 * fornecedores do mais barato pro mais caro.
 */
export function calcularComparacaoFornecedores(produtos: Produto[], fornecedores: Fornecedor[]): GrupoComparacaoFornecedores[] {
  const fornecedorPorId = new Map(fornecedores.map((f) => [f.id, f]));
  const grupos = new Map<string, { nomeGrupo: string; itens: ItemComparacaoFornecedor[] }>();

  for (const produto of produtos) {
    if (!produto.fornecedorId) continue;
    const fornecedor = fornecedorPorId.get(produto.fornecedorId);
    if (!fornecedor) continue;
    const nomeLimpo = produto.nome.replace(/[*_]/g, '');
    const chave = `${chaveComparacaoProduto(produto)}::${produto.subcategoriaId ?? ''}`;
    const grupo = grupos.get(chave) ?? { nomeGrupo: nomeLimpo, itens: [] };
    grupo.itens.push({ fornecedorNome: fornecedor.nome, produtoNome: produto.nome, valorKg: produto.valorKg, valorSaco: produto.custo });
    grupos.set(chave, grupo);
  }

  return Array.from(grupos.values())
    .filter((g) => new Set(g.itens.map((i) => i.fornecedorNome)).size > 1)
    .map((g) => ({ nomeGrupo: g.nomeGrupo, itens: [...g.itens].sort((a, b) => a.valorKg - b.valorKg) }))
    .sort((a, b) => a.nomeGrupo.localeCompare(b.nomeGrupo, 'pt-BR'));
}
