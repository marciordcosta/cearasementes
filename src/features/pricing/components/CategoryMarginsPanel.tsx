import { Fragment, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { Canal, Categoria, Subcategoria } from '../types';

interface CategoryMarginsPanelProps {
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  canais: Canal[];
  onAtualizarCategoria: (categoriaId: string, campo: 'estadual' | 'interestadual', valor: number) => void;
  onAtualizarMargem: (categoriaId: string, canalId: string, valor: number) => void;
  onRemoverCategoria: (categoriaId: string) => void;
  onAdicionarCategoria: (input: { nome: string; estadual: number; interestadual: number }) => void;
  onAdicionarSubcategoria: (categoriaId: string, nome: string) => void;
  onRenomearSubcategoria: (id: string, nome: string) => void;
  onRemoverSubcategoria: (id: string) => void;
  /** valor null = apaga o override, volta a herdar a margem da categoria pai. */
  onAtualizarMargemSubcategoria: (subcategoriaId: string, canalId: string, valor: number | null) => void;
}

export function CategoryMarginsPanel({
  categorias,
  subcategorias,
  canais,
  onAtualizarCategoria,
  onAtualizarMargem,
  onRemoverCategoria,
  onAdicionarCategoria,
  onAdicionarSubcategoria,
  onRenomearSubcategoria,
  onRemoverSubcategoria,
  onAtualizarMargemSubcategoria,
}: CategoryMarginsPanelProps) {
  const [nome, setNome] = useState('');
  const [estadual, setEstadual] = useState('');
  const [interestadual, setInterestadual] = useState('');
  const [adicionandoSubDe, setAdicionandoSubDe] = useState<string | null>(null);
  const [nomeSub, setNomeSub] = useState('');

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

  function submeterSub(categoriaId: string) {
    if (!nomeSub.trim()) return;
    onAdicionarSubcategoria(categoriaId, nomeSub.trim());
    setNomeSub('');
    setAdicionandoSubDe(null);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-[var(--color-text)]">Gerenciamento de Categorias</p>
      <p className="text-xs text-[var(--color-text-soft)]">
        Para cada categoria, defina as alíquotas de imposto e a margem de lucro sugerida para cada Tabela de Preço existente. Use o "+" pra
        criar subcategorias — a margem delas (por canal) sobrepõe a da categoria pai quando preenchida; em branco, herda normalmente.
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
              {categorias.map((cat) => {
                const subsDaCategoria = subcategorias.filter((s) => s.categoriaId === cat.id);
                return (
                  <Fragment key={cat.id}>
                    <tr className="border-t border-[var(--color-line)]">
                      <td className="px-3 py-2 font-semibold text-[var(--color-text)]">
                        <span className="inline-flex items-center gap-1.5">
                          {cat.nome}
                          <button
                            type="button"
                            onClick={() => setAdicionandoSubDe(adicionandoSubDe === cat.id ? null : cat.id)}
                            title="Adicionar subcategoria"
                            className="rounded px-1 text-[var(--color-text-soft)] hover:bg-[var(--color-line)] hover:text-[var(--color-text)]"
                          >
                            +
                          </button>
                        </span>
                      </td>
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
                    {subsDaCategoria.map((sub) => (
                      <tr key={sub.id} className="border-t border-[var(--color-line)] bg-[var(--color-page)]">
                        <td className="py-1.5 pl-8 pr-3 text-[var(--color-text-soft)]">
                          <input
                            type="text"
                            defaultValue={sub.nome}
                            onBlur={(e) => {
                              const novoNome = e.target.value.trim();
                              if (novoNome && novoNome !== sub.nome) onRenomearSubcategoria(sub.id, novoNome);
                              else e.target.value = sub.nome;
                            }}
                            className="w-full rounded-md border border-transparent bg-transparent px-1 py-1 text-[var(--color-text-soft)] hover:border-[var(--color-line)] focus:border-[var(--color-line)] focus:bg-[var(--color-surface)]"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-center text-[var(--color-text-soft)]">—</td>
                        <td className="px-3 py-1.5 text-center text-[var(--color-text-soft)]">—</td>
                        {canais.map((canal) => (
                          <td key={canal.id} className="px-3 py-1.5">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              placeholder={String(cat.margens[canal.id] ?? 20)}
                              defaultValue={sub.margens[canal.id] ?? ''}
                              onBlur={(e) => {
                                const texto = e.target.value.trim();
                                onAtualizarMargemSubcategoria(sub.id, canal.id, texto === '' ? null : parseFloat(texto) || 0);
                              }}
                              className="num w-20 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-right text-[var(--color-text)] placeholder:text-[var(--color-text-soft)]"
                            />
                          </td>
                        ))}
                        <td className="px-3 py-1.5">
                          <button type="button" onClick={() => onRemoverSubcategoria(sub.id)} title="Deletar subcategoria" className="text-[var(--color-text-soft)] hover:text-bad">
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
                    {adicionandoSubDe === cat.id && (
                      <tr className="border-t border-[var(--color-line)] bg-[var(--color-page)]">
                        <td colSpan={canais.length + 4} className="px-3 py-2">
                          <div className="flex items-center gap-2 pl-8">
                            <input
                              type="text"
                              autoFocus
                              placeholder="Nome da subcategoria"
                              value={nomeSub}
                              onChange={(e) => setNomeSub(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && submeterSub(cat.id)}
                              className="w-48 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)]"
                            />
                            <Button variant="primary" onClick={() => submeterSub(cat.id)}>
                              + Adicionar subcategoria
                            </Button>
                            <button type="button" onClick={() => setAdicionandoSubDe(null)} className="text-[var(--color-text-soft)] hover:text-[var(--color-text)]">
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
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
