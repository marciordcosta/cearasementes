import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { fmtBRL, fmtDataBR } from '@/lib/format';
import { CAMPO_CLASSE as campoClasse } from '../constants';
import type { LancamentoSistema } from '../types';

interface InformarNfModalProps {
  open: boolean;
  item: LancamentoSistema | null;
  onFechar: () => void;
  onSalvar: (nf: string) => void;
}

/**
 * Aparece pra completar um lançamento "pré-conciliado" (já travado junto com
 * o OFX, mas ainda sem NF — mostrado em amarelo nas grades). Cliente/data/
 * valor/documento só são exibidos (já vêm certos do próprio Sistema); o
 * campo NF começa em branco de propósito — documento e NF são números
 * diferentes, não dá pra usar um como palpite do outro.
 */
export function InformarNfModal({ open, item, onFechar, onSalvar }: InformarNfModalProps) {
  const [nf, setNf] = useState('');

  useEffect(() => {
    if (open) setNf('');
  }, [open, item]);

  function salvar() {
    if (!nf.trim()) return;
    onSalvar(nf.trim());
  }

  return (
    <Modal
      open={open}
      title="Informar NF — pré-conciliação"
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
          <p className="text-xs text-[var(--color-text-soft)]">Venda sem NF emitida, Emitir NF!</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-[var(--color-page)] px-3 py-2.5 text-xs">
            <span className="text-[var(--color-text-soft)]">Cliente</span>
            <span className="text-right font-semibold text-[var(--color-text)]">{item.cliente || '—'}</span>
            <span className="text-[var(--color-text-soft)]">Data</span>
            <span className="text-right font-semibold text-[var(--color-text)]">{item.data ? fmtDataBR(item.data) : '—'}</span>
            <span className="text-[var(--color-text-soft)]">Valor</span>
            <span className="num text-right font-semibold text-[var(--color-text)]">{fmtBRL.format(item.valor)}</span>
            {item.documento && (
              <>
                <span className="text-[var(--color-text-soft)]">Documento</span>
                <span className="text-right font-semibold text-[var(--color-text)]">{item.documento}</span>
              </>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">NF</label>
            <input value={nf} onChange={(e) => setNf(e.target.value)} className={campoClasse} autoFocus />
          </div>
        </div>
      )}
    </Modal>
  );
}
