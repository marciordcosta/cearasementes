import { Modal } from '@/components/ui/Modal';
import { calcularTotalCustosPersonalizados } from '../custosPersonalizados';
import type { CustoPersonalizado } from '../types';

function fmtP(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

interface MargemResumoModalProps {
  open: boolean;
  onFechar: () => void;
  margemAtualPct: number;
  margemLiquidaPct: number;
  custos: CustoPersonalizado[];
  /** Total de vendas (média das últimas safras, somando todas as Tabelas) — mesma base usada pra margemAtualPct/margemLiquidaPct. */
  totalVendas: number;
}

/** Um bloco de métrica — número grande + rótulo curto, com a explicação completa só no tooltip (hover). */
function BlocoMetrica({ valorPct, rotulo, titulo, corValor }: { valorPct: number; rotulo: string; titulo: string; corValor?: string }) {
  return (
    <div className="border-t border-[var(--color-line)] pt-4 first:border-t-0 first:pt-0">
      <p className={`text-2xl font-bold ${corValor ?? 'text-[var(--color-text)]'}`}>{fmtP(valorPct)}%</p>
      <p className="text-xs font-semibold text-[var(--color-text-soft)]" title={titulo}>
        {rotulo}
      </p>
    </div>
  );
}

/** Modal discreto com o resumo de margens que antes ficava em selos fixos na barra de ferramentas. */
export function MargemResumoModal({ open, onFechar, margemAtualPct, margemLiquidaPct, custos, totalVendas }: MargemResumoModalProps) {
  const { pctDasVendas: custosPct } = calcularTotalCustosPersonalizados(custos, totalVendas);
  const margemLiquidaFinalPct = margemLiquidaPct - custosPct;

  return (
    <Modal open={open} onClose={onFechar} title="Margens — visão geral" widthClassName="max-w-sm">
      <div className="space-y-4">
        <BlocoMetrica
          valorPct={margemAtualPct}
          rotulo="MB atual"
          titulo="Margem bruta de hoje (preço e custo atuais) somando TODAS as Tabelas visíveis, ponderada pela média de quantidade vendida nas últimas safras de cada produto — estimativa de volume, já que a safra atual ainda não fechou."
        />
        <BlocoMetrica
          valorPct={margemLiquidaPct}
          rotulo="M.C prevista"
          titulo="Margem líquida (a mesma já informada por produto — ML $, com imposto/encargos/frete) de hoje somando TODAS as Tabelas visíveis, ponderada pela média de quantidade vendida nas últimas safras de cada produto."
        />
        <BlocoMetrica
          valorPct={custosPct}
          rotulo="Custos personalizados"
          titulo="Soma de todos os Custos Personalizados (aba Custos, em Parametrização), como % do total das vendas."
        />
        <BlocoMetrica
          valorPct={margemLiquidaFinalPct}
          rotulo="Margem líquida final (M.C − Custos)"
          titulo="M.C prevista menos os Custos Personalizados — o que sobra de fato depois desses custos extras."
          corValor={margemLiquidaFinalPct >= 0 ? 'text-good' : 'text-bad'}
        />
      </div>
    </Modal>
  );
}
