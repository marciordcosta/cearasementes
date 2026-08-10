import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { ItemAgg } from '@/features/bi/types';
import { fmtInt } from '@/lib/format';
import { calcularNecessidadeCompra, dividirEmCaminhoes } from '../compra';
import { mesesSafraPadrao } from '../historicoBi';
import type { Fornecedor, Produto } from '../types';

interface CompraModalProps {
  open: boolean;
  onFechar: () => void;
  produtos: Produto[];
  fornecedores: Fornecedor[];
  items: ItemAgg[];
}

function fmtKg(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Fora do componente — os 12 rótulos não mudam, sem custo recalcular a cada render.
const MESES = mesesSafraPadrao();

/**
 * Planejamento de Compra, por Fornecedor: escolhe o(s) mês(es) a abastecer, o
 * sistema projeta a quantidade média (últimas safras, todas as Tabelas) de
 * cada produto desse fornecedor nesses meses — informando o estoque atual,
 * desconta e mostra só o que falta comprar. Em seguida, "Fazer Pedido" pede o
 * peso que o caminhão traz e divide essa necessidade em 1+ carradas (cada uma
 * com a mesma mistura proporcional do que falta); se não couber tudo num
 * caminhão só, o(s) seguinte(s) levam o complemento.
 */
export function CompraModal({ open, onFechar, produtos, fornecedores, items }: CompraModalProps) {
  const [fornecedorId, setFornecedorId] = useState('');
  const [mesesSelecionados, setMesesSelecionados] = useState<Set<number>>(new Set());
  const [estoqueTexto, setEstoqueTexto] = useState<Record<string, string>>({});
  const [mostrarPedido, setMostrarPedido] = useState(false);
  const [pesoCaminhaoTexto, setPesoCaminhaoTexto] = useState('');

  const produtosFornecedor = useMemo(() => produtos.filter((p) => p.fornecedorId === fornecedorId), [produtos, fornecedorId]);

  const estoquePorProduto = useMemo(() => {
    const mapa: Record<string, number> = {};
    Object.entries(estoqueTexto).forEach(([id, texto]) => {
      const n = parseFloat(texto);
      if (!isNaN(n)) mapa[id] = n;
    });
    return mapa;
  }, [estoqueTexto]);

  const necessidade = useMemo(() => {
    if (!fornecedorId || mesesSelecionados.size === 0) return [];
    return calcularNecessidadeCompra(produtosFornecedor, items, Array.from(mesesSelecionados), estoquePorProduto);
  }, [produtosFornecedor, items, mesesSelecionados, estoquePorProduto, fornecedorId]);

  const pesoTotalNecessario = necessidade.reduce((soma, i) => soma + i.pesoTotal, 0);

  const caminhoes = useMemo(() => {
    const capacidade = parseFloat(pesoCaminhaoTexto);
    if (!mostrarPedido || !capacidade || capacidade <= 0) return [];
    return dividirEmCaminhoes(necessidade, capacidade);
  }, [mostrarPedido, pesoCaminhaoTexto, necessidade]);

  function toggleMes(i: number) {
    setMesesSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(i)) novo.delete(i);
      else novo.add(i);
      return novo;
    });
    setMostrarPedido(false); // mudou a necessidade — o pedido calculado antes não vale mais
  }

  function fechar() {
    onFechar();
    setFornecedorId('');
    setMesesSelecionados(new Set());
    setEstoqueTexto({});
    setMostrarPedido(false);
    setPesoCaminhaoTexto('');
  }

  return (
    <Modal open={open} onClose={fechar} title="Planejamento de Compra" widthClassName="max-w-4xl">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Fornecedor</label>
          <select
            value={fornecedorId}
            onChange={(e) => {
              setFornecedorId(e.target.value);
              setMostrarPedido(false);
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
          (necessidade.length === 0 ? (
            <p className="text-sm text-[var(--color-text-soft)]">Nenhum produto desse fornecedor tem histórico de vendas nos meses escolhidos.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border border-[var(--color-line)]">
                <table className="w-full min-w-[560px] text-xs">
                  <thead>
                    <tr className="bg-[var(--color-navy)] text-left text-white">
                      <th className="px-3 py-2 font-semibold">Produto</th>
                      <th className="px-3 py-2 text-right font-semibold">Qtd Projetada</th>
                      <th className="px-3 py-2 text-right font-semibold">Estoque Atual</th>
                      <th className="px-3 py-2 text-right font-semibold">Qtd a Comprar</th>
                      <th className="px-3 py-2 text-right font-semibold">Peso (kg)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-line)]">
                    {necessidade.map((item) => (
                      <tr key={item.produto.id}>
                        <td className="px-3 py-1.5 text-[var(--color-text)]">{item.produto.nome.replace(/[*_]/g, '')}</td>
                        <td className="num px-3 py-1.5 text-right text-[var(--color-text-soft)]">{fmtInt.format(Math.round(item.qtdProjetada))}</td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={estoqueTexto[item.produto.id] ?? ''}
                            onChange={(e) => {
                              setEstoqueTexto((prev) => ({ ...prev, [item.produto.id]: e.target.value }));
                              setMostrarPedido(false);
                            }}
                            className="num w-20 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-right text-[var(--color-text)]"
                          />
                        </td>
                        <td className="num px-3 py-1.5 text-right font-semibold text-[var(--color-text)]">{fmtInt.format(Math.round(item.qtdComprar))}</td>
                        <td className="num px-3 py-1.5 text-right text-[var(--color-text-soft)]">{fmtKg(item.pesoTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[var(--color-line)] bg-[var(--color-page)] font-semibold text-[var(--color-text)]">
                      <td className="px-3 py-2" colSpan={4}>
                        Total a comprar
                      </td>
                      <td className="num px-3 py-2 text-right">{fmtKg(pesoTotalNecessario)} kg</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {!mostrarPedido ? (
                <Button variant="primary" onClick={() => setMostrarPedido(true)} disabled={pesoTotalNecessario <= 0}>
                  🚚 Fazer Pedido
                </Button>
              ) : (
                <div className="space-y-3 rounded-md border border-[var(--color-line)] bg-[var(--color-page)] p-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Peso que o caminhão traz (kg)</label>
                    <input
                      type="number"
                      min="0"
                      autoFocus
                      value={pesoCaminhaoTexto}
                      onChange={(e) => setPesoCaminhaoTexto(e.target.value)}
                      className="num w-36 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-right text-sm text-[var(--color-text)]"
                    />
                  </div>

                  {caminhoes.length > 0 && (
                    <div className="space-y-3">
                      {caminhoes.map((caminhao) => (
                        <div key={caminhao.numero} className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
                          <p className="mb-2 text-xs font-semibold text-[var(--color-text)]">
                            Caminhão {caminhao.numero}
                            {caminhoes.length > 1 && caminhao.numero === caminhoes.length ? ' (complemento)' : ''} —{' '}
                            <span className="font-normal text-[var(--color-text-soft)]">{fmtKg(caminhao.pesoTotal)} kg</span>
                          </p>
                          <div className="space-y-1">
                            {caminhao.itens.map((it) => (
                              <div key={it.produto.id} className="flex items-center justify-between text-xs">
                                <span className="text-[var(--color-text)]">{it.produto.nome.replace(/[*_]/g, '')}</span>
                                <span className="num text-[var(--color-text-soft)]">
                                  {fmtInt.format(it.qtd)} un. — {fmtKg(it.peso)} kg
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ))}
      </div>
    </Modal>
  );
}
