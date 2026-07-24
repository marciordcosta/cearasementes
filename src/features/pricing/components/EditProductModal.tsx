import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Categoria, Produto } from '../types';

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
    cubagem: string | null;
  }) => void;
}

const campoClasse = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-2 text-sm text-[var(--color-text)]';

/** Linha do formulário: rótulo (descrição) numa coluna fixa à esquerda, campo de preenchimento à direita. */
function Linha({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3">
      <label className="text-sm text-[var(--color-text-soft)]">{label}</label>
      {children}
    </div>
  );
}

export function EditProductModal({ produto, categorias, onFechar, onSalvar }: EditProductModalProps) {
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [peso, setPeso] = useState('');
  const [despesaValor, setDespesaValor] = useState('0');
  const [cubagemC, setCubagemC] = useState('');
  const [cubagemL, setCubagemL] = useState('');
  const [cubagemA, setCubagemA] = useState('');

  useEffect(() => {
    if (!produto) return;
    setNome(produto.nome);
    setCodigo(produto.codigo ?? '');
    setCategoriaId(produto.categoriaId);
    setPeso(String(produto.peso));
    setDespesaValor(String(produto.despesaExtraValor || 0));
    const partes = produto.cubagem?.split(/x/i) ?? [];
    setCubagemC(partes[0]?.trim() ?? '');
    setCubagemL(partes[1]?.trim() ?? '');
    setCubagemA(partes[2]?.trim() ?? '');
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
    const cubagemPreenchida = cubagemC.trim() && cubagemL.trim() && cubagemA.trim();
    onSalvar({
      nome: nome.trim(),
      codigo: codigo.trim(),
      categoriaId,
      peso: pesoNum,
      despesaExtraValor: parseFloat(despesaValor) || 0,
      cubagem: cubagemPreenchida ? `${cubagemC.trim()}x${cubagemL.trim()}x${cubagemA.trim()}` : null,
    });
  }

  return (
    <Modal
      open={produto !== null}
      title="Editar Produto"
      onClose={onFechar}
      widthClassName="max-w-[480px]"
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
      <div className="space-y-3">
        <Linha label="Classe">
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={campoClasse}>
            {categorias.map((c) => (
              <option key={c.id} value={c.id} className="text-[var(--color-text)]">
                {c.nome}
              </option>
            ))}
          </select>
        </Linha>

        <Linha label="ID">
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className={campoClasse} />
        </Linha>

        <Linha label="Produto">
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={campoClasse} />
        </Linha>

        <Linha label="Peso (Kg)">
          <input type="number" step="1" min="0" value={peso} onChange={(e) => setPeso(e.target.value)} className={campoClasse} />
        </Linha>

        <Linha label="Cubagem (m)">
          <div className="flex gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[var(--color-text-soft)]">Compr.</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cubagemC}
                onChange={(e) => setCubagemC(e.target.value)}
                className="num w-16 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-right text-sm text-[var(--color-text)]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[var(--color-text-soft)]">Larg.</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cubagemL}
                onChange={(e) => setCubagemL(e.target.value)}
                className="num w-16 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-right text-sm text-[var(--color-text)]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[var(--color-text-soft)]">Alt.</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cubagemA}
                onChange={(e) => setCubagemA(e.target.value)}
                className="num w-16 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-right text-sm text-[var(--color-text)]"
              />
            </div>
          </div>
        </Linha>

        <Linha label="Despesa Extra (R$)">
          <div>
            <input type="number" step="0.1" min="0" value={despesaValor} onChange={(e) => setDespesaValor(e.target.value)} placeholder="Valor R$" className={campoClasse} />
            <p className="mt-1 text-xs text-[var(--color-text-soft)]">Soma sempre como mais Encargos (não afeta o frete — pra isso, use a Cubagem).</p>
          </div>
        </Linha>
      </div>
    </Modal>
  );
}
