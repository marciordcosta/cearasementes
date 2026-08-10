import { Modal } from '@/components/ui/Modal';

function fmtP(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

interface MargemResumoModalProps {
  open: boolean;
  onFechar: () => void;
  margemAtualPct: number;
  margemLiquidaPct: number;
}

/** Modal discreto com o resumo de margens que antes ficava em 2 selos fixos na barra de ferramentas. */
export function MargemResumoModal({ open, onFechar, margemAtualPct, margemLiquidaPct }: MargemResumoModalProps) {
  return (
    <Modal open={open} onClose={onFechar} title="Margens — visão geral" widthClassName="max-w-sm">
      <div className="space-y-4">
        <div>
          <p className="text-2xl font-bold text-[var(--color-text)]">{fmtP(margemAtualPct)}%</p>
          <p className="text-xs font-semibold text-[var(--color-text-soft)]">MB atual</p>
          <p className="mt-1 text-xs text-[var(--color-text-soft)]">
            Margem bruta de hoje (preço e custo atuais) somando TODAS as Tabelas visíveis, ponderada pela média de quantidade vendida nas últimas
            safras de cada produto — estimativa de volume, já que a safra atual ainda não fechou.
          </p>
        </div>
        <div className="border-t border-[var(--color-line)] pt-4">
          <p className="text-2xl font-bold text-[var(--color-text)]">{fmtP(margemLiquidaPct)}%</p>
          <p className="text-xs font-semibold text-[var(--color-text-soft)]">M.C prevista</p>
          <p className="mt-1 text-xs text-[var(--color-text-soft)]">
            Margem líquida (a mesma já informada por produto — ML $, com imposto/encargos/frete) de hoje somando TODAS as Tabelas visíveis,
            ponderada pela média de quantidade vendida nas últimas safras de cada produto.
          </p>
        </div>
      </div>
    </Modal>
  );
}
