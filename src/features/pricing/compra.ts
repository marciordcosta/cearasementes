import type { ItemAgg } from '@/features/bi/types';
import { qtdMensalTotalProduto } from './historicoBi';
import type { Produto } from './types';

export interface ItemNecessidadeCompra {
  produto: Produto;
  /** Soma da média mensal (últimas safras, todas as Tabelas) dos meses escolhidos. */
  qtdProjetada: number;
  estoqueAtual: number;
  /** max(0, qtdProjetada - estoqueAtual) — sugestão inicial da coluna Pedido, sempre saco cheio. */
  qtdComprar: number;
  pesoUnitario: number;
  /** Média mensal (mesmo critério de qtdProjetada) por mês da safra, índice 0 = 1º mês — pro tooltip de detalhe. */
  porMes: number[];
}

/**
 * Necessidade de compra de um Fornecedor pros meses escolhidos — pra cada
 * produto dele (com Código cadastrado), projeta a quantidade média
 * (últimas safras, somando todas as Tabelas) nesses meses e desconta o
 * estoque atual informado. `mesesSelecionados` usa os mesmos índices de
 * mesesSafraPadrao() (0 = 1º mês da safra, ex. Agosto).
 */
export function calcularNecessidadeCompra(
  produtosFornecedor: Produto[],
  items: ItemAgg[],
  mesesSelecionados: number[],
  estoquePorProduto: Record<string, number>,
): ItemNecessidadeCompra[] {
  return produtosFornecedor
    .filter((p) => p.codigo)
    .map((produto) => {
      const porMes = qtdMensalTotalProduto(items, produto.codigo!);
      const qtdProjetada = mesesSelecionados.reduce((soma, i) => soma + (porMes[i] ?? 0), 0);
      const estoqueAtual = estoquePorProduto[produto.id] ?? 0;
      // Sempre saco cheio — arredonda pra cima o que falta, nunca fração de unidade.
      const qtdComprar = Math.ceil(Math.max(0, qtdProjetada - estoqueAtual));
      return { produto, qtdProjetada, estoqueAtual, qtdComprar, pesoUnitario: produto.peso, porMes };
    })
    .filter((item) => item.qtdProjetada > 0)
    .sort((a, b) => b.qtdComprar * b.pesoUnitario - a.qtdComprar * a.pesoUnitario);
}
