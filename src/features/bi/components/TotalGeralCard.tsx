import { Card } from '@/components/ui/Card';
import { CardMetrica } from '@/components/ui/CardMetrica';
import { fmtBRL, fmtInt, fmtPct } from '@/lib/format';
import { getFilteredPriceTables, type PeriodContext } from '../calculations';
import type { PriceTableAgg } from '../types';

interface TotalGeralCardProps {
  ctx: PeriodContext;
  priceTables: PriceTableAgg[];
  selectedPeriod: string;
}

/** Primeira informação da página — total geral (todas as tabelas de preço) do período selecionado no filtro do topo. */
export function TotalGeralCard({ ctx, priceTables, selectedPeriod }: TotalGeralCardProps) {
  const filtered = getFilteredPriceTables(ctx, priceTables, selectedPeriod);
  if (filtered.length === 0) return null;

  const totalBruto = filtered.reduce((s, t) => s + t.valorBruto, 0);
  const totalDesconto = filtered.reduce((s, t) => s + t.desconto, 0);
  const totalLiquido = filtered.reduce((s, t) => s + t.valorLiquido, 0);
  const totalReg = filtered.reduce((s, t) => s + t.totalReg, 0);
  const totalCli = filtered.reduce((s, t) => s + t.qtdCliente, 0);

  return (
    <Card className="p-4">
      <p className="mb-2 font-medium text-[var(--color-text)]">
        Total Geral <span className="text-xs font-normal text-[var(--color-text-soft)]">(todas as tabelas)</span>
      </p>
      <CardMetrica label="Valor líquido" value={fmtBRL.format(totalLiquido)} destaque />
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <CardMetrica label="Valor Bruto" value={fmtBRL.format(totalBruto)} />
        <CardMetrica label="Desconto" value={fmtBRL.format(totalDesconto)} sub={`${fmtPct(totalDesconto, totalBruto)} do valor bruto`} />
        <CardMetrica label="Registros" value={fmtInt.format(totalReg)} />
        <CardMetrica label="Clientes" value={fmtInt.format(totalCli)} />
      </div>
    </Card>
  );
}
