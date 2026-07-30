import { Modal } from '@/components/ui/Modal';
import { fmtBRL, fmtDataBR } from '@/lib/format';
import type { LancamentoBanco, LancamentoSistema } from '../types';
import { CardObservacao } from './CardObservacao';

interface PendenciasModalProps {
  open: boolean;
  titulo: string;
  /** Sempre de um tipo só (pré-conciliados OU pré-lançamentos) — cada linha detecta o próprio tipo pelo `origem` mesmo assim. */
  itens: LancamentoSistema[];
  banco: LancamentoBanco[];
  onFechar: () => void;
  onInformarNf: (item: LancamentoSistema) => void;
  onCompletarPreLancamento: (item: LancamentoSistema) => void;
  /** Lançamento(s) do Sistema com observação (informação adicional) preenchida — mesma regra do Banco. */
  observacao: LancamentoSistema[];
  onSalvarObservacao: (id: string, texto: string) => void;
  onExcluirObservacao: (id: string) => void;
  /** Filtra a grade do Sistema só por esse registro — não fecha o modal. */
  onFiltrarObservacao: (id: string) => void;
}

export function PendenciasModal({
  open,
  titulo,
  itens,
  banco,
  onFechar,
  onInformarNf,
  onCompletarPreLancamento,
  observacao,
  onSalvarObservacao,
  onExcluirObservacao,
  onFiltrarObservacao,
}: PendenciasModalProps) {
  const temPreLancamento = itens.some((item) => item.origem === 'manual');
  const semPendencias = itens.length === 0 && observacao.length === 0;
  return (
    <Modal open={open} title={titulo} onClose={onFechar} widthClassName="max-w-[640px]">
      {semPendencias ? (
        <p className="text-sm text-[var(--color-text-soft)]">Nenhuma pendência.</p>
      ) : (
        <div className="space-y-5">
          {itens.length > 0 && (
            <section>
              <p className="mb-2 text-sm font-bold text-[var(--color-text)]">
                {temPreLancamento ? <>Pagamento recebido sem registro no sistema, fazer lançamento e NF!</> : <>Venda sem NF emitida, Emitir NF!</>}
              </p>
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
            </section>
          )}

          {observacao.length > 0 && (
            <section>
              <p className="mb-2 text-sm font-bold text-[var(--color-text)]">Registros com informações extras</p>
              <div className="space-y-2">
                {observacao.map((item) => (
                  <CardObservacao key={item.id} item={item} onSalvar={onSalvarObservacao} onExcluir={onExcluirObservacao} onFiltrar={onFiltrarObservacao} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
