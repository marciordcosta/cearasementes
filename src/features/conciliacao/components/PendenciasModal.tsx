import { Modal } from '@/components/ui/Modal';
import { fmtBRL, fmtDataBR } from '@/lib/format';
import type { LancamentoBanco, LancamentoSistema } from '../types';

interface PendenciasModalProps {
  open: boolean;
  titulo: string;
  /** Sempre de um tipo só (pré-conciliados OU pré-lançamentos) — cada linha detecta o próprio tipo pelo `origem` mesmo assim. */
  itens: LancamentoSistema[];
  banco: LancamentoBanco[];
  onFechar: () => void;
  onInformarNf: (item: LancamentoSistema) => void;
  onCompletarPreLancamento: (item: LancamentoSistema) => void;
}

export function PendenciasModal({ open, titulo, itens, banco, onFechar, onInformarNf, onCompletarPreLancamento }: PendenciasModalProps) {
  const temPreLancamento = itens.some((item) => item.origem === 'manual');
  return (
    <Modal open={open} title={titulo} onClose={onFechar} widthClassName="max-w-[640px]">
      <p className="mb-3 text-xs text-[var(--color-text-soft)]">
        {temPreLancamento ? (
          <>Lançamentos criados direto de um OFX sem par no Sistema — ainda faltam cliente, documento (pedido) e NF pra virar conciliação definitiva.</>
        ) : (
          <>Lançamentos já travados junto com o OFX — falta só a NF pra virar conciliação definitiva.</>
        )}
      </p>
      {itens.length === 0 ? (
        <p className="text-sm text-[var(--color-text-soft)]">Nenhuma pendência.</p>
      ) : (
        <div className="space-y-1.5">
          {itens.map((item) => {
            const ehPreLancamento = item.origem === 'manual';
            const registroOfx = item.grupoId ? banco.find((b) => b.grupoId === item.grupoId) : undefined;
            return (
              <div key={item.id} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${ehPreLancamento ? 'bg-[#E1EEFF]' : 'bg-[#FFF6DE]'}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-[var(--color-text)]">
                    {item.cliente || (ehPreLancamento ? 'Cliente não informado' : '—')}
                    {item.documento && <span className="ml-1 font-normal text-[var(--color-text-soft)]">· Doc {item.documento}</span>}
                  </div>
                  <div className="truncate text-xs text-[var(--color-text-soft)]">{item.data ? fmtDataBR(item.data) : '—'} · sem NF</div>
                  {registroOfx && <div className="truncate text-[10px] italic text-[var(--color-text-soft)]">OFX: {registroOfx.descricao || '—'}</div>}
                </div>
                <span className="num shrink-0 font-semibold">{fmtBRL.format(item.valor)}</span>
                <button
                  type="button"
                  onClick={() => (ehPreLancamento ? onCompletarPreLancamento(item) : onInformarNf(item))}
                  className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold text-white hover:brightness-110 ${ehPreLancamento ? 'bg-[#1E5FA8]' : 'bg-[#8a6d1f]'}`}
                >
                  {ehPreLancamento ? 'Completar dados' : 'Informar NF'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
