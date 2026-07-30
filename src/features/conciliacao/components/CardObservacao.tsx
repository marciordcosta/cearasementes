import { Filter } from 'lucide-react';
import { useState } from 'react';
import { fmtBRL, fmtDataBR } from '@/lib/format';
import { CAMPO_CLASSE as campoClasse } from '../constants';
import type { LancamentoBanco, LancamentoSistema } from '../types';

function ehBanco(item: LancamentoBanco | LancamentoSistema): item is LancamentoBanco {
  return 'descricao' in item;
}

/**
 * Card de observação com edição inline (textarea + Salvar/Excluir direto no
 * card, sem abrir outro modal) — usado na seção "Registros com informações
 * extras" dos modais de pendências (Banco e Sistema, mesma regra pros dois).
 */
export function CardObservacao({
  item,
  onSalvar,
  onExcluir,
  onFiltrar,
}: {
  item: LancamentoBanco | LancamentoSistema;
  onSalvar: (id: string, texto: string) => void;
  onExcluir: (id: string) => void;
  /** Filtra a grade correspondente (Banco ou Sistema) só por esse registro — não fecha o modal, quem fecha é o próprio X do modal. */
  onFiltrar: (id: string) => void;
}) {
  const [texto, setTexto] = useState(item.observacao ?? '');
  const banco = ehBanco(item);
  const titulo = banco ? item.descricao : item.cliente;
  const docNf = !banco ? [item.documento ? `Doc ${item.documento}` : null, item.nf ? `NF ${item.nf}` : null].filter(Boolean).join(' · ') : '';

  return (
    <div className="rounded-lg bg-[#EFEAFB] px-3 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-[var(--color-text)]" title={titulo ?? ''}>
            {titulo || '—'}
          </div>
          <div className="truncate text-xs text-[var(--color-text-soft)]">
            {item.data ? fmtDataBR(item.data) : '—'}
            {docNf && ` · ${docNf}`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onFiltrar(item.id)}
          className="shrink-0 text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
          title={`Filtrar esse registro na grade do ${banco ? 'Banco' : 'Sistema'}`}
        >
          <Filter size={14} />
        </button>
        <span className="num shrink-0 font-semibold">{fmtBRL.format(item.valor)}</span>
      </div>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} className={`${campoClasse} mt-2 resize-none bg-white text-xs`} />
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
