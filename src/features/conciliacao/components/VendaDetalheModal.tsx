import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { fmtBRL, fmtDataBR, fmtInt } from '@/lib/format';
import { buscarVendaPorDocumento } from '@/features/vendas396/api';

interface VendaDetalheModalProps {
  open: boolean;
  documento: string | null;
  onFechar: () => void;
}

/**
 * Produtos e formas de pagamento da venda (Relatório 396) por trás de um
 * documento de recebimento da Conciliação — aberta pelo ícone na grade do
 * Sistema. Só existe se o 396 daquele período já foi importado.
 */
export function VendaDetalheModal({ open, documento, onFechar }: VendaDetalheModalProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['vendas396', 'documento', documento],
    queryFn: () => buscarVendaPorDocumento(documento!),
    enabled: open && !!documento,
  });

  return (
    <Modal open={open} title={`Venda${data?.numVenda ? ` nº ${data.numVenda}` : ''}`} onClose={onFechar} widthClassName="max-w-[560px]">
      {isLoading ? (
        <p className="text-sm text-[var(--color-text-soft)]">Buscando…</p>
      ) : !data ? (
        <p className="text-sm text-[var(--color-text-soft)]">
          Não encontrei essa venda no Relatório 396 (documento {documento}). Pode ser de um período ainda não importado.
        </p>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-[var(--color-page)] px-3 py-2.5 text-xs">
            <span className="text-[var(--color-text-soft)]">Cliente</span>
            <span className="truncate text-right font-semibold text-[var(--color-text)]" title={data.cliente ?? ''}>
              {data.cliente || '—'}
            </span>
            <span className="text-[var(--color-text-soft)]">Data</span>
            <span className="text-right font-semibold text-[var(--color-text)]">{data.data ? fmtDataBR(data.data) : '—'}</span>
            <span className="text-[var(--color-text-soft)]">Vendedor</span>
            <span className="truncate text-right font-semibold text-[var(--color-text)]">{data.vendedor || '—'}</span>
            <span className="text-[var(--color-text-soft)]">NF</span>
            <span className="truncate text-right font-semibold text-[var(--color-text)]">{data.numNf || '—'}</span>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-bold text-[var(--color-text)]">Produtos</p>
            <div className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)]">
              {data.itens.map((it, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-[var(--color-text)]">{it.produto}</div>
                    <div className="text-xs text-[var(--color-text-soft)]">
                      {fmtInt.format(it.qtd)} × {fmtBRL.format(it.vlrUnitario)}
                    </div>
                  </div>
                  <span className="num shrink-0 font-semibold">{fmtBRL.format(it.vlrComDesc)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-bold text-[var(--color-text)]">Pagamento</p>
            <div className="divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)]">
              {data.pagamentos.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-[var(--color-text)]">{p.formaPagamento}</div>
                    <div className="truncate text-xs text-[var(--color-text-soft)]">
                      {[p.numDoc ? `Doc ${p.numDoc}` : null, p.vencimento ? `venc. ${fmtDataBR(p.vencimento)}` : null].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <span className="num shrink-0 font-semibold">{fmtBRL.format(p.valor)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
