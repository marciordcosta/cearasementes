import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { TabelaDados } from '@/components/ui/TabelaDados';
import { fmtBRL, fmtInt, fmtPct, MESES_PT } from '@/lib/format';
import { palette } from '@/lib/chartSetup';
import { getFilteredPriceTables, mesesDoPeriodo, posicaoNoPeriodo, qtdClientesDeduplicados, type PeriodContext } from '../calculations';
import type { FilteredPriceTableView, PriceTableAgg } from '../types';
import { MultiLineChart } from './MultiLineChart';

interface Vendas396SectionProps {
  ctx: PeriodContext;
  priceTables: PriceTableAgg[];
  selectedPeriod: string;
  isDark: boolean;
}

export function Vendas396Section({ ctx, priceTables, selectedPeriod, isDark }: Vendas396SectionProps) {
  const [mostrarGrafico, setMostrarGrafico] = useState(false);
  // useMemo — sem isso, os useMemo abaixo que dependem de `filtered` recalculam sempre (identidade
  // nova a cada render), tornando a memoização deles inútil.
  const filtered = useMemo(() => getFilteredPriceTables(ctx, priceTables, selectedPeriod), [ctx, priceTables, selectedPeriod]);
  const colors = palette(isDark);
  const tableColor = (t: FilteredPriceTableView) => colors[priceTables.indexOf(t.ref) % colors.length];

  // Faturamento Líquido por Tabela de Preço, mês a mês — segue o filtro geral
  // do topo. Com um ano/safra específico, o eixo é o período (12 meses);
  // com "Todos", não existe "um período" pra usar de eixo, então o eixo vira
  // a linha do tempo inteira (todo mês em que alguma tabela tem dado).
  const chavesMesesTodos = useMemo(() => {
    if (selectedPeriod !== 'all') return null;
    const chaves = new Set<string>();
    filtered.forEach((t) => t.monthly.forEach((m) => chaves.add(`${m.year}-${String(m.month).padStart(2, '0')}`)));
    return Array.from(chaves).sort();
  }, [selectedPeriod, filtered]);

  const labelsMeses = useMemo(() => {
    if (chavesMesesTodos) return chavesMesesTodos.map((k) => `${MESES_PT[Number(k.split('-')[1]) - 1]}/${k.split('-')[0]}`);
    return mesesDoPeriodo(ctx);
  }, [chavesMesesTodos, ctx]);

  const seriesPorTabela = useMemo(
    () =>
      filtered.map((t, i) => {
        let data: (number | null)[];
        if (chavesMesesTodos) {
          const porChave = new Map(t.monthly.map((m) => [`${m.year}-${String(m.month).padStart(2, '0')}`, m.valor]));
          data = chavesMesesTodos.map((k) => porChave.get(k) ?? null);
        } else {
          data = Array(12).fill(null);
          t.monthly.forEach((m) => {
            data[posicaoNoPeriodo(ctx, m.month)] = m.valor;
          });
        }
        return { key: t.name, label: t.name, data, color: colors[i % colors.length] };
      }),
    [filtered, chavesMesesTodos, ctx, colors],
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--color-text)]">
          Vendas por Tabela de Preço <span className="font-normal text-[var(--color-text-soft)]">(Relatório 396)</span>
        </h2>
        <button
          type="button"
          onClick={() => setMostrarGrafico((v) => !v)}
          title={mostrarGrafico ? 'Ocultar gráfico de linha' : 'Ver Faturamento Líquido por Tabela de Preço em gráfico de linha'}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-sm shadow-sm hover:bg-[var(--color-line)]/40"
        >
          📈
        </button>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-4 text-sm text-[var(--color-text-soft)]">
          {priceTables.length === 0
            ? 'Nenhum dado do relatório 396 encontrado. Envie um arquivo em Uploads.'
            : 'Nenhuma tabela de preço encontrada para o período selecionado.'}
        </Card>
      ) : (
        <div className="space-y-6">
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
                    const totalCli = qtdClientesDeduplicados(filtered);
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

          {mostrarGrafico && (
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Faturamento Líquido por Tabela de Preço — mês a mês</h3>
              <div className="h-80">
                {seriesPorTabela.length === 0 ? (
                  <p className="pt-6 text-sm text-[var(--color-text-soft)]">Sem Tabelas de Preço com dados neste período.</p>
                ) : (
                  <MultiLineChart labels={labelsMeses} series={seriesPorTabela} isDark={isDark} />
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
