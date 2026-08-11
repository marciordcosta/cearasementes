import type { ItemAgg } from '@/features/bi/types';
import { primeirasDuasPalavras } from './calculations';
import { qtdMensalTotalProduto } from './historicoBi';
import type { Fornecedor, Produto } from './types';

export interface FornecedorMensal {
  fornecedorNome: string;
  /** Mesmo índice de porMes — média mensal (últimas safras) só das vendas desse fornecedor. */
  porMes: number[];
}

export interface ItemNecessidadeCompra {
  produto: Produto;
  /** Soma da média mensal (últimas safras, todas as Tabelas, todos os fornecedores do grupo) dos meses escolhidos. */
  qtdProjetada: number;
  estoqueAtual: number;
  /** max(0, qtdProjetada - estoqueAtual) — sugestão inicial da coluna Pedido, sempre saco cheio. */
  qtdComprar: number;
  pesoUnitario: number;
  /** Média mensal (mesmo critério de qtdProjetada) por mês da safra, já somando todo o grupo — pro tooltip de detalhe. */
  porMes: number[];
  /** Mesmo total de porMes, mas quebrado por fornecedor (o próprio primeiro, depois os "outros" achados pela busca). */
  porFornecedor: FornecedorMensal[];
}

/**
 * Necessidade de compra de um Fornecedor pros meses escolhidos — pra cada
 * produto dele (com Código cadastrado), projeta a quantidade média
 * (últimas safras, somando todas as Tabelas) nesses meses. Além da venda do
 * próprio produto, busca em OUTROS fornecedores produtos com o mesmo "nome
 * base" (2 primeiras palavras — mesmo critério da divisória na Tabela de
 * Preços) E a mesma Classe (subcategoriaId, campo "Classe" do Editar
 * Produto) e soma a venda deles também, já que costuma ser a mesma semente
 * vendida por fornecedor diferente. A Classe entra no critério porque "nome
 * base" sozinho não separa tratamento (ex.: Panicum Mombaça tem
 * Incrustado/Integra/Nutre — mesma Classe "Incrustada" entre si — e
 * Tradicional, Classe diferente); Classe diferente indica categoria
 * diferente, não entra na soma. Desconta o estoque atual informado.
 * `mesesSelecionados` usa os mesmos índices de mesesSafraPadrao() (0 = 1º
 * mês da safra, ex. Agosto).
 */
export function calcularNecessidadeCompra(
  produtosFornecedor: Produto[],
  todosProdutos: Produto[],
  fornecedores: Fornecedor[],
  items: ItemAgg[],
  mesesSelecionados: number[],
  estoquePorProduto: Record<string, number>,
): ItemNecessidadeCompra[] {
  const fornecedorPorId = new Map(fornecedores.map((f) => [f.id, f]));
  const nomeFornecedor = (id: string | null) => fornecedorPorId.get(id ?? '')?.nome ?? 'Sem fornecedor';

  return produtosFornecedor
    .filter((p) => p.codigo)
    .map((produto) => {
      const grupoNome = primeirasDuasPalavras(produto.nome);
      const outrosDoGrupo = todosProdutos.filter(
        (p) =>
          p.id !== produto.id &&
          p.codigo &&
          p.fornecedorId !== produto.fornecedorId &&
          primeirasDuasPalavras(p.nome) === grupoNome &&
          p.subcategoriaId === produto.subcategoriaId,
      );

      const porFornecedor: FornecedorMensal[] = [
        { fornecedorNome: nomeFornecedor(produto.fornecedorId), porMes: qtdMensalTotalProduto(items, produto.codigo!) },
        ...outrosDoGrupo.map((p) => ({ fornecedorNome: nomeFornecedor(p.fornecedorId), porMes: qtdMensalTotalProduto(items, p.codigo!) })),
      ];

      const porMes = Array.from({ length: 12 }, (_, i) => porFornecedor.reduce((soma, f) => soma + (f.porMes[i] ?? 0), 0));
      const qtdProjetada = mesesSelecionados.reduce((soma, i) => soma + (porMes[i] ?? 0), 0);
      const estoqueAtual = estoquePorProduto[produto.id] ?? 0;
      // Sempre saco cheio — arredonda pra cima o que falta, nunca fração de unidade.
      const qtdComprar = Math.ceil(Math.max(0, qtdProjetada - estoqueAtual));
      return { produto, qtdProjetada, estoqueAtual, qtdComprar, pesoUnitario: produto.peso, porMes, porFornecedor };
    })
    .filter((item) => item.qtdProjetada > 0)
    .sort((a, b) => b.qtdComprar * b.pesoUnitario - a.qtdComprar * a.pesoUnitario);
}
