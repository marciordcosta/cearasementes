import { Modal } from '@/components/ui/Modal';
import type { Canal, Categoria, Produto } from '../types';
import { PricingTable } from './PricingTable';

interface ChannelFullscreenModalProps {
  canal: Canal | null;
  produtos: Produto[];
  categorias: Categoria[];
  mostrarColunaId: boolean;
  onFechar: () => void;
  onUpdateCusto: (produtoId: string, custo: number) => void;
  onUpdatePreco: (produtoId: string, canalId: string, preco: number) => void;
  onResetPreco: (produtoId: string, canalId: string) => void;
}

export function ChannelFullscreenModal({ canal, produtos, categorias, mostrarColunaId, onFechar, onUpdateCusto, onUpdatePreco, onResetPreco }: ChannelFullscreenModalProps) {
  return (
    <Modal open={canal !== null} title={canal?.nome ?? ''} onClose={onFechar} widthClassName="max-w-[95vw]">
      <div className="max-h-[75vh]">
        {canal && (
          <PricingTable
            produtos={produtos}
            categorias={categorias}
            canaisVisiveis={[canal]}
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
