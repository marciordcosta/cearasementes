import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { NovoLancamentoManual } from '../types';

interface NovoLancamentoManualModalProps {
  open: boolean;
  onFechar: () => void;
  onSalvar: (input: NovoLancamentoManual) => void;
}

const vazio: NovoLancamentoManual = { data: '', valor: 0, cliente: '', nf: '' };
const campoClasse = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';

export function NovoLancamentoManualModal({ open, onFechar, onSalvar }: NovoLancamentoManualModalProps) {
  const [form, setForm] = useState<NovoLancamentoManual>(vazio);

  function salvar() {
    if (!form.data || !form.valor || !form.cliente.trim()) return;
    onSalvar(form);
    setForm(vazio);
  }

  return (
    <Modal
      open={open}
      title="Novo Lançamento Manual (Sistema)"
      onClose={onFechar}
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
      <div className="space-y-3 text-sm">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Data</label>
          <input type="date" value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} className={campoClasse} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Valor (negativo = saída)</label>
          <input type="number" step="0.01" value={form.valor || ''} onChange={(e) => setForm((f) => ({ ...f, valor: parseFloat(e.target.value) || 0 }))} className={campoClasse} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Cliente</label>
          <input value={form.cliente} onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))} className={campoClasse} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">NF</label>
          <input value={form.nf} onChange={(e) => setForm((f) => ({ ...f, nf: e.target.value }))} className={campoClasse} />
        </div>
      </div>
    </Modal>
  );
}
