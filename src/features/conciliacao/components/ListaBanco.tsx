import { Card } from '@/components/ui/Card';
import { fmtBRL } from '@/lib/format';
import type { LancamentoBanco } from '../types';

const CORES_FORMA_PAGAMENTO: Record<string, string> = {
  PIX: '#1E90FF',
  CARTAO: '#28a745',
  BOLETO: '#dc3545',
  CHEQUE: '#ffa322',
  RENDIMENTO: '#ff7ccd',
  OUTRO: '#999999',
};

interface ListaBancoProps {
  itens: LancamentoBanco[];
  selecionados: Set<string>;
  busca: string;
  onChangeBusca: (busca: string) => void;
  onToggleSelecionado: (id: string) => void;
  onVerSugestoes: (item: LancamentoBanco) => void;
  onToggleDesativado: (item: LancamentoBanco) => void;
  onCancelarConciliacao: (grupoId: string) => void;
}

export function ListaBanco({ itens, selecionados, busca, onChangeBusca, onToggleSelecionado, onVerSugestoes, onToggleDesativado, onCancelarConciliacao }: ListaBancoProps) {
  return (
    <Card className="flex max-h-[calc(100vh-320px)] flex-col overflow-hidden p-0">
      <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
        <span className="text-sm font-semibold text-[var(--color-text)]">Banco (OFX)</span>
        <input value={busca} onChange={(e) => onChangeBusca(e.target.value)} placeholder="pesquisar…" className="w-40 rounded-md border border-[var(--color-line)] bg-[var(--color-page)] px-2.5 py-1.5 text-sm text-[var(--color-text)]" />
      </div>
      <div className="overflow-y-auto">
        {itens.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-2.5 border-b border-[var(--color-line)] px-4 py-2 text-sm ${item.desativado ? 'opacity-40 grayscale' : ''} ${item.conciliado ? 'bg-good-soft' : selecionados.has(item.id) ? 'bg-[#cce5ff]' : ''}`}
          >
            {!item.conciliado && !item.desativado && (
              <input type="checkbox" checked={selecionados.has(item.id)} onChange={() => onToggleSelecionado(item.id)} className="accent-[var(--color-navy)]" />
            )}
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CORES_FORMA_PAGAMENTO[item.formaPagamento] }} />
            <span className="w-20 shrink-0 text-xs text-[var(--color-text-soft)]">{formatarDataBR(item.data)}</span>
            <span className="min-w-0 flex-1 truncate text-[var(--color-text)]" title={item.descricao ?? ''}>
              {item.descricao || '—'}
              {item.marcado && <span className="ml-1.5 text-[10px] font-semibold text-[#c98a1e]">● marcado</span>}
            </span>
            <span className={`num w-24 shrink-0 text-right font-semibold ${item.valor < 0 ? 'text-bad' : 'text-good'}`}>{fmtBRL.format(item.valor)}</span>

            {item.conciliado ? (
              <button
                type="button"
                onClick={() => item.grupoId && onCancelarConciliacao(item.grupoId)}
                className="shrink-0 text-xs font-semibold text-[var(--color-text-soft)] hover:text-bad"
                title="Desfazer conciliação"
              >
                ↩ Desfazer
              </button>
            ) : (
              <div className="flex shrink-0 gap-1.5">
                <button type="button" onClick={() => onVerSugestoes(item)} className="text-xs font-semibold text-[var(--color-accent)] hover:underline" title="Ver sugestões de conciliação">
                  Sugestões
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
