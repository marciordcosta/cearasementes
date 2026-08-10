import { Fragment, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { Canal, Categoria, Subcategoria } from '../types';

/** Campo de tolerância (pontos percentuais) reaproveitado nos dois modos (Por categoria e Por referência) da linha de uma categoria. */
function CampoTolerancia({
  valor,
  onAtualizar,
}: {
  valor: number | undefined;
  onAtualizar: (valor: number | null) => void;
}) {
  return (
    <input
      type="number"
      step="0.1"
      min="0"
      title="Tolerância (pontos percentuais) sobre a margem alvo dessa categoria+Tabela — fora da faixa, o ML% do produto fica destacado (vermelho/azul) na Tabela de Preços"
      placeholder="tol."
      defaultValue={valor ?? ''}
      onBlur={(e) => {
        const texto = e.target.value.trim();
        onAtualizar(texto === '' ? null : parseFloat(texto) || 0);
      }}
      className="num w-11 shrink-0 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1 py-1 text-right text-[var(--color-text)] placeholder:text-[9px]"
    />
  );
}

interface CategoryMarginsPanelProps {
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  canais: Canal[];
  onAtualizarCategoria: (categoriaId: string, campo: 'estadual' | 'interestadual', valor: number) => void;
  onAtualizarMargem: (categoriaId: string, canalId: string, valor: number) => void;
  /** valor null = apaga a tolerância (sem alerta pra essa categoria+canal). Só se aplica no modo "Por categoria". */
  onAtualizarTolerancia: (categoriaId: string, canalId: string, valor: number | null) => void;
  onRemoverCategoria: (categoriaId: string) => void;
  onAdicionarCategoria: (input: { nome: string; estadual: number; interestadual: number }) => void;
  onAdicionarSubcategoria: (categoriaId: string, nome: string) => void;
  onRenomearSubcategoria: (id: string, nome: string) => void;
  onRemoverSubcategoria: (id: string) => void;
  /** valor null = apaga o override, volta a herdar a margem da categoria pai. */
  onAtualizarMargemSubcategoria: (subcategoriaId: string, canalId: string, valor: number | null) => void;
  /** valor null = volta a calcular por categoria; um canalId = passa a mirar o mesmo Margem R$ desse outro canal. */
  onAtualizarMargemReferencia: (canalId: string, valor: string | null) => void;
  /** 0 = mira a Margem R$ da referência sem alteração; positivo/negativo ajusta esse % sobre o valor antes de virar a meta. */
  onAtualizarMargemReferenciaAjuste: (canalId: string, valor: number) => void;
}

export function CategoryMarginsPanel({
  categorias,
  subcategorias,
  canais,
  onAtualizarCategoria,
  onAtualizarMargem,
  onAtualizarTolerancia,
  onRemoverCategoria,
  onAdicionarCategoria,
  onAdicionarSubcategoria,
  onRenomearSubcategoria,
  onRemoverSubcategoria,
  onAtualizarMargemSubcategoria,
  onAtualizarMargemReferencia,
  onAtualizarMargemReferenciaAjuste,
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

  function nomeReferencia(canal: Canal): string | undefined {
    return canal.margemReferenciaCanalId ? canais.find((c) => c.id === canal.margemReferenciaCanalId)?.nome : undefined;
  }

  /**
   * Escolher `candidatoId` como referência de `canalId` criaria um ciclo (ex.:
   * Revenda PI já referencia Revenda CE — deixar a Revenda CE referenciar a
   * Revenda PI de volta é confuso, já que cada uma passaria a mirar a % "crua"
   * de Categoria da outra, não o que aparece de verdade na tela dela — ver
   * calculations.ts, `permitirReferencia`). Segue a cadeia de referências a
   * partir do candidato; se ela chegar de volta em `canalId`, bloqueia.
   */
  function criariCiclo(canalId: string, candidatoId: string): boolean {
    const porId = new Map(canais.map((c) => [c.id, c]));
    let atual: string | null = candidatoId;
    const visitados = new Set<string>();
    while (atual) {
      if (atual === canalId) return true;
      if (visitados.has(atual)) return false;
      visitados.add(atual);
      atual = porId.get(atual)?.margemReferenciaCanalId ?? null;
    }
    return false;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-[var(--color-text)]">Gerenciamento de Categorias</p>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="bg-[var(--color-navy)] text-left text-white">
                <th className="px-3 py-2 font-semibold">Categoria</th>
                <th className="w-56 border-r-2 border-white/20 px-2 py-2 text-center font-semibold" colSpan={2}>
                  Impostos
                </th>
                {canais.map((canal) => (
                  <th key={canal.id} className="border-l border-white/20 px-3 py-2 font-semibold">
                    {canal.nome} (%)
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[var(--color-line)] bg-[var(--color-page)]">
                <td className="px-3 py-1 text-[11px] font-semibold text-[var(--color-text-soft)]">Cálculo da margem sugerida</td>
                <td className="px-2 py-1 text-[11px] font-semibold text-[var(--color-text-soft)]">Estadual</td>
                <td className="border-r-2 border-[var(--color-line)] px-2 py-1 text-[11px] font-semibold text-[var(--color-text-soft)]">Interestadual</td>
                {canais.map((canal) => (
                  <td key={canal.id} className="border-l border-[var(--color-line)] px-3 py-1">
                    <div className="flex flex-col gap-1">
                      <select
                        value={canal.margemReferenciaCanalId ? 'referencia' : 'categoria'}
                        onChange={(e) => {
                          if (e.target.value === 'categoria') {
                            onAtualizarMargemReferencia(canal.id, null);
                          } else {
                            const outro = canais.find((c) => c.id !== canal.id && !criariCiclo(canal.id, c.id));
                            if (outro) onAtualizarMargemReferencia(canal.id, outro.id);
                          }
                        }}
                        className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-[11px] text-[var(--color-text)]"
                      >
                        <option value="categoria">Por categoria</option>
                        <option value="referencia">Por referência</option>
                      </select>
                      {canal.margemReferenciaCanalId && (
                        <div className="flex gap-1">
                          <select
                            value={canal.margemReferenciaCanalId}
                            onChange={(e) => onAtualizarMargemReferencia(canal.id, e.target.value)}
                            className="min-w-0 flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-[11px] text-[var(--color-text)]"
                          >
                            {canais
                              // Mantém a opção já selecionada na lista mesmo que ela hoje "criasse" um ciclo
                              // (ex.: as duas pontas de uma referência cruzada já configurada antes dessa
                              // trava existir) — só barra escolher uma NOVA opção que geraria confusão.
                              .filter((c) => c.id !== canal.id && (c.id === canal.margemReferenciaCanalId || !criariCiclo(canal.id, c.id)))
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.nome}
                                </option>
                              ))}
                          </select>
                          <input
                            type="number"
                            title="Ajuste (%) sobre a Margem R$ da referência — positivo ou negativo"
                            placeholder="0%"
                            value={canal.margemReferenciaAjustePct || ''}
                            onChange={(e) => onAtualizarMargemReferenciaAjuste(canal.id, parseFloat(e.target.value) || 0)}
                            className="w-12 shrink-0 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1 py-1 text-[11px] text-[var(--color-text)]"
                          />
                        </div>
                      )}
                    </div>
                  </td>
                ))}
                <td className="px-3 py-1" />
              </tr>
              {categorias.map((cat) => {
                const subsDaCategoria = subcategorias.filter((s) => s.categoriaId === cat.id);
                return (
                  <Fragment key={cat.id}>
                    <tr className="border-t border-[var(--color-line)]">
                      <td className="border-r-2 border-[var(--color-line)] bg-[var(--color-page)] px-3 py-1 font-semibold text-[var(--color-text)]">
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
                      <td className="w-28 px-2 py-1">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          defaultValue={cat.estadual}
                          onBlur={(e) => onAtualizarCategoria(cat.id, 'estadual', parseFloat(e.target.value) || 0)}
                          className="num w-20 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-right text-[var(--color-text)]"
                        />
                      </td>
                      <td className="w-28 border-r-2 border-[var(--color-line)] px-2 py-1">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          defaultValue={cat.interestadual}
                          onBlur={(e) => onAtualizarCategoria(cat.id, 'interestadual', parseFloat(e.target.value) || 0)}
                          className="num w-20 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-right text-[var(--color-text)]"
                        />
                      </td>
                      {canais.map((canal) => {
                        const referencia = nomeReferencia(canal);
                        return (
                          <td key={canal.id} className="border-l border-[var(--color-line)] px-3 py-1">
                            {referencia ? (
                              <div className="flex items-center gap-1">
                                <div className="min-w-0 flex-1 rounded-md border border-dashed border-[var(--color-line)] px-2 py-1 text-center text-[11px] font-semibold text-[var(--color-text)]">
                                  {referencia}
                                </div>
                                <CampoTolerancia
                                  valor={cat.tolerancias[canal.id]}
                                  onAtualizar={(valor) => onAtualizarTolerancia(cat.id, canal.id, valor)}
                                />
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  defaultValue={cat.margens[canal.id] ?? 20}
                                  onBlur={(e) => onAtualizarMargem(cat.id, canal.id, parseFloat(e.target.value) || 0)}
                                  className="num w-16 min-w-0 flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-right text-[var(--color-text)]"
                                />
                                <CampoTolerancia
                                  valor={cat.tolerancias[canal.id]}
                                  onAtualizar={(valor) => onAtualizarTolerancia(cat.id, canal.id, valor)}
                                />
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-1">
                        <button type="button" onClick={() => onRemoverCategoria(cat.id)} title="Deletar categoria" className="text-[var(--color-text-soft)] hover:text-bad">
                          🗑
                        </button>
                      </td>
                    </tr>
                    {subsDaCategoria.map((sub) => (
                      <tr key={sub.id} className="border-t border-[var(--color-line)]">
                        <td className="border-r-2 border-[var(--color-line)] bg-[var(--color-page)] py-1 pl-8 pr-3 text-[var(--color-text-soft)]">
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
                        <td className="px-3 py-1 text-center text-[var(--color-text-soft)]">—</td>
                        <td className="border-r-2 border-[var(--color-line)] px-3 py-1 text-center text-[var(--color-text-soft)]">—</td>
                        {canais.map((canal) => {
                          const referencia = nomeReferencia(canal);
                          return (
                            <td key={canal.id} className="border-l border-[var(--color-line)] px-3 py-1">
                              {referencia ? (
                                <div className="rounded-md border border-dashed border-[var(--color-line)] px-2 py-1 text-center text-[11px] font-semibold text-[var(--color-text)]">
                                  {referencia}
                                </div>
                              ) : (
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
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-1">
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
