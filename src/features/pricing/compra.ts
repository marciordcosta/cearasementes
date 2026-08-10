import type { ItemAgg } from '@/features/bi/types';
import { qtdMensalTotalProduto } from './historicoBi';
import type { Produto } from './types';

export interface ItemNecessidadeCompra {
  produto: Produto;
  /** Soma da média mensal (últimas safras, todas as Tabelas) dos meses escolhidos. */
  qtdProjetada: number;
  estoqueAtual: number;
  /** max(0, qtdProjetada - estoqueAtual). */
  qtdComprar: number;
  pesoUnitario: number;
  pesoTotal: number;
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
      return { produto, qtdProjetada, estoqueAtual, qtdComprar, pesoUnitario: produto.peso, pesoTotal: qtdComprar * produto.peso };
    })
    .filter((item) => item.qtdProjetada > 0)
    .sort((a, b) => b.pesoTotal - a.pesoTotal);
}

export interface ItemCaminhao {
  produto: Produto;
  qtd: number;
  peso: number;
}

export interface CaminhaoPedido {
  numero: number;
  itens: ItemCaminhao[];
  pesoTotal: number;
}

/**
 * Divide a necessidade de compra (qtdComprar de cada item) em caminhões de
 * até `capacidadeKg` cada — cada caminhão leva uma fatia proporcional (mesma
 * mistura do que ainda falta), até cobrir tudo. O último carrega só o que
 * sobrar (o "complemento"), podendo vir com menos que a capacidade cheia.
 */
export function dividirEmCaminhoes(itens: ItemNecessidadeCompra[], capacidadeKg: number): CaminhaoPedido[] {
  const pesoTotalGeral = itens.reduce((soma, i) => soma + i.pesoTotal, 0);
  if (pesoTotalGeral <= 0 || capacidadeKg <= 0) return [];

  const restanteQtd = itens.map((i) => i.qtdComprar);
  let pesoRestanteGeral = pesoTotalGeral;
  const caminhoes: CaminhaoPedido[] = [];
  let numero = 0;

  while (pesoRestanteGeral > 0.01 && numero < 50) {
    numero += 1;
    const pesoNesseCaminhao = Math.min(capacidadeKg, pesoRestanteGeral);
    const ultimoCaminhao = pesoNesseCaminhao >= pesoRestanteGeral - 0.01;
    const fracao = pesoNesseCaminhao / pesoRestanteGeral;
    const itensCaminhao: ItemCaminhao[] = [];

    itens.forEach((item, idx) => {
      if (restanteQtd[idx] <= 0) return;
      const qtd = ultimoCaminhao ? restanteQtd[idx] : Math.round(restanteQtd[idx] * fracao);
      if (qtd <= 0) return;
      restanteQtd[idx] -= qtd;
      itensCaminhao.push({ produto: item.produto, qtd, peso: qtd * item.pesoUnitario });
    });

    const pesoTotal = itensCaminhao.reduce((soma, i) => soma + i.peso, 0);
    caminhoes.push({ numero, itens: itensCaminhao, pesoTotal });
    pesoRestanteGeral -= pesoTotal;
  }

  return caminhoes;
}

/**
 * Depois de editar manualmente a quantidade de um item (idxEditado) num
 * caminhão, garante que o peso total não ultrapasse `capacidadeKg` — tira
 * (nunca aumenta) dos últimos itens da lista, os menos relevantes já que
 * `itens` vem ordenado por peso decrescente, até caber.
 */
export function reequilibrarCaminhao(itens: ItemCaminhao[], idxEditado: number, capacidadeKg: number): ItemCaminhao[] {
  const novosItens = itens.map((it) => ({ ...it }));
  let pesoTotal = novosItens.reduce((soma, it) => soma + it.qtd * it.produto.peso, 0);
  let j = novosItens.length - 1;

  while (pesoTotal > capacidadeKg + 0.001 && j >= 0) {
    if (j === idxEditado) {
      j -= 1;
      continue;
    }
    const pesoUnit = novosItens[j].produto.peso;
    const excedenteKg = pesoTotal - capacidadeKg;
    const reduzir = Math.min(novosItens[j].qtd, Math.ceil(excedenteKg / pesoUnit));
    novosItens[j].qtd -= reduzir;
    pesoTotal -= reduzir * pesoUnit;
    if (novosItens[j].qtd <= 0) j -= 1;
  }

  novosItens.forEach((it) => {
    it.peso = it.qtd * it.produto.peso;
  });
  return novosItens;
}
