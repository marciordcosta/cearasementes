import { Printer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { ItemAgg } from '@/features/bi/types';
import { fmtInt } from '@/lib/format';
import { calcularNecessidadeCompra, dividirEmCaminhoes, reequilibrarCaminhao, type CaminhaoPedido } from '../compra';
import { gerarPedidoCompraPdf } from '../compraPdf';
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
  const [produtosExcluidos, setProdutosExcluidos] = useState<Set<string>>(new Set());

  const produtosFornecedor = useMemo(() => produtos.filter((p) => p.fornecedorId === fornecedorId), [produtos, fornecedorId]);

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
    return calcularNecessidadeCompra(produtosFornecedor, items, Array.from(mesesSelecionados), estoquePorProduto);
  }, [produtosFornecedor, items, mesesSelecionados, estoquePorProduto, fornecedorId]);

  const necessidade = useMemo(
    () => necessidadeCompleta.filter((item) => !produtosExcluidos.has(item.produto.id)),
    [necessidadeCompleta, produtosExcluidos],
  );

  const itensExcluidos = useMemo(
    () => necessidadeCompleta.filter((item) => produtosExcluidos.has(item.produto.id)),
    [necessidadeCompleta, produtosExcluidos],
  );

  const pesoTotalNecessario = necessidade.reduce((soma, i) => soma + i.pesoTotal, 0);

  const caminhoes = useMemo(() => {
    const capacidade = parseFloat(pesoCaminhaoTexto);
    if (!mostrarPedido || !capacidade || capacidade <= 0) return [];
    return dividirEmCaminhoes(necessidade, capacidade);
  }, [mostrarPedido, pesoCaminhaoTexto, necessidade]);

  // Cópia editável — o usuário pode ajustar a quantidade de cada item por caminhão
  // (reequilibrando os últimos itens pra nunca ultrapassar a capacidade); some recálculo
  // acima (novo peso do caminhão, nova necessidade) descarta os ajustes manuais e recomeça daqui.
  const [caminhoesEditados, setCaminhoesEditados] = useState<CaminhaoPedido[]>([]);
  // Texto do campo sendo digitado agora (não confirmado ainda) — o reequilíbrio só roda
  // quando o campo perde o foco, nunca a cada tecla. Reequilibrar por tecla (ex.: "1" → "13"
  // → "133") faz cada dígito digitado disparar um reequilíbrio EM CIMA do reequilíbrio
  // anterior, indo zerando os últimos itens em cascata a cada tecla — daí o bug.
  const [edicaoQtd, setEdicaoQtd] = useState<{ caminhaoIdx: number; itemIdx: number; texto: string } | null>(null);

  useEffect(() => {
    setCaminhoesEditados(caminhoes.map((c) => ({ ...c, itens: c.itens.map((it) => ({ ...it })) })));
    setEdicaoQtd(null);
  }, [caminhoes]);

  function confirmarEdicaoQtd() {
    if (!edicaoQtd) return;
    const { caminhaoIdx, itemIdx, texto } = edicaoQtd;
    setEdicaoQtd(null);
    const capacidade = parseFloat(pesoCaminhaoTexto);
    if (!capacidade || capacidade <= 0) return;
    setCaminhoesEditados((prev) => {
      const copia = prev.map((c) => ({ ...c, itens: c.itens.map((it) => ({ ...it })) }));
      const item = copia[caminhaoIdx].itens[itemIdx];
      const novaQtd = Math.max(0, Math.round(parseFloat(texto) || 0));
      item.qtd = novaQtd;
      item.peso = novaQtd * item.produto.peso;
      const itensReequilibrados = reequilibrarCaminhao(copia[caminhaoIdx].itens, itemIdx, capacidade);
      copia[caminhaoIdx].itens = itensReequilibrados;
      copia[caminhaoIdx].pesoTotal = itensReequilibrados.reduce((soma, it) => soma + it.peso, 0);
      return copia;
    });
  }

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
    setProdutosExcluidos(new Set());
  }

  const fornecedorSelecionado = fornecedores.find((f) => f.id === fornecedorId);
  const mesesLabelsSelecionados = Array.from(mesesSelecionados)
    .sort((a, b) => a - b)
    .map((i) => MESES[i]);

  return (
    <Modal
      open={open}
      onClose={fechar}
      title={
        <>
          <span>Planejamento de Compra</span>
          {mostrarPedido && caminhoesEditados.length > 0 && fornecedorSelecionado && (
            <button
              type="button"
              onClick={() =>
                gerarPedidoCompraPdf(
                  fornecedorSelecionado,
                  mesesLabelsSelecionados,
                  caminhoesEditados,
                  itensExcluidos.map((item) => item.produto.nome.replace(/[*_]/g, '')),
                )
              }
              title="Imprimir pedido"
              className="ml-auto shrink-0 rounded-md p-1.5 text-white/80 hover:bg-white/12 hover:text-white"
            >
              <Printer size={16} />
            </button>
          )}
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
              setMostrarPedido(false);
              setProdutosExcluidos(new Set());
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
                      <th className="px-3 py-2" />
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
                        <td className="num px-3 py-1.5 text-right font-semibold text-[var(--color-text)]">{fmtInt.format(item.qtdComprar)}</td>
                        <td className="num px-3 py-1.5 text-right text-[var(--color-text-soft)]">{fmtKg(item.pesoTotal)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setProdutosExcluidos((prev) => new Set(prev).add(item.produto.id));
                              setMostrarPedido(false);
                            }}
                            title="Desconsiderar produto"
                            className="text-[var(--color-text-soft)] hover:text-bad"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[var(--color-line)] bg-[var(--color-page)] font-semibold text-[var(--color-text)]">
                      <td className="px-3 py-2" colSpan={4}>
                        Total a comprar
                      </td>
                      <td className="num px-3 py-2 text-right">{fmtKg(pesoTotalNecessario)} kg</td>
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
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
                        title="Reincluir produto"
                        className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1 text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
                      >
                        {item.produto.nome.replace(/[*_]/g, '')} ✕
                      </button>
                    ))}
                  </div>
                </div>
              )}

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

                  {caminhoesEditados.length > 0 && (
                    <div className="space-y-3">
                      {caminhoesEditados.map((caminhao, caminhaoIdx) => (
                        <div key={caminhao.numero} className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
                          <p className="mb-2 text-xs font-semibold text-[var(--color-text)]">
                            Caminhão {caminhao.numero}
                            {caminhoesEditados.length > 1 && caminhao.numero === caminhoesEditados.length ? ' (complemento)' : ''} —{' '}
                            <span className="font-normal text-[var(--color-text-soft)]">{fmtKg(caminhao.pesoTotal)} kg</span>
                          </p>
                          <div className="space-y-1">
                            {caminhao.itens.map((it, itemIdx) => (
                              <div key={it.produto.id} className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-[var(--color-text)]">{it.produto.nome.replace(/[*_]/g, '')}</span>
                                <span className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min="0"
                                    value={
                                      edicaoQtd && edicaoQtd.caminhaoIdx === caminhaoIdx && edicaoQtd.itemIdx === itemIdx
                                        ? edicaoQtd.texto
                                        : it.qtd
                                    }
                                    onChange={(e) => setEdicaoQtd({ caminhaoIdx, itemIdx, texto: e.target.value })}
                                    onBlur={confirmarEdicaoQtd}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                    }}
                                    className="num w-16 rounded-md border border-[var(--color-line)] bg-[var(--color-page)] px-1.5 py-0.5 text-right text-[var(--color-text)]"
                                  />
                                  <span className="num text-[var(--color-text-soft)]">un. — {fmtKg(it.peso)} kg</span>
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
