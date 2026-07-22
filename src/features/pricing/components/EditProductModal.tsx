import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Categoria, DespesaDestino, Produto } from '../types';

interface EditProductModalProps {
  produto: Produto | null;
  categorias: Categoria[];
  onFechar: () => void;
  onSalvar: (patch: {
    nome: string;
    codigo: string;
    categoriaId: string;
    peso: number;
    despesaExtraValor: number;
    despesaExtraDestino: DespesaDestino;
  }) => void;
}

export function EditProductModal({ produto, categorias, onFechar, onSalvar }: EditProductModalProps) {
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [peso, setPeso] = useState('');
  const [despesaValor, setDespesaValor] = useState('0');
  const [despesaDestino, setDespesaDestino] = useState<DespesaDestino>('frete');

  useEffect(() => {
    if (!produto) return;
    setNome(produto.nome);
    setCodigo(produto.codigo ?? '');
    setCategoriaId(produto.categoriaId);
    setPeso(String(produto.peso));
    setDespesaValor(String(produto.despesaExtraValor || 0));
    setDespesaDestino(produto.despesaExtraDestino);
  }, [produto]);

  function salvar() {
    const pesoNum = parseFloat(peso);
    if (!nome.trim()) {
      alert('Informe o nome do produto.');
      return;
    }
    if (isNaN(pesoNum) || pesoNum <= 0) {
      alert('Informe um peso válido para o produto.');
      return;
    }
    onSalvar({
      nome: nome.trim(),
      codigo: codigo.trim(),
      categoriaId,
      peso: pesoNum,
      despesaExtraValor: parseFloat(despesaValor) || 0,
      despesaExtraDestino: despesaDestino,
    });
  }

  return (
    <Modal
      open={produto !== null}
      title="Editar Produto"
      onClose={onFechar}
      footer={
        <>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={salvar}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-[var(--color-text-soft)]">Classe</label>
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="rounded-md border border-[var(--color-line)] px-2.5 py-2 text-sm">
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-[var(--color-text-soft)]">ID</label>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="rounded-md border border-[var(--color-line)] px-2.5 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-[var(--color-text-soft)]">Produto</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className="rounded-md border border-[var(--color-line)] px-2.5 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-[var(--color-text-soft)]">Peso (Kg)</label>
          <input type="number" step="1" min="0" value={peso} onChange={(e) => setPeso(e.target.value)} className="rounded-md border border-[var(--color-line)] px-2.5 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-[var(--color-text-soft)]">Despesa Extra do Produto (R$)</label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.1"
              min="0"
              value={despesaValor}
              onChange={(e) => setDespesaValor(e.target.value)}
              placeholder="Valor R$"
              className="flex-1 rounded-md border border-[var(--color-line)] px-2.5 py-2 text-sm"
            />
            <select value={despesaDestino} onChange={(e) => setDespesaDestino(e.target.value as DespesaDestino)} className="flex-1 rounded-md border border-[var(--color-line)] px-2.5 py-2 text-sm">
              <option value="frete">Somar ao Frete</option>
              <option value="impostos">Somar ao Imposto</option>
            </select>
          </div>
        </div>
      </div>
    </Modal>
  );
}
