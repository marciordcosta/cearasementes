import { X } from 'lucide-react';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { fmtBRL, fmtDataBR } from '@/lib/format';
import { CAMPO_CLASSE as campoClasse } from '../constants';
import type { LancamentoBanco, LancamentoSistema } from '../types';

interface PendenciasBancoModalProps {
  open: boolean;
  onFechar: () => void;
  /** Seção 1 — vendas do Sistema pré-conciliadas com o Banco, ainda sem NF. */
  semNf: LancamentoSistema[];
  banco: LancamentoBanco[];
  onInformarNf: (item: LancamentoSistema) => void;
  /** Seção 2 — lançamento(s) do Banco cujo grupo teve o aviso de valor/forma de pagamento diferentes confirmado, ainda não dispensado. */
  divergencia: LancamentoBanco[];
  /** grupoId -> texto do aviso — só os pendentes (já filtrado por quem chama). */
  avisoPorGrupo: Map<string, string>;
  onDispensarAviso: (grupoId: string) => void;
  /** Seção 3 — lançamento(s) do Banco com observação (informação adicional) preenchida. */
  observacao: LancamentoBanco[];
  onSalvarObservacao: (id: string, texto: string) => void;
  onExcluirObservacao: (id: string) => void;
}

/** Card de observação com edição inline (textarea + Salvar/Excluir direto no card, sem abrir outro modal) — usado só dentro da seção 3. */
function CardObservacao({
  item,
  onSalvar,
  onExcluir,
}: {
  item: LancamentoBanco;
  onSalvar: (id: string, texto: string) => void;
  onExcluir: (id: string) => void;
}) {
  const [texto, setTexto] = useState(item.observacao ?? '');

  return (
    <div className="rounded-lg bg-[#EFEAFB] px-3 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-[var(--color-text)]" title={item.descricao ?? ''}>
            {item.descricao || '—'}
          </div>
          <div className="truncate text-xs text-[var(--color-text-soft)]">{fmtDataBR(item.data)}</div>
        </div>
        <span className="num shrink-0 font-semibold">{fmtBRL.format(item.valor)}</span>
      </div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={2}
        className={`${campoClasse} mt-2 resize-none bg-white text-xs`}
      />
      <div className="mt-1.5 flex justify-end gap-2">
        <button type="button" onClick={() => onExcluir(item.id)} className="rounded-md border border-bad/40 px-2.5 py-1 text-xs font-semibold text-bad hover:bg-bad-soft">
          Excluir
        </button>
        <button type="button" onClick={() => onSalvar(item.id, texto)} className="rounded-md bg-[#5B3FA6] px-2.5 py-1 text-xs font-semibold text-white hover:brightness-110">
          Salvar
        </button>
      </div>
    </div>
  );
}

/**
 * Pendências do Banco (OFX) — 3 seções, nessa ordem: vendas sem NF, conciliações
 * divergentes e registros com informações extras. Só o Banco tem essas 3
 * categorias (o Sistema continua com o próprio modal simples de pré-lançamentos).
 */
export function PendenciasBancoModal({
  open,
  onFechar,
  semNf,
  banco,
  onInformarNf,
  divergencia,
  avisoPorGrupo,
  onDispensarAviso,
  observacao,
  onSalvarObservacao,
  onExcluirObservacao,
}: PendenciasBancoModalProps) {
  const semPendencias = semNf.length === 0 && divergencia.length === 0 && observacao.length === 0;

  return (
    <Modal open={open} title="Pendências — Banco (OFX)" onClose={onFechar} widthClassName="max-w-[640px]">
      {semPendencias ? (
        <p className="text-sm text-[var(--color-text-soft)]">Nenhuma pendência.</p>
      ) : (
        <div className="space-y-5">
          {semNf.length > 0 && (
            <section>
              <p className="mb-2 text-sm font-bold text-[var(--color-text)]">Vendas sem nota fiscal, emita!</p>
              <div className="space-y-1.5">
                {semNf.map((item) => {
                  const registroOfx = item.grupoId ? banco.find((b) => b.grupoId === item.grupoId) : undefined;
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-[#FFF6DE] px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-[var(--color-text)]">
                          {item.cliente || '—'}
                          {item.documento && <span className="ml-1 font-normal text-[var(--color-text-soft)]">· Doc {item.documento}</span>}
                        </div>
                        <div className="truncate text-xs text-[var(--color-text-soft)]">{item.data ? fmtDataBR(item.data) : '—'} · sem NF</div>
                        {registroOfx && <div className="truncate text-[10px] italic text-[var(--color-text-soft)]">OFX: {registroOfx.descricao || '—'}</div>}
                      </div>
                      <span className="num shrink-0 font-semibold">{fmtBRL.format(item.valor)}</span>
                      <button
                        type="button"
                        onClick={() => onInformarNf(item)}
                        className="shrink-0 whitespace-nowrap rounded-full bg-[#8a6d1f] px-2.5 py-1 text-xs font-semibold text-white hover:brightness-110"
                      >
                        Informar NF
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {divergencia.length > 0 && (
            <section>
              <p className="mb-2 text-sm font-bold text-[var(--color-text)]">Conciliações divergentes</p>
              <div className="space-y-1.5">
                {divergencia.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-2 rounded-lg bg-[#FDEEDC] px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-[var(--color-text)]" title={item.descricao ?? ''}>
                        {item.descricao || '—'}
                      </div>
                      <div className="truncate text-xs text-[var(--color-text-soft)]">
                        {fmtDataBR(item.data)} · {fmtBRL.format(item.valor)}
                      </div>
                      {item.grupoId && <div className="mt-1 text-xs text-[#B8860B]">{avisoPorGrupo.get(item.grupoId)}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => item.grupoId && onDispensarAviso(item.grupoId)}
                      className="shrink-0 text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
                      title="Dispensar notificação (o aviso continua no lançamento)"
                    >
                      <X size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {observacao.length > 0 && (
            <section>
              <p className="mb-2 text-sm font-bold text-[var(--color-text)]">Registros com informações extras</p>
              <div className="space-y-2">
                {observacao.map((item) => (
                  <CardObservacao key={item.id} item={item} onSalvar={onSalvarObservacao} onExcluir={onExcluirObservacao} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
