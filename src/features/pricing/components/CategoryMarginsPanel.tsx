import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { Canal, Categoria } from '../types';

interface CategoryMarginsPanelProps {
  categorias: Categoria[];
  canais: Canal[];
  onAtualizarCategoria: (categoriaId: string, campo: 'estadual' | 'interestadual', valor: number) => void;
  onAtualizarMargem: (categoriaId: string, canalId: string, valor: number) => void;
  onRemoverCategoria: (categoriaId: string) => void;
  onAdicionarCategoria: (input: { nome: string; estadual: number; interestadual: number }) => void;
}

export function CategoryMarginsPanel({
  categorias,
  canais,
  onAtualizarCategoria,
  onAtualizarMargem,
  onRemoverCategoria,
  onAdicionarCategoria,
}: CategoryMarginsPanelProps) {
  const [nome, setNome] = useState('');
  const [estadual, setEstadual] = useState('');
  const [interestadual, setInterestadual] = useState('');

  function submeter() {
    if (!nome.trim()) return;
    onAdicionarCategoria({
      nome: nome.trim(),
      estadual: parseFloat(estadual) || 18,
      interestadual: parseFloat(interestadual) || 12,
    });
    setNome('');
    setEstadual('');
    setInterestadual('');
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-[var(--color-text)]">Gerenciamento de Categorias</p>
      <p className="text-xs text-[var(--color-text-soft)]">
        Para cada categoria, defina as alíquotas de imposto e a margem de lucro sugerida para cada Tabela de Preço existente.
      </p>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="bg-[var(--color-page)] text-left text-[var(--color-text)]">
                <th className="px-3 py-2 font-semibold">Categoria</th>
                <th className="px-3 py-2 font-semibold">Estadual (%)</th>
                <th className="px-3 py-2 font-semibold">Interestadual (%)</th>
                {canais.map((canal) => (
                  <th key={canal.id} className="px-3 py-2 font-semibold">
                    {canal.nome} (%)
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {categorias.map((cat) => (
                <tr key={cat.id} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2 font-semibold text-[var(--color-text)]">{cat.nome}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      defaultValue={cat.estadual}
                      onBlur={(e) => onAtualizarCategoria(cat.id, 'estadual', parseFloat(e.target.value) || 0)}
                      className="num w-20 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-right text-[var(--color-text)]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      defaultValue={cat.interestadual}
                      onBlur={(e) => onAtualizarCategoria(cat.id, 'interestadual', parseFloat(e.target.value) || 0)}
                      className="num w-20 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-right text-[var(--color-text)]"
                    />
                  </td>
                  {canais.map((canal) => (
                    <td key={canal.id} className="px-3 py-2">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        defaultValue={cat.margens[canal.id] ?? 20}
                        onBlur={(e) => onAtualizarMargem(cat.id, canal.id, parseFloat(e.target.value) || 0)}
                        className="num w-20 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-right text-[var(--color-text)]"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => onRemoverCategoria(cat.id)} title="Deletar categoria" className="text-[var(--color-text-soft)] hover:text-bad">
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] bg-[var(--color-page)] px-4 py-3">
          <span className="text-xs font-semibold text-[var(--color-text-soft)]">Nova categoria:</span>
          <input
            type="text"
            placeholder="Nome da categoria"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-44 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)]"
          />
          <input
            type="number"
            step="0.1"
            min="0"
            placeholder="Estadual %"
            value={estadual}
            onChange={(e) => setEstadual(e.target.value)}
            className="w-24 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)] num"
          />
          <input
            type="number"
            step="0.1"
            min="0"
            placeholder="Interestadual %"
            value={interestadual}
            onChange={(e) => setInterestadual(e.target.value)}
            className="w-28 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)] num"
          />
          <Button variant="primary" onClick={submeter}>
            + Adicionar categoria
          </Button>
        </div>
      </Card>
    </div>
  );
}
