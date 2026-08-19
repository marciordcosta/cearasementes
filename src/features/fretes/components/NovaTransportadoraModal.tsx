import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { NovaTransportadoraInput } from '../api';
import type { TipoValorFrete, Transportadora } from '../types';

interface NovaTransportadoraModalProps {
  open: boolean;
  /** Presente = modo edição (pré-preenche o form e muda os textos); ausente = cadastro novo. */
  editando?: Transportadora | null;
  onFechar: () => void;
  onSalvar: (input: NovaTransportadoraInput) => void;
}

const vazio: NovaTransportadoraInput = {
  nome: '',
  uf: '',
  valorPorKg: 0,
  valorPorNf: 0,
  valorPorNfTipo: 'percentual',
  taxaColeta: 0,
  taxaColetaTipo: 'fixo',
  freteMinimo: 0,
};

function paraInput(t: Transportadora): NovaTransportadoraInput {
  return {
    nome: t.nome,
    uf: t.uf,
    valorPorKg: t.valorPorKg,
    valorPorNf: t.valorPorNf,
    valorPorNfTipo: t.valorPorNfTipo,
    taxaColeta: t.taxaColeta,
    taxaColetaTipo: t.taxaColetaTipo,
    freteMinimo: t.freteMinimo,
  };
}

const campoClasse = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';

/**
 * Campo dual (Custo da NF / Taxa de Coleta): o valor é guardado como FRAÇÃO
 * quando o tipo é percentual (0,005 = 0,5%), igual ao resto do sistema —
 * mas digitar/ler uma fração direto no campo é um convite a erro (o campo
 * mostrava "0,005" e um usuário lia/editava achando que já era "0,5%").
 * Aqui a EXIBIÇÃO já vem multiplicada por 100 (digitar "1" = 1%, "0,5" =
 * 0,5%); a conversão de volta pra fração acontece só ao salvar no estado.
 */
function CampoValorDual({
  label,
  valor,
  tipo,
  onChangeValor,
  onChangeTipo,
}: {
  label: string;
  valor: number;
  tipo: TipoValorFrete;
  onChangeValor: (valorArmazenado: number) => void;
  onChangeTipo: (tipo: TipoValorFrete) => void;
}) {
  const exibicao = tipo === 'percentual' ? valor * 100 : valor;

  return (
    <div className="grid grid-cols-[1fr_110px] gap-2">
      <div>
        <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">
          {label} {tipo === 'percentual' ? '(%)' : '(R$)'}
        </label>
        <input
          type="number"
          step="0.01"
          value={exibicao}
          onChange={(e) => {
            const digitado = parseFloat(e.target.value) || 0;
            onChangeValor(tipo === 'percentual' ? digitado / 100 : digitado);
          }}
          className={campoClasse}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Tipo</label>
        <select
          value={tipo}
          onChange={(e) => {
            // Trocar o tipo (%/R$ fixo) SEM zerar o valor reinterpretava o número guardado sob a
            // unidade nova (ex.: R$ 50 fixo virava "50%" ao trocar pra percentual) — zera aqui,
            // forçando redigitar na unidade certa, em vez de arriscar um valor absurdo silencioso.
            onChangeValor(0);
            onChangeTipo(e.target.value as TipoValorFrete);
          }}
          className={campoClasse}
        >
          <option value="percentual" className="text-[var(--color-text)]">% do valor</option>
          <option value="fixo" className="text-[var(--color-text)]">R$ fixo</option>
        </select>
      </div>
    </div>
  );
}

export function NovaTransportadoraModal({ open, editando, onFechar, onSalvar }: NovaTransportadoraModalProps) {
  const [form, setForm] = useState<NovaTransportadoraInput>(vazio);

  useEffect(() => {
    if (open) setForm(editando ? paraInput(editando) : vazio);
  }, [open, editando]);

  function salvar() {
    if (!form.nome.trim() || !form.uf.trim()) return;
    onSalvar({ ...form, uf: form.uf.toUpperCase() });
  }

  return (
    <Modal
      open={open}
      title={editando ? `Editar — ${editando.nome} (${editando.uf})` : 'Nova Transportadora + Região'}
      onClose={onFechar}
      footer={
        <>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={salvar}>
            {editando ? 'Salvar alterações' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-[1fr_80px] gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Transportadora</label>
            <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} className={campoClasse} placeholder="Ex.: Cbirdex" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">UF</label>
            <input value={form.uf} onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value }))} maxLength={2} className={campoClasse} placeholder="CE" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Valor por Kg (R$)</label>
          <input type="number" step="0.01" value={form.valorPorKg} onChange={(e) => setForm((f) => ({ ...f, valorPorKg: parseFloat(e.target.value) || 0 }))} className={campoClasse} />
        </div>

        <CampoValorDual
          label="Custo da NF"
          valor={form.valorPorNf}
          tipo={form.valorPorNfTipo}
          onChangeValor={(v) => setForm((f) => ({ ...f, valorPorNf: v }))}
          onChangeTipo={(t) => setForm((f) => ({ ...f, valorPorNfTipo: t }))}
        />

        <CampoValorDual
          label="Taxa de Coleta"
          valor={form.taxaColeta}
          tipo={form.taxaColetaTipo}
          onChangeValor={(v) => setForm((f) => ({ ...f, taxaColeta: v }))}
          onChangeTipo={(t) => setForm((f) => ({ ...f, taxaColetaTipo: t }))}
        />

        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Frete Mínimo (R$)</label>
          <input type="number" step="0.01" value={form.freteMinimo} onChange={(e) => setForm((f) => ({ ...f, freteMinimo: parseFloat(e.target.value) || 0 }))} className={campoClasse} />
        </div>

        {!editando && <p className="text-xs text-[var(--color-text-soft)]">Depois de salvar, adicione as cidades atendidas (e o prazo de cada uma) clicando em "Cidades" na listagem.</p>}
      </div>
    </Modal>
  );
}
