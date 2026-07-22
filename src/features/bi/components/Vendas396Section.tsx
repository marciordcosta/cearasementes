import { Card } from '@/components/ui/Card';
import { CardMetrica } from '@/components/ui/CardMetrica';
import { TabelaDados } from '@/components/ui/TabelaDados';
import { fmtBRL, fmtInt, fmtPct } from '@/lib/format';
import { palette } from '@/lib/chartSetup';
import { getFilteredPriceTables, type PeriodContext } from '../calculations';
import type { FilteredPriceTableView, PriceTableAgg } from '../types';
import { MonthlyBarChart } from './MonthlyBarChart';

interface Vendas396SectionProps {
  ctx: PeriodContext;
  priceTables: PriceTableAgg[];
  selectedPeriod: string;
  isDark: boolean;
}

export function Vendas396Section({ ctx, priceTables, selectedPeriod, isDark }: Vendas396SectionProps) {
  const filtered = getFilteredPriceTables(ctx, priceTables, selectedPeriod);
  const colors = palette(isDark);
  const tableColor = (t: FilteredPriceTableView) => colors[priceTables.indexOf(t.ref) % colors.length];

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-[var(--color-text)]">
        Vendas por Tabela de Preço <span className="font-normal text-[var(--color-text-soft)]">(Relatório 396)</span>
      </h2>

      {filtered.length === 0 ? (
        <Card className="p-4 text-sm text-[var(--color-text-soft)]">
          {priceTables.length === 0
            ? 'Nenhum dado do relatório 396 encontrado. Envie um arquivo em Uploads.'
            : 'Nenhuma tabela de preço encontrada para o período selecionado.'}
        </Card>
      ) : (
        <div className="space-y-6">
          <TotalCard396 filtered={filtered} />

          <Card className="overflow-x-auto">
            <TabelaDados
              chaveLinha={(t) => t.name}
              colunas={[
                {
                  chave: 'nome',
                  cabecalho: 'Tabela de Preço',
                  render: (t: FilteredPriceTableView) => (
                    <span className="flex items-center gap-2 text-[var(--color-text)]">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: tableColor(t) }} />
                      {t.name}
                    </span>
                  ),
                },
                { chave: 'bruto', cabecalho: 'Valor Bruto', alinhamento: 'right', render: (t) => fmtBRL.format(t.valorBruto) },
                {
                  chave: 'desconto',
                  cabecalho: 'Desconto',
                  alinhamento: 'right',
                  render: (t) => (
                    <>
                      {fmtBRL.format(t.desconto)}{' '}
                      <span className="text-xs text-[var(--color-text-soft)]">({fmtPct(t.desconto, t.valorBruto)})</span>
                    </>
                  ),
                },
                {
                  chave: 'liquido',
                  cabecalho: 'Valor Líquido',
                  alinhamento: 'right',
                  render: (t) => {
                    const totalLiquido = filtered.reduce((s, x) => s + x.valorLiquido, 0);
                    return (
                      <span className="font-medium text-[var(--color-text)]">
                        {fmtBRL.format(t.valorLiquido)}{' '}
                        <span className="text-xs font-normal text-[var(--color-text-soft)]">({fmtPct(t.valorLiquido, totalLiquido)})</span>
                      </span>
                    );
                  },
                },
                {
                  chave: 'registros',
                  cabecalho: 'Registros',
                  alinhamento: 'right',
                  render: (t) => {
                    const totalReg = filtered.reduce((s, x) => s + x.totalReg, 0);
                    return (
                      <>
                        {fmtInt.format(t.totalReg)} <span className="text-xs text-[var(--color-text-soft)]">({fmtPct(t.totalReg, totalReg)})</span>
                      </>
                    );
                  },
                },
                {
                  chave: 'clientes',
                  cabecalho: 'Clientes',
                  alinhamento: 'right',
                  render: (t) => {
                    const totalCli = filtered.reduce((s, x) => s + x.qtdCliente, 0);
                    return (
                      <>
                        {fmtInt.format(t.qtdCliente)} <span className="text-xs text-[var(--color-text-soft)]">({fmtPct(t.qtdCliente, totalCli)})</span>
                      </>
                    );
                  },
                },
              ]}
              linhas={[...filtered].sort((a, b) => b.valorLiquido - a.valorLiquido)}
            />
          </Card>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--color-text-soft)]">Faturamento por Mês</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[...filtered]
                .sort((a, b) => b.valorLiquido - a.valorLiquido)
                .map((t) => (
                  <Card key={t.name} className="p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: tableColor(t) }} />
                      <p className="font-medium text-[var(--color-text)]">{t.name}</p>
                    </div>
                    <div className="h-56">
                      {t.monthly.length > 0 ? (
                        <MonthlyBarChart
                          labels={t.monthly.map((m) => m.label)}
                          data={t.monthly.map((m) => m.valor)}
                          color={tableColor(t)}
                          isDark={isDark}
                        />
                      ) : (
                        <p className="pt-4 text-xs text-[var(--color-text-soft)]">Sem data reconhecível neste período.</p>
                      )}
                    </div>
                  </Card>
                ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TotalCard396({ filtered }: { filtered: FilteredPriceTableView[] }) {
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
