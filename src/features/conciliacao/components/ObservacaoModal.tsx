import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { fmtBRL, fmtDataBR } from '@/lib/format';
import { CAMPO_CLASSE as campoClasse } from '../constants';
import type { LancamentoBanco, LancamentoSistema } from '../types';

interface ObservacaoModalProps {
  open: boolean;
  item: LancamentoBanco | LancamentoSistema | null;
  onFechar: () => void;
  onSalvar: (id: string, texto: string) => void;
  onExcluir: (id: string) => void;
}

function ehBanco(item: LancamentoBanco | LancamentoSistema): item is LancamentoBanco {
  return 'descricao' in item;
}

/**
 * Observação livre (informações adicionais) num lançamento do Banco (OFX) ou
 * do Sistema — mesma regra pros dois, independente de conciliado/desativado.
 * Aberto pelo ícone de editar na grade; as mesmas ações (salvar/excluir)
 * também ficam disponíveis inline no modal de pendências correspondente
 * (seção "Registros com informações extras").
 */
export function ObservacaoModal({ open, item, onFechar, onSalvar, onExcluir }: ObservacaoModalProps) {
  const [texto, setTexto] = useState('');

  useEffect(() => {
    if (open) setTexto(item?.observacao ?? '');
  }, [open, item]);

  return (
    <Modal
      open={open}
      title="Observação"
      onClose={onFechar}
      widthClassName="max-w-[440px]"
      footer={
        <>
          {item?.observacao && (
            <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => item && onExcluir(item.id)}>
              Excluir
            </Button>
          )}
          <Button variant="outline" className="px-2.5 py-1 text-xs" onClick={onFechar}>
            Cancelar
          </Button>
          <Button variant="primary" className="px-2.5 py-1 text-xs" onClick={() => item && onSalvar(item.id, texto)}>
            Salvar
          </Button>
        </>
      }
    >
      {item && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-[var(--color-page)] px-3 py-2.5 text-xs">
            <span className="text-[var(--color-text-soft)]">Data</span>
            <span className="text-right font-semibold text-[var(--color-text)]">{item.data ? fmtDataBR(item.data) : '—'}</span>
            <span className="text-[var(--color-text-soft)]">Valor</span>
            <span className="num text-right font-semibold text-[var(--color-text)]">{fmtBRL.format(item.valor)}</span>
            <span className="text-[var(--color-text-soft)]">{ehBanco(item) ? 'Descrição' : 'Cliente'}</span>
            <span className="truncate text-right font-semibold text-[var(--color-text)]" title={(ehBanco(item) ? item.descricao : item.cliente) ?? ''}>
              {(ehBanco(item) ? item.descricao : item.cliente) || '—'}
            </span>
            {!ehBanco(item) && (
              <>
                <span className="text-[var(--color-text-soft)]">Documento</span>
                <span className="truncate text-right font-semibold text-[var(--color-text)]">{item.documento || '—'}</span>
                <span className="text-[var(--color-text-soft)]">NF</span>
                <span className="truncate text-right font-semibold text-[var(--color-text)]">{item.nf || '—'}</span>
              </>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Observação</label>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={4}
              placeholder="Informações adicionais sobre este lançamento…"
              className={`${campoClasse} resize-none`}
              autoFocus
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
