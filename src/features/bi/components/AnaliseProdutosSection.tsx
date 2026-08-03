import { useMemo, useState } from 'react';
import { Chart } from 'react-chartjs-2';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { CardMetrica } from '@/components/ui/CardMetrica';
import { TabelaDados } from '@/components/ui/TabelaDados';
import { chartChrome, palette } from '@/lib/chartSetup';
import { fmtBRL, fmtInt, fmtPct } from '@/lib/format';
import type { CoberturaItens } from '../aggregate';
import { classificarABC, getCoberturaFiltrada, getFilteredItems, type PeriodContext } from '../calculations';
import type { FilteredItemView, ItemAgg, PriceTableAgg } from '../types';

interface AnaliseProdutosSectionProps {
  ctx: PeriodContext;
  items: ItemAgg[];
  cobertura: CoberturaItens[];
  priceTables: PriceTableAgg[];
  selectedPeriod: string;
  isDark: boolean;
}

const CORES_CLASSE: Record<'A' | 'B' | 'C', 'bom' | 'neutro' | 'ruim'> = { A: 'bom', B: 'neutro', C: 'ruim' };
const campoClasse = 'rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';

/** Quantos produtos aparecem no gráfico Pareto — além disso a barra fica ilegível, e o rabo da curva ABC (Classe C) tende a ser uma cauda longa de itens pouco relevantes. */
const TOP_N_GRAFICO = 20;

interface LinhaProduto extends FilteredItemView {
  classe: 'A' | 'B' | 'C';
  pctAcumulado: number;
}

/**
 * Análise por Produto (Relatório 396 detalhado) — quantidade vendida, margem
 * de lucro (valor vendido − custo) e Curva ABC por produto, seguindo o mesmo
 * filtro de período do topo do BI. Só existe dado aqui pra vendas importadas
 * no formato novo do 396 (que já traz custo_unitario por item); vendas no
 * formato antigo entram na Tabela de Preço/Total Geral só do jeito de sempre.
 */
