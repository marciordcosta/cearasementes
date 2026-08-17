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
  onRemoverSubcategoria: (id: string) => void;
  /** valor null = apaga o override, volta a herdar a margem da categoria pai. */
  onAtualizarMargemSubcategoria: (subcategoriaId: string, canalId: string, valor: number | null) => void;
  /** null = essa categoria ainda não escolheu (ou volta a não ter) referência pra esse canal. */
  onAtualizarCategoriaReferencia: (categoriaId: string, canalId: string, valor: string | null) => void;
  /** 0 = mira a Margem R$ da referência sem alteração; positivo/negativo ajusta esse % sobre o valor antes de virar a meta. */
  onAtualizarCategoriaReferenciaAjuste: (categoriaId: string, canalId: string, valor: number) => void;
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
  onRemoverSubcategoria,
  onAtualizarMargemSubcategoria,
  onAtualizarCategoriaReferencia,
  onAtualizarCategoriaReferenciaAjuste,
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

  /**
   * Escolher `candidatoId` como referência de `canalId` PARA ESSA CATEGORIA criaria um ciclo
   * (ex.: nessa categoria, Revenda PI já referencia Revenda CE — deixar a Revenda CE referenciar
   * a Revenda PI de volta é confuso, já que cada uma passaria a mirar a % "crua" de Categoria da
   * outra, não o que aparece de verdade na tela dela — ver calculations.ts, `permitirReferencia`).
   * Cada categoria tem sua própria cadeia de referências (categoria.referenciaCanalId), então o
   * mesmo par de Tabelas pode ser cíclico numa categoria e não ser em outra.
   */
  function criariCiclo(categoria: Categoria, canalId: string, candidatoId: string): boolean {
    let atual: string | null = candidatoId;
    const visitados = new Set<string>();
    while (atual) {
      if (atual === canalId) return true;
      if (visitados.has(atual)) return false;
      visitados.add(atual);
      atual = categoria.referenciaCanalId[atual] ?? null;
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
                  <th key={canal.id} className="border-l border-white/20 px-3 py-2 text-center font-semibold" colSpan={canal.margemPorReferencia ? 3 : 2}>
                    {canal.nome} (%)
                  </th>
                ))}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[var(--color-line)] bg-[var(--color-page)]">
                <td className="px-3 py-1" />
                <td className="px-2 py-1 text-[11px] font-semibold text-[var(--color-text-soft)]">Estadual</td>
                <td className="border-r-2 border-[var(--color-line)] px-2 py-1 text-[11px] font-semibold text-[var(--color-text-soft)]">Interestadual</td>
                {canais.map((canal) =>
                  canal.margemPorReferencia ? (
                    <Fragment key={canal.id}>
                      <td className="border-l border-[var(--color-line)] px-2 py-1 text-[10px] font-semibold text-[var(--color-text-soft)]">Tabela</td>
                      <td className="px-1 py-1 text-[10px] font-semibold text-[var(--color-text-soft)]">Ajuste</td>
                      <td className="px-1 py-1 text-[10px] font-semibold text-[var(--color-text-soft)]">Tol.</td>
                    </Fragment>
                  ) : (
                    <Fragment key={canal.id}>
                      <td className="border-l border-[var(--color-line)] px-2 py-1 text-[10px] font-semibold text-[var(--color-text-soft)]">Margem</td>
                      <td className="px-1 py-1 text-[10px] font-semibold text-[var(--color-text-soft)]">Tol.</td>
                    </Fragment>
                  ),
                )}
                <td className="px-3 py-1" />
              </tr>
              {categorias.map((cat) => {
                const subsDaCategoria = subcategorias.filter((s) => s.categoriaId === cat.id);
                return (
                  <Fragment key={cat.id}>
                    <tr className="border-t border-[var(--color-line)]">
                      <td className="border-r-2 border-[var(--color-line)] bg-[var(--color-page)] px-3 py-1 font-semibold text-[var(--color-text)]">
                        {cat.nome}
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
                      {canais.map((canal) =>
                        canal.margemPorReferencia ? (
                          <Fragment key={canal.id}>
                            <td className="border-l border-[var(--color-line)] px-2 py-1">
                              <select
                                value={cat.referenciaCanalId[canal.id] ?? ''}
                                onChange={(e) => onAtualizarCategoriaReferencia(cat.id, canal.id, e.target.value || null)}
                                className="w-full min-w-0 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-[11px] text-[var(--color-text)]"
                              >
                                <option value="">— selecione —</option>
                                {canais
                                  // Mantém a opção já selecionada na lista mesmo que ela hoje "criasse" um ciclo
                                  // (ex.: as duas pontas de uma referência cruzada já configurada antes dessa
                                  // trava existir) — só barra escolher uma NOVA opção que geraria confusão.
                                  .filter((c) => c.id !== canal.id && (c.id === cat.referenciaCanalId[canal.id] || !criariCiclo(cat, canal.id, c.id)))
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.nome}
                                    </option>
                                  ))}
                              </select>
                            </td>
                            <td className="px-1 py-1">
                              <input
                                type="number"
                                title="Ajuste (%) sobre a Margem R$ da referência — positivo ou negativo"
                                placeholder="0%"
                                defaultValue={cat.referenciaAjustePct[canal.id] || ''}
                                onBlur={(e) => onAtualizarCategoriaReferenciaAjuste(cat.id, canal.id, parseFloat(e.target.value) || 0)}
                                className="w-14 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1 py-1 text-[11px] text-[var(--color-text)]"
                              />
                            </td>
                            <td className="px-1 py-1">
                              <CampoTolerancia
                                valor={cat.tolerancias[canal.id]}
                                onAtualizar={(valor) => onAtualizarTolerancia(cat.id, canal.id, valor)}
                              />
                            </td>
                          </Fragment>
                        ) : (
                          <Fragment key={canal.id}>
                            <td className="border-l border-[var(--color-line)] px-2 py-1">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                defaultValue={cat.margens[canal.id] ?? 20}
                                onBlur={(e) => onAtualizarMargem(cat.id, canal.id, parseFloat(e.target.value) || 0)}
                                className="num w-20 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-right text-[var(--color-text)]"
                              />
                            </td>
                            <td className="px-1 py-1">
                              <CampoTolerancia
                                valor={cat.tolerancias[canal.id]}
                                onAtualizar={(valor) => onAtualizarTolerancia(cat.id, canal.id, valor)}
                              />
                            </td>
                          </Fragment>
                        ),
                      )}
                      <td className="px-3 py-1">
                        <button type="button" onClick={() => onRemoverCategoria(cat.id)} title="Deletar categoria" className="text-[var(--color-text-soft)] hover:text-bad">
                          🗑
                        </button>
                      </td>
                    </tr>
                    {subsDaCategoria.map((sub) => (
                      <tr key={sub.id} className="border-t border-[var(--color-line)]">
                        <td
                          className="border-r-2 border-[var(--color-line)] bg-[var(--color-page)] py-1 pl-8 pr-3 text-[var(--color-text-soft)]"
                          title="Nome vem do campo Processo, em Editar Produto — não é editável aqui"
                        >
                          {sub.nome}
                        </td>
                        <td className="px-3 py-1 text-center text-[var(--color-text-soft)]">—</td>
                        <td className="border-r-2 border-[var(--color-line)] px-3 py-1 text-center text-[var(--color-text-soft)]">—</td>
                        {canais.map((canal) =>
                          canal.margemPorReferencia ? (
                            // Segue a referência escolhida pela categoria mãe — nada pra configurar aqui.
                            <Fragment key={canal.id}>
                              <td className="border-l border-[var(--color-line)] px-2 py-1 text-center text-[var(--color-text-soft)]">—</td>
                              <td className="px-1 py-1 text-center text-[var(--color-text-soft)]">—</td>
                              <td className="px-1 py-1 text-center text-[var(--color-text-soft)]">—</td>
                            </Fragment>
                          ) : (
                            <Fragment key={canal.id}>
                              <td className="border-l border-[var(--color-line)] px-2 py-1">
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
                              <td className="px-1 py-1 text-center text-[var(--color-text-soft)]">—</td>
                            </Fragment>
                          ),
                        )}
                        <td className="px-3 py-1">
                          <button type="button" onClick={() => onRemoverSubcategoria(sub.id)} title="Deletar subcategoria" className="text-[var(--color-text-soft)] hover:text-bad">
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
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
