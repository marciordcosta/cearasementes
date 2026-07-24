import { Card } from '@/components/ui/Card';
import { fmtBRL } from '@/lib/format';
import type { LancamentoSistema } from '../types';

interface ListaSistemaProps {
  itens: LancamentoSistema[];
  selecionados: Set<string>;
  busca: string;
  onChangeBusca: (busca: string) => void;
  onToggleSelecionado: (id: string) => void;
  onToggleDesativado: (item: LancamentoSistema) => void;
  onConciliarManual: (item: LancamentoSistema) => void;
  onCancelarConciliacao: (grupoId: string) => void;
  onAdicionarManual: () => void;
}

export function ListaSistema({ itens, selecionados, busca, onChangeBusca, onToggleSelecionado, onToggleDesativado, onConciliarManual, onCancelarConciliacao, onAdicionarManual }: ListaSistemaProps) {
  return (
    <Card className="flex max-h-[calc(100vh-320px)] flex-col overflow-hidden p-0">
      <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text)]">
          Sistema (Max Data)
          <button type="button" onClick={onAdicionarManual} title="Adicionar lançamento manual" className="text-lg leading-none text-[var(--color-accent)] hover:opacity-70">
            +
          </button>
        </span>
        <input value={busca} onChange={(e) => onChangeBusca(e.target.value)} placeholder="pesquisar…" className="w-40 rounded-md border border-[var(--color-line)] bg-[var(--color-page)] px-2.5 py-1.5 text-sm text-[var(--color-text)]" />
      </div>
      <div className="overflow-y-auto">
        {itens.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-2.5 border-b border-[var(--color-line)] px-4 py-2 text-sm ${item.desativado ? 'opacity-40 grayscale' : ''} ${item.conciliado ? 'bg-good-soft' : selecionados.has(item.id) ? 'bg-[#cce5ff]' : ''}`}
          >
            {!item.conciliado && !item.desativado && item.origem !== 'taxa_automatica' && (
              <input type="checkbox" checked={selecionados.has(item.id)} onChange={() => onToggleSelecionado(item.id)} className="accent-[var(--color-navy)]" />
            )}
            <span className="w-20 shrink-0 text-xs text-[var(--color-text-soft)]">{item.data ? formatarDataBR(item.data) : '—'}</span>
            <span className="min-w-0 flex-1 truncate text-[var(--color-text)]" title={item.cliente ?? ''}>
              {item.cliente || '—'}
              {item.nf && <span className="ml-1.5 text-xs text-[var(--color-text-soft)]">NF {item.nf}</span>}
            </span>
            <span className={`num w-24 shrink-0 text-right font-semibold ${item.valor < 0 ? 'text-bad' : 'text-good'}`}>{fmtBRL.format(item.valor)}</span>

            {item.conciliado ? (
              item.origem === 'taxa_automatica' ? (
                <span className="w-20 shrink-0 text-right text-xs text-[var(--color-text-soft)]">automático</span>
              ) : (
                <button
                  type="button"
                  onClick={() => item.grupoId && onCancelarConciliacao(item.grupoId)}
                  className="shrink-0 text-xs font-semibold text-[var(--color-text-soft)] hover:text-bad"
                  title="Desfazer conciliação"
                >
                  ↩ Desfazer
                </button>
              )
            ) : (
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => onConciliarManual(item)}
                  className="text-xs font-semibold text-[var(--color-accent)] hover:underline"
                  title="Conciliar sem lançamento correspondente no banco (ex.: dinheiro em espécie)"
                >
                  Conciliar manual
                </button>
                <button type="button" onClick={() => onToggleDesativado(item)} className="text-xs text-[var(--color-text-soft)] hover:text-[var(--color-text)]" title={item.desativado ? 'Reativar' : 'Desativar'}>
                  {item.desativado ? '↺' : '⊘'}
                </button>
              </div>
            )}
          </div>
        ))}
        {itens.length === 0 && <p className="px-4 py-6 text-center text-sm text-[var(--color-text-soft)]">Nenhum lançamento.</p>}
      </div>
    </Card>
  );
}

function formatarDataBR(iso: string): string {
  const partes = iso.split('-');
  if (partes.length !== 3) return iso;
  const [y, m, d] = partes;
  return `${d}/${m}/${y}`;
}