export function AnaliseProdutosSection({ ctx, items, cobertura, priceTables, selectedPeriod, isDark }: AnaliseProdutosSectionProps) {
  const [mostrarGrafico, setMostrarGrafico] = useState(false);
  const [tabelaSelecionada, setTabelaSelecionada] = useState('all');
  const colors = palette(isDark);
  const c = useMemo(() => chartChrome(isDark), [isDark]);

  const filtrados = useMemo(() => getFilteredItems(ctx, items, selectedPeriod, tabelaSelecionada), [ctx, items, selectedPeriod, tabelaSelecionada]);
  const totalValor = filtrados.reduce((s, i) => s + i.valorVendido, 0);
  const totalCusto = filtrados.reduce((s, i) => s + i.custoTotal, 0);
  const totalMargem = totalValor - totalCusto;

  // Cobertura: quantas vendas do período/tabela selecionados têm item importado — avisa quando a análise está vendo só uma fração das vendas (ex.: ano importado sem detalhamento por item), pra não passar despercebido um total "certinho" mas incompleto.
  const coberturaFiltrada = useMemo(() => getCoberturaFiltrada(ctx, cobertura, selectedPeriod, tabelaSelecionada), [ctx, cobertura, selectedPeriod, tabelaSelecionada]);
  const coberturaParcial = coberturaFiltrada.totalVendas > 0 && coberturaFiltrada.vendasComItem < coberturaFiltrada.totalVendas;

  // Combina item + classe ABC + % acumulado numa linha só — evita recalcular/procurar por índice na hora de renderizar a tabela e o gráfico.
  const ordenados = useMemo<LinhaProduto[]>(() => {
    const porValorDesc = [...filtrados].sort((a, b) => b.valorVendido - a.valorVendido);
    const classes = classificarABC(porValorDesc);
    let acumulado = 0;
    return porValorDesc.map((item, i) => {
      acumulado += item.valorVendido;
      return { ...item, classe: classes[i], pctAcumulado: totalValor > 0 ? (acumulado / totalValor) * 100 : 0 };
    });
  }, [filtrados, totalValor]);

  const semDadoDeItem = ordenados.length === 0 && priceTables.length > 0;

  const top = ordenados.slice(0, TOP_N_GRAFICO);
  const chartData = useMemo(
    () => ({
      labels: top.map((i) => i.produto),
      datasets: [
        {
          type: 'bar' as const,
          label: 'Valor Vendido',
          data: top.map((i) => i.valorVendido),
          backgroundColor: colors[0],
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          type: 'line' as const,
          label: '% Acumulado',
          data: top.map((i) => i.pctAcumulado),
          borderColor: colors[1],
          backgroundColor: colors[1],
          pointRadius: 3,
          tension: 0.2,
          yAxisID: 'y1',
        },
      ],
    }),
    [top, colors],
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: c.text2 } },
        tooltip: {
          callbacks: {
            label: (ctx2: { dataset: { label?: string }; parsed: { y: number | null } }) =>
              ctx2.dataset.label === '% Acumulado' ? `${ctx2.dataset.label}: ${ctx2.parsed.y?.toFixed(1)}%` : `${ctx2.dataset.label}: ${fmtBRL.format(ctx2.parsed.y ?? 0)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: c.text2, maxRotation: 60, minRotation: 60 } },
        y: { position: 'left' as const, beginAtZero: true, grid: { color: c.grid }, ticks: { display: false }, border: { display: false } },
        y1: { position: 'right' as const, beginAtZero: true, max: 100, grid: { display: false }, ticks: { color: c.text2, callback: (v: number | string) => `${v}%` } },
      },
    }),
    [c],
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--color-text)]">
          Análise por Produto <span className="font-normal text-[var(--color-text-soft)]">(margem e curva ABC — Relatório 396)</span>
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-[var(--color-text-soft)]">Tabela:</label>
            <select value={tabelaSelecionada} onChange={(e) => setTabelaSelecionada(e.target.value)} className={campoClasse}>
              <option value="all">Geral (todas as tabelas)</option>
              {priceTables.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {ordenados.length > 0 && (
            <button
              type="button"
              onClick={() => setMostrarGrafico((v) => !v)}
              title={mostrarGrafico ? 'Ocultar gráfico Pareto' : `Ver top ${TOP_N_GRAFICO} produtos em gráfico Pareto (valor vendido + % acumulado)`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-sm shadow-sm hover:bg-[var(--color-line)]/40"
            >
              📈
            </button>
          )}
        </div>
      </div>

      {coberturaParcial && (
        <p className="text-xs text-[var(--color-text-soft)]">
          ⚠️ Cobertura por item: {fmtInt.format(coberturaFiltrada.vendasComItem)} de {fmtInt.format(coberturaFiltrada.totalVendas)} vendas do período (
          {fmtPct(coberturaFiltrada.vendasComItem, coberturaFiltrada.totalVendas)}) têm detalhamento por produto — o restante não entra nesta análise (provavelmente
          importado antes do novo formato detalhado do Relatório 396).
        </p>
      )}

      {semDadoDeItem ? (
        <Card className="p-4 text-sm text-[var(--color-text-soft)]">
          Sem detalhamento por item neste período/tabela — disponível a partir das vendas importadas no novo formato do Relatório 396 (com custo unitário por produto).
        </Card>
      ) : ordenados.length === 0 ? (
        <Card className="p-4 text-sm text-[var(--color-text-soft)]">Nenhum dado de item encontrado. Envie um arquivo em Uploads.</Card>
      ) : (
        <div className="space-y-4">
          <Card className="p-4">
            <CardMetrica label="Margem de Lucro" value={fmtBRL.format(totalMargem)} sub={`${fmtPct(totalMargem, totalValor)} do valor vendido`} destaque />
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <CardMetrica label="Valor Vendido" value={fmtBRL.format(totalValor)} />
              <CardMetrica label="Custo Total" value={fmtBRL.format(totalCusto)} />
              <CardMetrica label="Produtos" value={fmtInt.format(ordenados.length)} />
            </div>
          </Card>

          <Card className="overflow-x-auto">
            <TabelaDados
              chaveLinha={(item) => item.codInterno ?? item.produto}
              colunas={[
                { chave: 'produto', cabecalho: 'Produto', render: (i) => <span className="text-[var(--color-text)]">{i.produto}</span> },
                { chave: 'qtd', cabecalho: 'Qtd Vendida', alinhamento: 'right', render: (i) => fmtInt.format(Math.round(i.qtd)) },
                {
                  chave: 'valor',
                  cabecalho: 'Valor Vendido',
                  alinhamento: 'right',
                  render: (i) => (
                    <>
                      <span className="font-medium text-[var(--color-text)]">{fmtBRL.format(i.valorVendido)}</span>{' '}
                      <span className="text-xs text-[var(--color-text-soft)]">({fmtPct(i.valorVendido, totalValor)})</span>
                    </>
                  ),
                },
                { chave: 'custo', cabecalho: 'Custo', alinhamento: 'right', render: (i) => fmtBRL.format(i.custoTotal) },
                {
                  chave: 'margem',
                  cabecalho: 'Margem',
                  alinhamento: 'right',
                  render: (i) => (
                    <span className={i.margem >= 0 ? 'text-[var(--color-text)]' : 'text-bad'}>
                      {fmtBRL.format(i.margem)} <span className="text-xs text-[var(--color-text-soft)]">({(i.margemPct * 100).toFixed(1)}%)</span>
                    </span>
                  ),
                },
                { chave: 'acumulado', cabecalho: '% Acumulado', alinhamento: 'right', render: (i) => `${i.pctAcumulado.toFixed(1)}%` },
                { chave: 'classe', cabecalho: 'Classe', alinhamento: 'right', render: (i) => <Badge tom={CORES_CLASSE[i.classe]}>{i.classe}</Badge> },
              ]}
              linhas={ordenados}
            />
          </Card>

          {mostrarGrafico && (
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
                Curva ABC — top {Math.min(TOP_N_GRAFICO, ordenados.length)} produtos por Valor Vendido
              </h3>
              <div className="h-80">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Chart type="bar" data={chartData as any} options={chartOptions as any} />
              </div>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
