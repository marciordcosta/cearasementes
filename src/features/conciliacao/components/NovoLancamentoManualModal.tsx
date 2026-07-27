import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { CAMPO_CLASSE as campoClasse } from '../constants';
import type { FormaPagamento, NovoLancamentoManual } from '../types';

interface NovoLancamentoManualModalProps {
  open: boolean;
  /** Pré-preenche o formulário com os dados do OFX selecionado (data, valor, forma de pagamento) — usuário ainda pode editar tudo antes de salvar. */
  valoresIniciais?: Partial<NovoLancamentoManual>;
  onFechar: () => void;
  onSalvar: (input: NovoLancamentoManual) => void;
}

const vazio: NovoLancamentoManual = { data: '', valor: 0, formaPagamento: 'OUTRO', cliente: '', documento: '', nf: '' };

const OPCOES_FORMA_PAGAMENTO: FormaPagamento[] = ['PIX', 'CARTAO', 'BOLETO', 'CHEQUE', 'RENDIMENTO', 'OUTRO'];

/**
 * Único ponto de criação de lançamento manual no Sistema — sempre disparado
 * a partir de um OFX selecionado no painel de Sugestões (o "+" direto foi
 * removido). Data/valor/forma de pagamento vêm pré-preenchidos do próprio
 * OFX; cliente/documento(pedido)/NF ficam em branco de propósito — dá pra
 * preencher já se souber, ou completar depois na baixa do "pré-lançamento"
 * (por isso não são obrigatórios pra salvar).
 */
export function NovoLancamentoManualModal({ open, valoresIniciais, onFechar, onSalvar }: NovoLancamentoManualModalProps) {
  const [form, setForm] = useState<NovoLancamentoManual>(vazio);

  useEffect(() => {
    if (open) setForm({ ...vazio, ...valoresIniciais });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function salvar() {
    if (!form.data || !form.valor) return;
    onSalvar(form);
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Data</label>
            <input type="date" value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} className={campoClasse} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Valor (negativo = saída)</label>
            <input type="number" step="0.01" value={form.valor || ''} onChange={(e) => setForm((f) => ({ ...f, valor: parseFloat(e.target.value) || 0 }))} className={campoClasse} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Forma de pagamento</label>
          <select value={form.formaPagamento} onChange={(e) => setForm((f) => ({ ...f, formaPagamento: e.target.value as FormaPagamento }))} className={campoClasse}>
            {OPCOES_FORMA_PAGAMENTO.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Cliente</label>
          <input value={form.cliente} onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))} className={campoClasse} placeholder="Pode completar depois" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Documento (pedido)</label>
            <input value={form.documento} onChange={(e) => setForm((f) => ({ ...f, documento: e.target.value }))} className={campoClasse} placeholder="Pode completar depois" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">NF</label>
            <input value={form.nf} onChange={(e) => setForm((f) => ({ ...f, nf: e.target.value }))} className={campoClasse} placeholder="Pode completar depois" />
          </div>
        </div>
      </div>
    </Modal>
  );
}
