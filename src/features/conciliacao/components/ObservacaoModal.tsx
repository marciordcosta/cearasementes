import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { fmtBRL, fmtDataBR } from '@/lib/format';
import { CAMPO_CLASSE as campoClasse } from '../constants';
import type { LancamentoBanco } from '../types';

interface ObservacaoModalProps {
  open: boolean;
  item: LancamentoBanco | null;
  onFechar: () => void;
  onSalvar: (id: string, texto: string) => void;
  onExcluir: (id: string) => void;
}

/**
 * Observação livre (informações adicionais) num lançamento do Banco (OFX) —
 * independente de conciliado/desativado. Aberto pelo ícone de editar na
 * grade; as mesmas ações (salvar/excluir) também ficam disponíveis inline
 * no modal de pendências, na seção "Registros com informações extras".
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
            <Button variant="danger" onClick={() => item && onExcluir(item.id)}>
              Excluir
            </Button>
          )}
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => item && onSalvar(item.id, texto)}>
            Salvar
          </Button>
        </>
      }
    >
      {item && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-[var(--color-page)] px-3 py-2.5 text-xs">
            <span className="text-[var(--color-text-soft)]">Data</span>
            <span className="text-right font-semibold text-[var(--color-text)]">{fmtDataBR(item.data)}</span>
            <span className="text-[var(--color-text-soft)]">Valor</span>
            <span className="num text-right font-semibold text-[var(--color-text)]">{fmtBRL.format(item.valor)}</span>
            <span className="text-[var(--color-text-soft)]">Descrição</span>
            <span className="truncate text-right font-semibold text-[var(--color-text)]" title={item.descricao ?? ''}>
              {item.descricao || '—'}
            </span>
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
