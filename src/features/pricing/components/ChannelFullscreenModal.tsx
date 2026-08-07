import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { Transportadora } from '@/features/fretes/types';
import type { Canal, Categoria, Fornecedor, Produto, Subcategoria } from '../types';
import { PricingTable } from './PricingTable';

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
  mostrarColunaId: boolean;
  onFechar: () => void;
  onUpdatePreco: (produtoId: string, canalId: string, preco: number) => void;
  onResetPreco: (produtoId: string, canalId: string) => void;
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
  mostrarColunaId,
  onFechar,
  onUpdatePreco,
  onResetPreco,
  onTogglePrecisaAjuste,
}: ChannelFullscreenModalProps) {
  const [busca, setBusca] = useState('');

  // Cada abertura do modal (canal diferente, ou reabrir o mesmo) começa sem
  // busca — não faz sentido herdar o termo de uma sessão anterior do modal.
  useEffect(() => {
    if (canal) setBusca('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canal?.id]);

  const fornecedorPorId = useMemo(() => new Map(fornecedores.map((f) => [f.id, f])), [fornecedores]);
  const produtosFiltrados = useMemo(() => {
    const palavras = busca.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (palavras.length === 0) return produtos;
    return produtos.filter((p) => {
      const fornecedor = p.fornecedorId ? fornecedorPorId.get(p.fornecedorId) : undefined;
      const descricao = `${p.nome} ${fornecedor?.nome ?? ''}`.toLowerCase();
      return palavras.every((palavra) => descricao.includes(palavra));
    });
  }, [produtos, busca, fornecedorPorId]);

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
        </>
      }
      onClose={onFechar}
      widthClassName="max-w-[95vw]"
    >
      <div className="max-h-[75vh]">
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
            mostrarColunaId={mostrarColunaId}
            onUpdatePreco={onUpdatePreco}
            onResetPreco={onResetPreco}
            onTogglePrecisaAjuste={onTogglePrecisaAjuste}
            somenteCanal
          />
        )}
      </div>
    </Modal>
  );
}
