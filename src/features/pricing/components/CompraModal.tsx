import { GitCompare, Printer, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { ItemAgg } from '@/features/bi/types';
import { fmtInt } from '@/lib/format';
import { calcularNecessidadeCompra, type FornecedorMensal, type ItemNecessidadeCompra } from '../compra';
import { gerarComparacaoFornecedoresPdf } from '../comparacaoFornecedoresPdf';
import { calcularComparacaoFornecedores } from '../compraComparacao';
import { gerarPedidoCompraPdf } from '../compraPdf';
import { mesesSafraPadrao } from '../historicoBi';
import type { Fornecedor, Produto } from '../types';

interface CompraModalProps {
  open: boolean;
  onFechar: () => void;
  /** Catálogo inteiro — usado na necessidade por Fornecedor (a busca inteligente por nome+Classe precisa ver todo mundo, não só o que está filtrado na grade). */
  produtos: Produto[];
  /** Já filtrado pelo "Filtrar:"/busca da grade principal — só o ícone de comparação de fornecedores usa esse (pra dar mais controle sobre o que entra no PDF). */
  produtosFiltrados: Produto[];
  fornecedores: Fornecedor[];
  items: ItemAgg[];
}

function fmtKg(v: number): string {
  return Math.round(v).toLocaleString('pt-BR');
}

// Fora do componente — os 12 rótulos não mudam, sem custo recalcular a cada render.
const MESES = mesesSafraPadrao();

function qtdMesesSoma(porMes: number[], mesesSelecionados: Set<number>): number {
  return Array.from(mesesSelecionados).reduce((soma, i) => soma + (porMes[i] ?? 0), 0);
}

/** 1ª entrada de porFornecedor é sempre o próprio produto (ver calcularNecessidadeCompra). */
function qtdPropria(item: ItemNecessidadeCompra, mesesSelecionados: Set<number>): number {
  return qtdMesesSoma(item.porFornecedor[0]?.porMes ?? [], mesesSelecionados);
}

/** Demais entradas — achadas pela busca por nome+Classe em outros fornecedores. */
function qtdOutrosFornecedores(item: ItemNecessidadeCompra, mesesSelecionados: Set<number>): number {
  return item.porFornecedor.slice(1).reduce((soma, f) => soma + qtdMesesSoma(f.porMes, mesesSelecionados), 0);
}

/**
 * "FORNECEDOR A — 1.500 un. (Ago: 120 | Set: 95 | Out: 60)\nFORNECEDOR B — ..." — total primeiro,
 * detalhe mês a mês entre parênteses, um bloco por fornecedor.
 */
function tooltipMensal(porFornecedor: FornecedorMensal[], mesesSelecionados: Set<number>): string {
  const mesesOrdenados = Array.from(mesesSelecionados).sort((a, b) => a - b);
  return porFornecedor
    .map((f) => {
      const total = qtdMesesSoma(f.porMes, mesesSelecionados);
      const detalhe = mesesOrdenados.map((i) => `${MESES[i]}: ${fmtInt.format(Math.round(f.porMes[i] ?? 0))}`).join(' | ');
      return `${f.fornecedorNome} — ${fmtInt.format(Math.round(total))} un. (${detalhe})`;
    })
    .join('\n');
}

/**
 * Planejamento de Compra, por Fornecedor: escolhe o(s) mês(es) a abastecer, o
 * sistema projeta a quantidade média (últimas safras, todas as Tabelas) de
 * cada produto desse fornecedor nesses meses. Informando o estoque atual, a
 * projeção já desconta a diferença — essa é a sugestão inicial da coluna
 * Pedido, que o usuário preenche/ajusta manualmente linha a linha; a divisão
 * por caminhão fica de fora do sistema, é feita manualmente por fora.
 */
export function CompraModal({ open, onFechar, produtos, produtosFiltrados, fornecedores, items }: CompraModalProps) {
  const [fornecedorId, setFornecedorId] = useState('');
  const [mesesSelecionados, setMesesSelecionados] = useState<Set<number>>(new Set());
  const [estoqueTexto, setEstoqueTexto] = useState<Record<string, string>>({});
  const [pedidoTexto, setPedidoTexto] = useState<Record<string, string>>({});
  const [produtosExcluidos, setProdutosExcluidos] = useState<Set<string>>(new Set());

  const produtosFornecedor = useMemo(() => produtos.filter((p) => p.fornecedorId === fornecedorId), [produtos, fornecedorId]);

  // Comparação de preço entre fornecedores — independe do Fornecedor selecionado acima, mas
  // respeita o "Filtrar:"/busca já aplicado na grade principal (dá mais controle sobre o que
  // entra no PDF); mesma regra de nome+Classe da busca inteligente da necessidade (ver compra.ts).
  const comparacaoFornecedores = useMemo(
    () => calcularComparacaoFornecedores(produtosFiltrados, fornecedores),
    [produtosFiltrados, fornecedores],
  );

  const estoquePorProduto = useMemo(() => {
    const mapa: Record<string, number> = {};
    Object.entries(estoqueTexto).forEach(([id, texto]) => {
      const n = parseFloat(texto);
      if (!isNaN(n)) mapa[id] = n;
    });
    return mapa;
  }, [estoqueTexto]);

  const necessidadeCompleta = useMemo(() => {
    if (!fornecedorId || mesesSelecionados.size === 0) return [];
    return calcularNecessidadeCompra(produtosFornecedor, produtos, fornecedores, items, Array.from(mesesSelecionados), estoquePorProduto);
  }, [produtosFornecedor, produtos, fornecedores, items, mesesSelecionados, estoquePorProduto, fornecedorId]);

  const necessidade = useMemo(
    () => necessidadeCompleta.filter((item) => !produtosExcluidos.has(item.produto.id)),
    [necessidadeCompleta, produtosExcluidos],
  );

  const itensExcluidos = useMemo(
    () => necessidadeCompleta.filter((item) => produtosExcluidos.has(item.produto.id)),
    [necessidadeCompleta, produtosExcluidos],
  );

  // Sugestão inicial = qtdComprar (projetado − estoque); o usuário sobrescreve linha a linha,
  // e a sobrescrita fica valendo mesmo que a sugestão mude (ex.: editar o estoque de novo).
  function pedidoQtd(item: ItemNecessidadeCompra): number {
    const texto = pedidoTexto[item.produto.id];
    if (texto === undefined) return item.qtdComprar;
    return Math.max(0, Math.round(parseFloat(texto) || 0));
  }
  function pedidoPeso(item: ItemNecessidadeCompra): number {
    return pedidoQtd(item) * item.pesoUnitario;
  }

  const totalPedidoUn = necessidade.reduce((soma, item) => soma + pedidoQtd(item), 0);
  const totalPedidoKg = necessidade.reduce((soma, item) => soma + pedidoPeso(item), 0);

  function toggleMes(i: number) {
    setMesesSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(i)) novo.delete(i);
      else novo.add(i);
      return novo;
    });
  }

  function fechar() {
    onFechar();
    setFornecedorId('');
    setMesesSelecionados(new Set());
    setEstoqueTexto({});
    setPedidoTexto({});
    setProdutosExcluidos(new Set());
  }

  const fornecedorSelecionado = fornecedores.find((f) => f.id === fornecedorId);
  const mesesLabelsSelecionados = Array.from(mesesSelecionados)
    .sort((a, b) => a - b)
    .map((i) => MESES[i]);

  function imprimir() {
    if (!fornecedorSelecionado) return;
    const itens = necessidade
      .map((item) => ({ nome: item.produto.nome.replace(/[*_]/g, ''), qtd: pedidoQtd(item), peso: pedidoPeso(item) }))
      .filter((it) => it.qtd > 0);
    gerarPedidoCompraPdf(fornecedorSelecionado, mesesLabelsSelecionados, itens);
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title={
        <>
          <span>Planejamento de Compra</span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {comparacaoFornecedores.length > 0 && (
              <button
                type="button"
                onClick={() => gerarComparacaoFornecedoresPdf(comparacaoFornecedores)}
                title="Comparar preço (R$/Kg) entre fornecedores do mesmo produto"
                className="rounded-md p-1.5 text-white/80 hover:bg-white/12 hover:text-white"
              >
                <GitCompare size={16} />
              </button>
            )}
            {necessidade.length > 0 && fornecedorSelecionado && (
              <button
                type="button"
                onClick={imprimir}
                title="Imprimir pedido"
                className="rounded-md p-1.5 text-white/80 hover:bg-white/12 hover:text-white"
              >
                <Printer size={16} />
              </button>
            )}
          </span>
        </>
      }
      widthClassName="max-w-4xl"
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Fornecedor</label>
          <select
            value={fornecedorId}
            onChange={(e) => {
              setFornecedorId(e.target.value);
              setProdutosExcluidos(new Set());
              setPedidoTexto({});
            }}
            className="w-full max-w-xs rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]"
          >
            <option value="">— Selecione —</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>

        {fornecedorId && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Mês(es) a abastecer</label>
            <div className="flex flex-wrap gap-1.5">
              {MESES.map((mes, i) => (
                <button
                  key={mes}
                  type="button"
                  onClick={() => toggleMes(i)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    mesesSelecionados.has(i)
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                      : 'border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-page)]'
                  }`}
                >
                  {mes}
                </button>
              ))}
            </div>
          </div>
        )}

        {fornecedorId &&
          mesesSelecionados.size > 0 &&
          (necessidade.length === 0 && itensExcluidos.length === 0 ? (
            <p className="text-sm text-[var(--color-text-soft)]">Nenhum produto desse fornecedor tem histórico de vendas nos meses escolhidos.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border border-[var(--color-line)]">
                <table className="w-full min-w-[720px] text-xs">
                  <thead>
                    <tr className="bg-[var(--color-navy)] text-left text-white">
                      <th className="px-3 py-2 font-semibold">Produto</th>
                      <th className="px-3 py-2 text-right font-semibold">Qtd Projetada</th>
                      <th className="px-3 py-2 text-right font-semibold">Outros Fornecedores</th>
                      <th className="px-3 py-2 text-right font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEstoqueTexto({})}
                            title="Restaurar (zera o estoque informado)"
                            className="text-white/70 hover:text-white"
                          >
                            <RotateCcw size={12} />
                          </button>
                          Estoque Atual
                        </span>
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">Pedido</th>
                      <th className="px-3 py-2 text-right font-semibold">Peso (kg)</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-line)]">
                    {necessidade.map((item) => (
                      <tr key={item.produto.id}>
                        <td className="px-3 py-1.5 text-[var(--color-text)]">{item.produto.nome.replace(/[*_]/g, '')}</td>
                        <td
                          className="num px-3 py-1.5 text-right text-[var(--color-text-soft)]"
                          title={tooltipMensal(item.porFornecedor.slice(0, 1), mesesSelecionados)}
                        >
                          {fmtInt.format(Math.round(qtdPropria(item, mesesSelecionados)))}
                        </td>
                        <td
                          className="num px-3 py-1.5 text-right text-[var(--color-text-soft)]"
                          title={item.porFornecedor.length > 1 ? tooltipMensal(item.porFornecedor.slice(1), mesesSelecionados) : undefined}
                        >
                          {item.porFornecedor.length > 1 ? fmtInt.format(Math.round(qtdOutrosFornecedores(item, mesesSelecionados))) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <span className="inline-flex items-center gap-1.5">
                            {estoqueTexto[item.produto.id] !== undefined && estoqueTexto[item.produto.id] !== '' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setEstoqueTexto((prev) => {
                                    const novo = { ...prev };
                                    delete novo[item.produto.id];
                                    return novo;
                                  })
                                }
                                title="Restaurar (zera o estoque informado desse produto)"
                                className="text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
                              >
                                <RotateCcw size={11} />
                              </button>
                            )}
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={estoqueTexto[item.produto.id] ?? ''}
                              onChange={(e) => setEstoqueTexto((prev) => ({ ...prev, [item.produto.id]: e.target.value }))}
                              className="num w-20 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-right text-[var(--color-text)]"
                            />
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number"
                            min="0"
                            value={pedidoTexto[item.produto.id] ?? String(item.qtdComprar)}
                            onChange={(e) => setPedidoTexto((prev) => ({ ...prev, [item.produto.id]: e.target.value }))}
                            className="num w-20 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-right font-semibold text-[var(--color-text)]"
                          />
                        </td>
                        <td className="num px-3 py-1.5 text-right text-[var(--color-text-soft)]">{fmtKg(pedidoPeso(item))}</td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => setProdutosExcluidos((prev) => new Set(prev).add(item.produto.id))}
                            title="Desconsiderar produto"
                            className="text-[var(--color-text-soft)] hover:text-bad"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {necessidade.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-[var(--color-line)] bg-[var(--color-page)] font-semibold text-[var(--color-text)]">
                        <td className="px-3 py-2" colSpan={4}>
                          Total do pedido
                        </td>
                        <td className="num px-3 py-2 text-right">{fmtInt.format(totalPedidoUn)} un.</td>
                        <td className="num px-3 py-2 text-right">{fmtKg(totalPedidoKg)} kg</td>
                        <td className="px-3 py-2" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {itensExcluidos.length > 0 && (
                <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-page)] p-2.5 text-xs">
                  <p className="mb-1 font-semibold text-[var(--color-text-soft)]">Desconsiderados desse pedido</p>
                  <div className="flex flex-wrap gap-1.5">
                    {itensExcluidos.map((item) => (
                      <button
                        key={item.produto.id}
                        type="button"
                        onClick={() =>
                          setProdutosExcluidos((prev) => {
                            const novo = new Set(prev);
                            novo.delete(item.produto.id);
                            return novo;
                          })
                        }
                        title={`Reincluir produto\n${tooltipMensal(item.porFornecedor, mesesSelecionados)}`}
                        className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1 text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
                      >
                        {item.produto.nome.replace(/[*_]/g, '')} ✕
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ))}
      </div>
    </Modal>
  );
}
