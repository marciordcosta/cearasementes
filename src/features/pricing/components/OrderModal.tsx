import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface ItemOrdenavel {
  id: string;
  nome: string;
}

interface OrderModalProps<T extends ItemOrdenavel> {
  open: boolean;
  titulo: string;
  dica: string;
  itens: T[];
  onFechar: () => void;
  onSalvar: (novaOrdem: T[]) => void;
}

/** Reordenação genérica por setas ▲▼ — usada tanto pra Categorias quanto pra Tabelas de Preço. */
export function OrderModal<T extends ItemOrdenavel>({ open, titulo, dica, itens, onFechar, onSalvar }: OrderModalProps<T>) {
  const [ordemTemp, setOrdemTemp] = useState<T[]>(itens);

  useEffect(() => {
    if (open) setOrdemTemp(itens);
  }, [open, itens]);

  function mover(indice: number, direcao: -1 | 1) {
    const j = indice + direcao;
    if (j < 0 || j >= ordemTemp.length) return;
    const copia = [...ordemTemp];
    [copia[indice], copia[j]] = [copia[j], copia[indice]];
    setOrdemTemp(copia);
  }

  return (
    <Modal
      open={open}
      title={titulo}
      onClose={onFechar}
      footer={
        <>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => onSalvar(ordemTemp)}>
            Salvar Ordem
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-[var(--color-text-soft)]">{dica}</p>
      <div className="flex flex-col gap-1.5">
        {ordemTemp.map((item, i) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-2.5 rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm font-semibold text-[var(--color-navy)]"
          >
            <span>{item.nome}</span>
            <span className="flex gap-1">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => mover(i, -1)}
                title="Mover para cima"
                className="h-6 w-6 rounded border border-[var(--color-line)] text-xs disabled:opacity-35"
              >
                ▲
              </button>
              <button
                type="button"
                disabled={i === ordemTemp.length - 1}
                onClick={() => mover(i, 1)}
                title="Mover para baixo"
                className="h-6 w-6 rounded border border-[var(--color-line)] text-xs disabled:opacity-35"
              >
                ▼
              </button>
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
