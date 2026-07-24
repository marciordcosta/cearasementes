import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { CardMetrica } from '@/components/ui/CardMetrica';
import { TabelaDados } from '@/components/ui/TabelaDados';
import { TabToggle } from '@/components/ui/TabToggle';
import { fmtBRL, fmtInt, fmtPct } from '@/lib/format';
import { getFilteredCarrierRows, getFilteredPriceTables, type PeriodContext } from '../calculations';
import type { CarrierAgg, PriceTableAgg } from '../types';
import { CarrierMonthlyChart, type ModoCarrierChart } from './CarrierMonthlyChart';

interface Entregas124SectionProps {
  ctx: PeriodContext;
  carriers: Map<string, CarrierAgg>;
  priceTables: PriceTableAgg[];
  selectedPeriod: string;
  isDark: boolean;
}

export function Entregas124Section({ ctx, carriers, priceTables, selectedPeriod, isDark }: Entregas124SectionProps) {
  const rows = getFilteredCarrierRows(ctx, carriers, selectedPeriod).sort((a, b) => b.pedidos - a.pedidos);
  const [modoGrafico, setModoGrafico] = useState<ModoCarrierChart>('quantidade');
  const [mostrarGrafico, setMostrarGrafico] = useState(false);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--color-text)]">
          Entregas por Transportadora <span className="font-normal text-[var(--color-text-soft)]">(Relatório 124)</span>
        </h2>
        <button
          type="button"
          onClick={() => setMostrarGrafico((v) => !v)}
          title={mostrarGrafico ? 'Ocultar gráfico de linha' : 'Ver Envios por Transportadora em gráfico de linha'}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-sm shadow-sm hover:bg-[var(--color-line)]/40"
        >
          📈
        </button>
      </div>

      {carriers.size === 0 || rows.length === 0 ? (
        <Card className="p-4 text-sm text-[var(--color-text-soft)]">
          {carriers.size === 0
            ? 'Nenhum dado do relatório 124 encontrado. Envie um arquivo em Uploads.'
            : 'Nenhuma transportadora encontrada para o período selecionado.'}
        </Card>
      ) : (
        <div className="space-y-6">
          <StatCards124 ctx={ctx} rows={rows} priceTables={priceTables} selectedPeriod={selectedPeriod} />

          <Card className="max-h-96 overflow-y-auto overflow-x-auto">
            <TabelaDados
              cabecalhoFixo
              chaveLinha={(r) => r.name}
              colunas={[
                { chave: 'nome', cabecalho: 'Transportadora', render: (r) => r.name },
                {
                  chave: 'pedidos',
                  cabecalho: 'Pedidos',
                  alinhamento: 'right',
                  render: (r) => {
                    const total = rows.reduce((s, x) => s + x.pedidos, 0);
                    return (
                      <>
                        {fmtInt.format(r.pedidos)} <span className="text-xs text-[var(--color-text-soft)]">({fmtPct(r.pedidos, total)})</span>
                      </>
                    );
                  },
                },
                {
                  chave: 'valor',
                  cabecalho: 'Valor Total',
                  alinhamento: 'right',
                  render: (r) => {
                    const total = rows.reduce((s, x) => s + x.valor, 0);
                    return (
                      <span className="font-medium text-[var(--color-text)]">
                        {fmtBRL.format(r.valor)} <span className="text-xs font-normal text-[var(--color-text-soft)]">({fmtPct(r.valor, total)})</span>
                      </span>
                    );
                  },
                },
              ]}
              linhas={rows}
            />
          </Card>

          {mostrarGrafico && (
            <Card className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--color-text-soft)]">
                  {modoGrafico === 'valor' ? 'Valor Transportado por Transportadora e Mês' : 'Envios por Transportadora e Mês'}
                </p>
                <TabToggle
                  value={modoGrafico}
                  onChange={setModoGrafico}
                  options={[
                    { value: 'quantidade', label: 'Quantidade' },
                    { value: 'valor', label: 'Valor' },
                  ]}
                />
              </div>
              <div className="h-72">
                <CarrierMonthlyChart ctx={ctx} carriers={carriers} selectedPeriod={selectedPeriod} modo={modoGrafico} isDark={isDark} />
              </div>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}

function StatCards124({
  ctx,
  rows,
  priceTables,
  selectedPeriod,
}: {
  ctx: PeriodContext;
  rows: { name: string; pedidos: number; valor: number }[];
  priceTables: PriceTableAgg[];
  selectedPeriod: string;
}) {
  const totalPedidos = rows.reduce((s, r) => s + r.pedidos, 0);
  const totalValor = rows.reduce((s, r) => s + r.valor, 0);

  const filteredPriceTables = getFilteredPriceTables(ctx, priceTables, selectedPeriod);
  const refRegistros = filteredPriceTables.length > 0 ? filteredPriceTables.reduce((s, t) => s + t.totalReg, 0) : totalPedidos;
  const refValor = filteredPriceTables.length > 0 ? filteredPriceTables.reduce((s, t) => s + t.valorLiquido, 0) : totalValor;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card className="p-4">
        <CardMetrica label="Total de Pedidos" value={fmtInt.format(totalPedidos)} sub={`${fmtPct(totalPedidos, refRegistros)} do total de registros`} />
      </Card>
      <Card className="p-4">
        <CardMetrica label="Valor Total Transportado" value={fmtBRL.format(totalValor)} sub={`${fmtPct(totalValor, refValor)} do total líquido`} />
      </Card>
      <Card className="p-4">
        <CardMetrica label="Transportadoras" value={fmtInt.format(rows.length)} />
      </Card>
    </div>
  );
}
