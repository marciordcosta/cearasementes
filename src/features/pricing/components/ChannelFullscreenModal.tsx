import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { fetchVendaItens, fetchVendas } from '@/features/bi/api';
import { agregarItens } from '@/features/bi/aggregate';
import type { Transportadora } from '@/features/fretes/types';
import {
  calcularMargemAtualProjetada,
  calcularRepresentatividade,
  construirHistoricoPorCodigo,
  construirMargemBrutaAgregadaPorSafra,
  listarSafrasDisponiveis,
  type HistoricoSafra,
  type MargemBrutaAgregada,
} from '../historicoBi';
import type { Canal, Categoria, Fornecedor, Produto, Subcategoria } from '../types';
import { PricingTable } from './PricingTable';

function fmtP(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

interface ChannelFullscreenModalProps {
  canal: Canal | null;
  produtos: Produto[];
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  fornecedores: Fornecedor[];
  /** Canal de referência GERAL (primeira tabela, entre todos os canais visíveis) — usado nos tooltips de comparação mesmo aqui, onde só 1 canal aparece. */
  canalReferencia?: Canal;
  /** TODOS os canais (não só os visíveis) — usado só pra resolver "Sugestão de Margem por referência". */
  todosCanais: Canal[];
  transportadoras: Transportadora[];
  mostrarMaisDetalhes: boolean;
  onFechar: () => void;
  onUpdatePreco: (produtoId: string, canalId: string, preco: number) => void;
  onResetPreco: (produtoId: string, canalId: string) => void;
  onResetTodosPrecos: (canalId: string) => void;
  onTogglePrecisaAjuste: (produtoId: string, canalId: string, valor: boolean) => void;
}

export function ChannelFullscreenModal({
  canal,
  produtos,
  categorias,
  subcategorias,
  fornecedores,
  canalReferencia,
  todosCanais,
  transportadoras,
  mostrarMaisDetalhes,
  onFechar,
  onUpdatePreco,
  onResetPreco,
  onResetTodosPrecos,
  onTogglePrecisaAjuste,
}: ChannelFullscreenModalProps) {
  const [busca, setBusca] = useState('');
  const [ordenarPorRepresentacao, setOrdenarPorRepresentacao] = useState(false);

  // Cada abertura do modal (canal diferente, ou reabrir o mesmo) começa sem
  // busca nem ordenação — não faz sentido herdar isso de uma sessão anterior do modal.
  useEffect(() => {
    if (canal) {
      setBusca('');
      setOrdenarPorRepresentacao(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canal?.id]);

  // Só busca o histórico de vendas (BI) enquanto o modal estiver aberto — nunca na carga normal
  // da página de Precificação. Mesma queryKey que o Dashboard usa, então se ele já foi aberto
  // nesta sessão os dados vêm do cache na hora; senão, busca uma vez só.
  const { data: vendasBi = [], isLoading: carregandoVendasBi } = useQuery({ queryKey: ['bi', 'vendas'], queryFn: fetchVendas, enabled: canal !== null });
  const { data: itensBi = [], isLoading: carregandoItensBi } = useQuery({ queryKey: ['bi', 'itens'], queryFn: fetchVendaItens, enabled: canal !== null });
  const carregandoHistorico = carregandoVendasBi || carregandoItensBi;
  const itemsAgregados = useMemo(() => agregarItens(vendasBi, itensBi), [vendasBi, itensBi]);
  const historicoPorCodigo = useMemo((): Map<string, Map<string, HistoricoSafra>> => {
    if (!canal) return new Map();
    return construirHistoricoPorCodigo(itemsAgregados, canal.nome);
  }, [itemsAgregados, canal]);
  const safrasDisponiveis = useMemo(() => listarSafrasDisponiveis(historicoPorCodigo), [historicoPorCodigo]);
  const margemAgregadaPorSafra = useMemo((): Map<string, MargemBrutaAgregada> => {
    if (!canal) return new Map();
    return construirMargemBrutaAgregadaPorSafra(itemsAgregados, canal.nome);
  }, [itemsAgregados, canal]);
  const canaisPorId = useMemo(() => new Map(todosCanais.map((c) => [c.id, c])), [todosCanais]);
  const transportadoraPorId = useMemo(() => new Map(transportadoras.map((t) => [t.id, t])), [transportadoras]);
  const margemAtualProjetada = useMemo(() => {
    if (!canal) return null;
    return calcularMargemAtualProjetada(produtos, canal, categorias, subcategorias, transportadoraPorId, canaisPorId, historicoPorCodigo);
  }, [produtos, canal, categorias, subcategorias, transportadoraPorId, canaisPorId, historicoPorCodigo]);
  const representatividadePorProduto = useMemo(
    () => calcularRepresentatividade(produtos, historicoPorCodigo),
    [produtos, historicoPorCodigo],
  );

  const fornecedorPorId = useMemo(() => new Map(fornecedores.map((f) => [f.id, f])), [fornecedores]);
  const produtosFiltrados = useMemo(() => {
    const palavras = busca.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtrados =
      palavras.length === 0
        ? produtos
        : produtos.filter((p) => {
            const fornecedor = p.fornecedorId ? fornecedorPorId.get(p.fornecedorId) : undefined;
            const descricao = `${p.nome} ${fornecedor?.nome ?? ''}`.toLowerCase();
            return palavras.every((palavra) => descricao.includes(palavra));
          });
    if (!ordenarPorRepresentacao) return filtrados;
    // Maior Representação primeiro — produto sem dado (Código não batendo) vai pro final.
    return [...filtrados].sort((a, b) => (representatividadePorProduto.get(b.id)?.pct ?? -1) - (representatividadePorProduto.get(a.id)?.pct ?? -1));
  }, [produtos, busca, fornecedorPorId, ordenarPorRepresentacao, representatividadePorProduto]);

  return (
    <Modal
      open={canal !== null}
      title={
        <>
          <span className="shrink-0">{canal?.nome ?? ''}</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto pelo nome ou fornecedor…"
            className="w-full max-w-xs rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-normal text-white placeholder:text-white/55 focus:border-[var(--color-accent)] focus:bg-white/20 focus:outline-none"
          />
          {margemAtualProjetada && margemAtualProjetada.valorProjetado > 0 && (
            <span
              className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-normal whitespace-nowrap text-white"
              title="Margem bruta de hoje (preço e custo atuais) pra tabela inteira, ponderada pela média de quantidade vendida nas últimas safras — estimativa de volume, já que a safra atual ainda não fechou."
            >
              MB atual: {fmtP(margemAtualProjetada.margemBrutaPct)}%
            </span>
          )}
          {margemAtualProjetada && margemAtualProjetada.valorProjetado > 0 && (
            <span
              className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-normal whitespace-nowrap text-white"
              title="Margem líquida (a mesma já informada por produto — ML $, com imposto/encargos/frete) de hoje pra tabela inteira, ponderada pela média de quantidade vendida nas últimas safras."
            >
              M.C prevista: {fmtP(margemAtualProjetada.margemLiquidaPct)}%
            </span>
          )}
          <button
            type="button"
            onClick={() => setOrdenarPorRepresentacao((v) => !v)}
            title={ordenarPorRepresentacao ? 'Ordenado por Representação (maior → menor) — clique pra voltar à ordem padrão' : 'Ordenar por Representação (maior → menor)'}
            className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-xs font-normal whitespace-nowrap ${ordenarPorRepresentacao ? 'bg-[var(--color-accent)] text-white' : 'bg-white/15 text-white hover:bg-white/25'}`}
          >
            ⇅ Repres.
          </button>
        </>
      }
      onClose={onFechar}
      widthClassName="max-w-[95vw]"
    >
      <div className="max-h-[75vh]">
        {canal && carregandoHistorico && (
          <p className="mb-2 text-xs text-[var(--color-text-soft)]">Carregando histórico de safras…</p>
        )}
        {canal && (
          <PricingTable
            produtos={produtosFiltrados}
            categorias={categorias}
            subcategorias={subcategorias}
            fornecedores={fornecedores}
            canaisVisiveis={[canal]}
            canalReferencia={canalReferencia}
            todosCanais={todosCanais}
            transportadoras={transportadoras}
            mostrarMaisDetalhes={mostrarMaisDetalhes}
            onUpdatePreco={onUpdatePreco}
            onResetPreco={onResetPreco}
            onResetTodosPrecos={onResetTodosPrecos}
            onTogglePrecisaAjuste={onTogglePrecisaAjuste}
            historicoSafras={safrasDisponiveis}
            historicoPorCodigo={historicoPorCodigo}
            margemAgregadaPorSafra={margemAgregadaPorSafra}
            representatividadePorProduto={representatividadePorProduto}
            somenteCanal
          />
        )}
      </div>
    </Modal>
  );
}
