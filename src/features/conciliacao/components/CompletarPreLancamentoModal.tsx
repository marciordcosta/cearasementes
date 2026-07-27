import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { fmtBRL, fmtDataBR } from '@/lib/format';
import type { LancamentoSistema } from '../types';

interface CompletarPreLancamentoModalProps {
  open: boolean;
  item: LancamentoSistema | null;
  onFechar: () => void;
  onSalvar: (dados: { cliente: string; documento: string; nf: string }) => void;
}

const campoClasse = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';

/**
 * "Baixa" do pré-lançamento (azul): o registro foi criado direto do OFX, sem
 * cliente/documento/NF ainda — aqui é onde essas três informações realmente
 * são digitadas. Diferente do InformarNfModal (pré-conciliação amarela), que
 * só pede NF porque o resto já vem certo do próprio Sistema.
 */
export function CompletarPreLancamentoModal({ open, item, onFechar, onSalvar }: CompletarPreLancamentoModalProps) {
  const [cliente, setCliente] = useState('');
  const [documento, setDocumento] = useState('');
  const [nf, setNf] = useState('');

  useEffect(() => {
    if (open && item) {
      setCliente(item.cliente ?? '');
      setDocumento(item.documento ?? '');
      setNf(item.nf ?? '');
    }
  }, [open, item]);

  function salvar() {
    if (!cliente.trim() || !documento.trim() || !nf.trim()) return;
    onSalvar({ cliente: cliente.trim(), documento: documento.trim(), nf: nf.trim() });
  }

  return (
    <Modal
      open={open}
      title="Completar pré-lançamento"
      onClose={onFechar}
      widthClassName="max-w-[420px]"
      footer={
        <>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={salvar}>
            Salvar
          </Button>
        </>
      }
    >
      {item && (
        <div className="space-y-3 text-sm">
          <p className="text-xs text-[var(--color-text-soft)]">Pagamento recebido sem registro no sistema, fazer lançamento e NF!</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-[var(--color-page)] px-3 py-2.5 text-xs">
            <span className="text-[var(--color-text-soft)]">Data</span>
            <span className="text-right font-semibold text-[var(--color-text)]">{item.data ? fmtDataBR(item.data) : '—'}</span>
            <span className="text-[var(--color-text-soft)]">Valor</span>
            <span className="num text-right font-semibold text-[var(--color-text)]">{fmtBRL.format(item.valor)}</span>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Cliente</label>
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} className={campoClasse} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Documento (pedido)</label>
              <input value={documento} onChange={(e) => setDocumento(e.target.value)} className={campoClasse} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">NF</label>
              <input value={nf} onChange={(e) => setNf(e.target.value)} className={campoClasse} />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
