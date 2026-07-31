import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { NOMES_FORMA_REGRA, type FormaRegra, type RegraConciliacao } from '../regras';

// Campos maiores e mais próximos entre si que o CAMPO_CLASSE padrão dos
// outros modais — aqui as caixas ficam lado a lado com o rótulo, então dá
// pra ganhar densidade sem perder legibilidade.
const campoClasse = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-0.5 text-sm text-[var(--color-text)]';

interface RegrasConciliacaoModalProps {
  open: boolean;
  regras: Record<FormaRegra, RegraConciliacao>;
  onFechar: () => void;
  onSalvar: (regras: RegraConciliacao[]) => Promise<void>;
  /** Fecha este modal e abre o de nomes das categorias de sugestão — mantidos separados de propósito (aqui é lógica de casamento; lá é só texto). */
  onAbrirRotulos: () => void;
}

const ORDEM: FormaRegra[] = ['GENERICA', 'CARTAO', 'BOLETO'];

export function RegrasConciliacaoModal({ open, regras, onFechar, onSalvar, onAbrirRotulos }: RegrasConciliacaoModalProps) {
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
      widthClassName="max-w-[720px]"
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
        Parâmetros usados nas sugestões de conciliação e na Conciliação Automática. A Conciliação Automática nunca exige NF (a pré-conciliação já cobre esse caso).
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {ORDEM.map((forma) => (
          <SecaoForma key={forma} forma={forma} regra={form[forma]} onAtualizar={(campo, valor) => atualizar(forma, campo, valor)} />
        ))}
      </div>
      <button type="button" onClick={onAbrirRotulos} className="mt-4 text-xs font-semibold text-[var(--color-accent)] hover:underline">
        Editar nomes das categorias de sugestão →
      </button>
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
    <div className="space-y-1.5 rounded-lg border border-[var(--color-line)] p-3.5">
      <p className="mb-1 text-sm font-bold text-[var(--color-text)]">{NOMES_FORMA_REGRA[forma]}</p>

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

      {forma === 'GENERICA' && (
        <Campo label="Tolerância de busca (dias)">
          <input
            type="number"
            min={0}
            value={regra.toleranciaDias}
            onChange={(e) => onAtualizar('toleranciaDias', parseInt(e.target.value, 10) || 0)}
            className={campoClasse}
          />
        </Campo>
      )}

      {(forma === 'CARTAO' || forma === 'BOLETO') && (
        <Campo label="Tolerância de dias (úteis)">
          <input
            type="number"
            min={0}
            value={regra.diasUteisMax ?? ''}
            onChange={(e) => onAtualizar('diasUteisMax', e.target.value === '' ? null : parseInt(e.target.value, 10))}
            className={campoClasse}
          />
        </Campo>
      )}

      {forma === 'GENERICA' && (
        <>
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
        </>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs font-light text-[var(--color-text-soft)]">{label}</label>
      <div className="w-14 shrink-0">{children}</div>
    </div>
  );
}
