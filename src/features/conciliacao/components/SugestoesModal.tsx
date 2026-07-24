import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { fmtBRL } from '@/lib/format';
import type { LancamentoBanco, LancamentoSistema, SugestoesConciliacao } from '../types';

interface SugestoesModalProps {
  itemBanco: LancamentoBanco | null;
  sugestoes: SugestoesConciliacao | null;
  onFechar: () => void;
  onConciliar: (sistemaIds: string[]) => void;
}

const ROTULOS: Record<keyof SugestoesConciliacao, string> = {
  mesmoRemetente: 'Mesmo remetente PIX (outro lançamento do banco)',
  mesmoNome: 'Nome parecido no sistema',
  mesmoValorMesmaData: 'Mesmo valor, mesma data',
  mesmoValorOutraData: 'Mesmo valor, outra data',
  combinacaoCartao: 'Combinação de títulos (soma bate com o valor)',
};

export function SugestoesModal({ itemBanco, sugestoes, onFechar, onConciliar }: SugestoesModalProps) {
  const categorias = (Object.keys(ROTULOS) as (keyof SugestoesConciliacao)[]).filter((k) => k !== 'mesmoRemetente' && (sugestoes?.[k]?.length ?? 0) > 0);

  return (
    <Modal open={itemBanco !== null} title={`Sugestões para: ${itemBanco?.descricao ?? ''}`} onClose={onFechar} widthClassName="max-w-[480px]">
      <div className="space-y-4">
        {itemBanco && (
          <p className="text-xs text-[var(--color-text-soft)]">
            {itemBanco.data} — <span className="num font-semibold">{fmtBRL.format(itemBanco.valor)}</span> — {itemBanco.formaPagamento}
          </p>
        )}

        {categorias.length === 0 ? (
          <p className="text-sm text-[var(--color-text-soft)]">Nenhuma sugestão automática encontrada. Selecione manualmente na lista do sistema.</p>
        ) : (
          categorias.map((cat) => {
            const itens = sugestoes?.[cat] as LancamentoSistema[] | undefined;
            if (!itens || itens.length === 0) return null;
            return (
              <div key={cat} className="space-y-1.5">
                <p className="text-xs font-semibold text-[var(--color-text-soft)]">{ROTULOS[cat]}</p>
                {itens.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--color-page)] px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      {s.cliente} {s.nf && <span className="text-xs text-[var(--color-text-soft)]">(NF {s.nf})</span>}
                    </span>
                    <span className="num shrink-0 font-semibold">{fmtBRL.format(s.valor)}</span>
                    <Button variant="action" className="shrink-0 px-2.5 py-1 text-xs" onClick={() => onConciliar(cat === 'combinacaoCartao' ? itens.map((i) => i.id) : [s.id])}>
                      Conciliar
                    </Button>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
