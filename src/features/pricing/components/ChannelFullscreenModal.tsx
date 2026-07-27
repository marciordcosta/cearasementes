import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { Transportadora } from '@/features/fretes/types';
import type { Canal, Categoria, Produto } from '../types';
import { PricingTable } from './PricingTable';

interface ChannelFullscreenModalProps {
  canal: Canal | null;
  produtos: Produto[];
  categorias: Categoria[];
  transportadoras: Transportadora[];
  mostrarColunaId: boolean;
  onFechar: () => void;
  onUpdateCusto: (produtoId: string, custo: number) => void;
  onUpdatePreco: (produtoId: string, canalId: string, preco: number) => void;
  onResetPreco: (produtoId: string, canalId: string) => void;
}

export function ChannelFullscreenModal({ canal, produtos, categorias, transportadoras, mostrarColunaId, onFechar, onUpdateCusto, onUpdatePreco, onResetPreco }: ChannelFullscreenModalProps) {
  const [busca, setBusca] = useState('');

  // Cada abertura do modal (canal diferente, ou reabrir o mesmo) começa sem
  // busca — não faz sentido herdar o termo de uma sessão anterior do modal.
  useEffect(() => {
    if (canal) setBusca('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canal?.id]);

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return produtos;
    return produtos.filter((p) => p.nome.toLowerCase().includes(termo));
  }, [produtos, busca]);

  return (
    <Modal
      open={canal !== null}
      title={
        <>
          <span className="shrink-0">{canal?.nome ?? ''}</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto…"
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
            canaisVisiveis={[canal]}
            transportadoras={transportadoras}
            mostrarColunaId={mostrarColunaId}
            onUpdateCusto={onUpdateCusto}
            onUpdatePreco={onUpdatePreco}
            onResetPreco={onResetPreco}
            somenteCanal
          />
        )}
      </div>
    </Modal>
  );
}
