import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { CAMPO_CLASSE as campoClasse } from '../constants';
import { NOMES_FORMA_REGRA, type FormaRegra, type RegraConciliacao } from '../regras';

interface RegrasConciliacaoModalProps {
  open: boolean;
  regras: Record<FormaRegra, RegraConciliacao>;
  onFechar: () => void;
  onSalvar: (regras: RegraConciliacao[]) => Promise<void>;
}

const ORDEM: FormaRegra[] = ['PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'BOLETO', 'CHEQUE'];

export function RegrasConciliacaoModal({ open, regras, onFechar, onSalvar }: RegrasConciliacaoModalProps) {
  const [form, setForm] = useState(regras);
  const [salvando, setSalvando] = useState(false);

  // Recarrega o formulário com os valores atuais toda vez que o modal abre —
  // se o usuário cancelar no meio de uma edição e abrir de novo, começa do
  // que está salvo, não do rascunho anterior.
  useEffect(() => {
    if (open) setForm(regras);
  }, [open, regras]);

  function atualizar<K extends keyof RegraConciliacao>(forma: FormaRegra, campo: K, valor: RegraConciliacao[K]) {
    setForm((f) => ({ ...f, [forma]: { ...f[forma], [campo]: valor } }));
  }

  async function salvar() {
    setSalvando(true);
    try {
      await onSalvar(ORDEM.map((forma) => form[forma]));
      onFechar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Regras de Conciliação"
      onClose={onFechar}
      widthClassName="max-w-[920px]"
      footer={
        <>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-xs text-[var(--color-text-soft)]">
        Parâmetros usados nas sugestões de conciliação e na Conciliação Automática, por forma de pagamento/recebimento. As palavras-chave que identificam cada forma continuam fixas (vêm direto do
        texto do extrato/relatório) — aqui só os limites numéricos são editáveis.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ORDEM.map((forma) => (
          <SecaoForma key={forma} forma={forma} regra={form[forma]} onAtualizar={(campo, valor) => atualizar(forma, campo, valor)} />
        ))}
      </div>
    </Modal>
  );
}

interface SecaoFormaProps {
  forma: FormaRegra;
  regra: RegraConciliacao;
  onAtualizar: <K extends keyof RegraConciliacao>(campo: K, valor: RegraConciliacao[K]) => void;
}

function SecaoForma({ forma, regra, onAtualizar }: SecaoFormaProps) {
  return (
    <div className="space-y-3 rounded-lg border border-[var(--color-line)] p-3.5">
      <p className="text-sm font-bold text-[var(--color-text)]">{NOMES_FORMA_REGRA[forma]}</p>

      {(forma === 'PIX' || forma === 'BOLETO' || forma === 'CHEQUE') && (
        <Campo label="Tolerância de valor (R$)">
          <input
            type="number"
            step="0.01"
            min={0}
            value={regra.toleranciaValor}
            onChange={(e) => onAtualizar('toleranciaValor', parseFloat(e.target.value) || 0)}
            className={campoClasse}
          />
        </Campo>
      )}

      {forma === 'BOLETO' && (
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Dias úteis (mín.)">
            <input
              type="number"
              min={0}
              value={regra.diasUteisMin ?? ''}
              onChange={(e) => onAtualizar('diasUteisMin', e.target.value === '' ? null : parseInt(e.target.value, 10))}
              className={campoClasse}
            />
          </Campo>
          <Campo label="Dias úteis (máx.)">
            <input
              type="number"
              min={0}
              value={regra.diasUteisMax ?? ''}
              onChange={(e) => onAtualizar('diasUteisMax', e.target.value === '' ? null : parseInt(e.target.value, 10))}
              className={campoClasse}
            />
          </Campo>
        </div>
      )}

      {(forma === 'CARTAO_DEBITO' || forma === 'CARTAO_CREDITO') && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Taxa mínima (%)">
              <input
                type="number"
                step="0.1"
                min={0}
                value={regra.taxaMinPercentual ?? ''}
                onChange={(e) => onAtualizar('taxaMinPercentual', e.target.value === '' ? null : parseFloat(e.target.value))}
                className={campoClasse}
              />
            </Campo>
            <Campo label="Taxa máxima (%)">
              <input
                type="number"
                step="0.1"
                min={0}
                value={regra.taxaMaxPercentual ?? ''}
                onChange={(e) => onAtualizar('taxaMaxPercentual', e.target.value === '' ? null : parseFloat(e.target.value))}
                className={campoClasse}
              />
            </Campo>
          </div>
          <Campo label="Janela de dias úteis (máx.)">
            <input
              type="number"
              min={0}
              value={regra.diasUteisMax ?? ''}
              onChange={(e) => onAtualizar('diasUteisMax', e.target.value === '' ? null : parseInt(e.target.value, 10))}
              className={campoClasse}
            />
          </Campo>
        </>
      )}

      {forma === 'PIX' && (
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Nome contido (mín. caracteres)">
            <input
              type="number"
              min={1}
              value={regra.nomeMinContido ?? ''}
              onChange={(e) => onAtualizar('nomeMinContido', e.target.value === '' ? null : parseInt(e.target.value, 10))}
              className={campoClasse}
            />
          </Campo>
          <Campo label="Sobrenome (mín. caracteres)">
            <input
              type="number"
              min={1}
              value={regra.nomeMinSobrenome ?? ''}
              onChange={(e) => onAtualizar('nomeMinSobrenome', e.target.value === '' ? null : parseInt(e.target.value, 10))}
              className={campoClasse}
            />
          </Campo>
        </div>
      )}

      <label className="flex items-center gap-2 pt-1 text-xs font-semibold text-[var(--color-text-soft)]">
        <input type="checkbox" checked={regra.exigirNfAutomatica} onChange={(e) => onAtualizar('exigirNfAutomatica', e.target.checked)} className="accent-[var(--color-navy)]" />
        Exigir NF na Conciliação Automática
      </label>

      {forma === 'CHEQUE' && (
        <p className="text-[11px] text-[var(--color-text-soft)]">* Hoje o Cheque só usa a tolerância de valor acima — ainda não tem regra própria de dias ou nome.</p>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">{label}</label>
      {children}
    </div>
  );
}
