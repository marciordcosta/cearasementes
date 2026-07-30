import { RotateCcw } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { fmtBRL, fmtDataBR } from '@/lib/format';
import type { LancamentoBanco, LancamentoSistema } from '../types';
import type { ItemFixo } from './SugestoesPainel';

interface DescartadosModalProps {
  open: boolean;
  onFechar: () => void;
  itemFixo: ItemFixo | null;
  pares: { bancoId: string; sistemaId: string }[];
  banco: LancamentoBanco[];
  sistema: LancamentoSistema[];
  onRestaurar: (bancoId: string, sistemaId: string) => void;
  /** Concilia esse par direto daqui (mesma regra de NF do painel de sugestões — pode abrir o aviso de "sem NF" antes de efetivar). */
  onConciliar: (bancoId: string, sistemaId: string) => void;
}

function linhaBanco(b: LancamentoBanco) {
  return [b.bancoNome, b.descricao || '—', fmtDataBR(b.data), fmtBRL.format(b.valor)].filter(Boolean).join(' · ');
}

function linhaSistema(s: LancamentoSistema) {
  return [s.cliente || '—', s.data ? fmtDataBR(s.data) : '—', fmtBRL.format(s.valor), s.documento ? `Doc ${s.documento}` : null, s.nf ? `NF ${s.nf}` : null].filter(Boolean).join(' · ');
}

/**
 * Sugestões descartadas (o "x" ao lado de "Conciliar" no painel) pro registro
 * atualmente selecionado — cada card abaixo é um candidato que já foi
 * descartado especificamente contra ELE; "Restaurar" volta a considerar o
 * par, "Conciliar" liga os dois direto (mesma regra de NF de sempre).
 */
export function DescartadosModal({ open, onFechar, itemFixo, pares, banco, sistema, onRestaurar, onConciliar }: DescartadosModalProps) {
  return (
    <Modal
      open={open}
      onClose={onFechar}
      widthClassName="max-w-[640px]"
      title={
        <div className="min-w-0">
          <div className="truncate">Sugestões descartadas</div>
          {itemFixo && (
            <div className="truncate text-[11px] font-normal text-white/60">
              {itemFixo.direcao === 'banco' ? 'Banco' : 'Sistema'} · {itemFixo.direcao === 'banco' ? linhaBanco(itemFixo.item) : linhaSistema(itemFixo.item)}
            </div>
          )}
        </div>
      }
    >
      {pares.length === 0 ? (
        <p className="text-sm text-[var(--color-text-soft)]">Nenhuma sugestão descartada pra este registro.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {pares.map(({ bancoId, sistemaId }) => {
            const b = banco.find((x) => x.id === bancoId);
            const s = sistema.find((x) => x.id === sistemaId);
            const candidatoEhSistema = itemFixo?.direcao === 'banco';
            return (
              <div key={`${bancoId}-${sistemaId}`} className="flex flex-col gap-2 rounded-lg bg-[var(--color-page)] px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="mr-1 text-[10px] font-semibold uppercase text-[var(--color-text-soft)]">{candidatoEhSistema ? 'Sistema' : 'Banco'} · </span>
                  <span className="font-semibold text-[var(--color-text)]">
                    {candidatoEhSistema ? (s ? linhaSistema(s) : '(excluído)') : b ? linhaBanco(b) : '(excluído)'}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onRestaurar(bancoId, sistemaId)}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-line)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-soft)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                    title="Voltar a considerar esse par nas sugestões"
                  >
                    <RotateCcw size={12} />
                    Restaurar
                  </button>
                  <button
                    type="button"
                    onClick={() => onConciliar(bancoId, sistemaId)}
                    disabled={!b || !s}
                    className="shrink-0 whitespace-nowrap rounded-full bg-[var(--color-accent)] px-2.5 py-1 text-xs font-semibold text-white hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Conciliar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
