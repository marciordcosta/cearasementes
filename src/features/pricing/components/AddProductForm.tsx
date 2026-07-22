import { useState, type FormEvent } from 'react';
import type { Categoria } from '../types';

interface AddProductFormProps {
  categorias: Categoria[];
  onAdicionar: (input: { nome: string; categoriaId: string; peso: number; custo: number }) => void;
}

const campoClasse =
  'rounded-md border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-[var(--color-accent)] focus:bg-white/20 focus:outline-none';

export function AddProductForm({ categorias, onAdicionar }: AddProductFormProps) {
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? '');
  const [nome, setNome] = useState('');
  const [peso, setPeso] = useState('');
  const [custo, setCusto] = useState('');

  function submeter(e: FormEvent) {
    e.preventDefault();
    const pesoNum = parseFloat(peso);
    const custoNum = parseFloat(custo);
    if (!nome.trim() || isNaN(pesoNum) || isNaN(custoNum)) return;
    onAdicionar({ nome: nome.trim(), categoriaId: categoriaId || categorias[0]?.id, peso: pesoNum, custo: custoNum });
    setNome('');
    setPeso('');
    setCusto('');
  }

  return (
    <form onSubmit={submeter} className="flex flex-wrap items-center gap-2">
      <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={`w-32 ${campoClasse}`}>
        {categorias.map((c) => (
          <option key={c.id} value={c.id} className="text-[var(--color-text)]">
            {c.nome}
          </option>
        ))}
      </select>
      <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Produto" required className={`w-40 ${campoClasse}`} />
      <input
        type="number"
        step="1"
        min="0"
        value={peso}
        onChange={(e) => setPeso(e.target.value)}
        placeholder="Peso (Kg)"
        required
        className={`num w-24 ${campoClasse}`}
      />
      <input
        type="number"
        step="0.1"
        min="0"
        value={custo}
        onChange={(e) => setCusto(e.target.value)}
        placeholder="Custo (R$)"
        required
        className={`num w-28 ${campoClasse}`}
      />
      <button type="submit" className="whitespace-nowrap rounded-md bg-[var(--color-accent)] px-3.5 py-2 text-sm font-semibold text-[#04241A] transition hover:brightness-105 active:translate-y-px">
        + Adicionar produto
      </button>
    </form>
  );
}
