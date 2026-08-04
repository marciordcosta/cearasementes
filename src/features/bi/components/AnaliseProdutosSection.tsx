import { useMemo, useState } from 'react';
import { Chart } from 'react-chartjs-2';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { CardMetrica } from '@/components/ui/CardMetrica';
import { TabelaDados } from '@/components/ui/TabelaDados';
import { chartChrome, palette } from '@/lib/chartSetup';
import { fmtBRL, fmtInt, fmtPct } from '@/lib/format';
import type { CoberturaItens } from '../aggregate';
import { classificarABC, type CriterioABC, getCoberturaFiltrada, getFilteredItems, type PeriodContext, type TaxasTabela, valorCriterioABC } from '../calculations';
import type { FilteredItemView, ItemAgg, PriceTableAgg } from '../types';

interface AnaliseProdutosSectionProps {
  ctx: PeriodContext;
  items: ItemAgg[];
  cobertura: CoberturaItens[];
  priceTables: PriceTableAgg[];
  selectedPeriod: string;
  isDark: boolean;
  /** Encargos (%) por Tabela de Preço, vindos do módulo Precificação — ver construirTaxasPorTabela em calculations.ts. */
  taxasPorTabela: Map<string, TaxasTabela>;
}

const CORES_CLASSE: Record<'A' | 'B' | 'C', 'bom' | 'neutro' | 'ruim'> = { A: 'bom', B: 'neutro', C: 'ruim' };
const campoClasse = 'rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';

/** Quantos produtos aparecem no gráfico Pareto — além disso a barra fica ilegível, e o rabo da curva ABC (Classe C) tende a ser uma cauda longa de itens pouco relevantes. */
const TOP_N_GRAFICO = 20;

interface LinhaProduto extends FilteredItemView {
  classe: 'A' | 'B' | 'C';
  /** % acumulado (curva ABC clássica, usado só no gráfico Pareto) — soma progressiva do critério escolhido até esse item, dividida pelo total. */
  pctAcumulado: number;
}

/**
 * Análise por Produto (Relatório 396 detalhado) — quantidade vendida, margem
 * de lucro (valor vendido − custo) e Curva ABC por produto, seguindo o mesmo
 * filtro de período do topo do BI. Só existe dado aqui pra vendas importadas
 * no formato novo do 396 (que já traz custo_unitario por item); vendas no
 * formato antigo entram na Tabela de Preço/Total Geral só do jeito de sempre.
 */
const ROTULO_CRITERIO: Record<CriterioABC, string> = { valor: 'Faturamento', qtd: 'Quantidade', margem: 'Margem de Lucro' };

export function AnaliseProdutosSection({ ctx, items, cobertura, priceTables, selectedPeriod, isDark, taxasPorTabela }: AnaliseProdutosSectionProps) {
  const [mostrarGrafico, setMostrarGrafico] = useState(false);
  const [tabelaSelecionada, setTabelaSelecionada] = useState('all');
  const [criterioABC, setCriterioABC] = useState<CriterioABC>('valor');
  const [classeFiltro, setClasseFiltro] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const colors = palette(isDark);
  const c = useMemo(() => chartChrome(isDark), [isDark]);

  const filtrados = useMemo(
    () => getFilteredItems(ctx, items, selectedPeriod, tabelaSelecionada, taxasPorTabela),
    [ctx, items, selectedPeriod, tabelaSelecionada, taxasPorTabela],
  );
  const totalValor = filtrados.reduce((s, i) => s + i.valorVendido, 0);
  const totalCusto = filtrados.reduce((s, i) => s + i.custoTotal, 0);
  const totalQtd = filtrados.reduce((s, i) => s + i.qtd, 0);
  // Encargos* (imposto+comissão+cartão) e Desconto Médio são exibidos SEPARADOS no card — o desconto é só
  // informativo (já está refletido no Valor Vendido líquido, ver comentário em calculations.ts), não é somado
  // no Encargos* pra não sugerir que ele também pesa na Margem.
  const totalEncargosSemDesconto = filtrados.reduce(
    (s, i) => s + i.encargosDetalhe.impostoReais + i.encargosDetalhe.comissaoReais + i.encargosDetalhe.cartaoReais,
    0,
  );
  const totalDesconto = filtrados.reduce((s, i) => s + i.encargosDetalhe.descontoReais, 0);
  // Margem líquida (já desconta Encargos, não só o Custo) — soma direto de i.margem, não `totalValor - totalCusto`.
  const totalMargem = filtrados.reduce((s, i) => s + i.margem, 0);

  // Cobertura: quantas vendas do período/tabela selecionados têm item importado — avisa quando a análise está vendo só uma fração das vendas (ex.: ano importado sem detalhamento por item), pra não passar despercebido um total "certinho" mas incompleto.
  const coberturaFiltrada = useMemo(() => getCoberturaFiltrada(ctx, cobertura, selectedPeriod, tabelaSelecionada), [ctx, cobertura, selectedPeriod, tabelaSelecionada]);
  const coberturaParcial = coberturaFiltrada.totalVendas > 0 && coberturaFiltrada.vendasComItem < coberturaFiltrada.totalVendas;

  // Combina item + classe ABC + % acumulado numa linha só — evita recalcular/procurar por índice na hora de renderizar a tabela e o gráfico.
  // Ordenação, acumulado e classificação seguem o MESMO critério escolhido (Faturamento/Quantidade/Margem) — trocar o critério reordena a tabela inteira, não só a coluna Classe.
  const ordenados = useMemo<LinhaProduto[]>(() => {
    const ordenadosPorCriterio = [...filtrados].sort((a, b) => valorCriterioABC(b, criterioABC) - valorCriterioABC(a, criterioABC));
    const classes = classificarABC(ordenadosPorCriterio, criterioABC);
    const totalCriterio = ordenadosPorCriterio.reduce((s, i) => s + valorCriterioABC(i, criterioABC), 0);
    let acumulado = 0;
    return ordenadosPorCriterio.map((item, i) => {
      acumulado += valorCriterioABC(item, criterioABC);
      return { ...item, classe: classes[i], pctAcumulado: totalCriterio > 0 ? (acumulado / totalCriterio) * 100 : 0 };
    });
  }, [filtrados, criterioABC]);

  const semDadoDeItem = ordenados.length === 0 && priceTables.length > 0;

  // Filtro de Classe só restringe QUAIS linhas aparecem na tabela/gráfico — a classificação em si
  // (Classe de cada produto) já foi calculada em cima do conjunto INTEIRO acima, senão filtrar por
  // Classe mudaria os limites de 80%/95% e todo produto viraria "A" de novo.
  const exibidos = useMemo(() => (classeFiltro === 'all' ? ordenados : ordenados.filter((i) => i.classe === classeFiltro)), [ordenados, classeFiltro]);

  const top = exibidos.slice(0, TOP_N_GRAFICO);
  const chartData = useMemo(
    () => ({
      labels: top.map((i) => i.produto),
      datasets: [
        {
          type: 'bar' as const,
          label: ROTULO_CRITERIO[criterioABC],
          data: top.map((i) => valorCriterioABC(i, criterioABC)),
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
    [top, colors, criterioABC],
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
              ctx2.dataset.label === '% Acumulado'
                ? `${ctx2.dataset.label}: ${ctx2.parsed.y?.toFixed(1)}%`
                : `${ctx2.dataset.label}: ${criterioABC === 'qtd' ? fmtInt.format(ctx2.parsed.y ?? 0) : fmtBRL.format(ctx2.parsed.y ?? 0)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: c.text2, maxRotation: 60, minRotation: 60 } },
        y: { position: 'left' as const, beginAtZero: true, grid: { color: c.grid }, ticks: { display: false }, border: { display: false } },
        y1: { position: 'right' as const, beginAtZero: true, max: 100, grid: { display: false }, ticks: { color: c.text2, callback: (v: number | string) => `${v}%` } },
      },
    }),
    [c, criterioABC],
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[var(--color-text)]">
          Análise por Produto <span className="font-normal text-[var(--color-text-soft)]">(margem e curva ABC — Relatório 396)</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
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
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-[var(--color-text-soft)]">Curva ABC por:</label>
            <select value={criterioABC} onChange={(e) => setCriterioABC(e.target.value as CriterioABC)} className={campoClasse}>
              <option value="valor">Faturamento</option>
              <option value="qtd">Quantidade</option>
              <option value="margem">Margem de Lucro</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-[var(--color-text-soft)]">Classe:</label>
            <select value={classeFiltro} onChange={(e) => setClasseFiltro(e.target.value as 'all' | 'A' | 'B' | 'C')} className={campoClasse}>
              <option value="all">Todas</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>
          {ordenados.length > 0 && (
            <button
              type="button"
              onClick={() => setMostrarGrafico((v) => !v)}
              title={mostrarGrafico ? 'Ocultar gráfico Pareto' : `Ver top ${TOP_N_GRAFICO} produtos em gráfico Pareto (${ROTULO_CRITERIO[criterioABC].toLowerCase()} + % acumulado)`}
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
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
              <CardMetrica label="Valor Vendido" value={fmtBRL.format(totalValor)} />
              <CardMetrica label="Custo Total" value={fmtBRL.format(totalCusto)} sub={`${fmtPct(totalCusto, totalValor)} do valor vendido`} />
              <CardMetrica
                label="Encargos*"
                value={fmtBRL.format(totalEncargosSemDesconto)}
                sub={`${fmtPct(totalEncargosSemDesconto, totalValor)} do valor vendido`}
              />
              <CardMetrica label="Desconto Médio" value={fmtBRL.format(totalDesconto)} sub={`${fmtPct(totalDesconto, totalValor)} do valor vendido`} />
              <CardMetrica label="Produtos" value={fmtInt.format(ordenados.length)} />
            </div>
          </Card>

          <Card className="overflow-x-auto">
            <TabelaDados
              chaveLinha={(item) => item.codInterno ?? item.produto}
              colunas={[
                {
                  chave: 'produto',
                  cabecalho: 'Produto',
                  className: 'whitespace-nowrap',
                  render: (i) => <span className="text-xs text-[var(--color-text)]">{i.produto}</span>,
                },
                {
                  chave: 'qtd',
                  cabecalho: <span title="Participação desse produto na quantidade TOTAL vendida no período/tabela">Qtd Vendida</span>,
                  alinhamento: 'right',
                  classeCabecalho: 'bg-[var(--color-accent)]/10',
                  className: 'whitespace-nowrap bg-[var(--color-accent)]/5',
                  render: (i) => (
                    <span className="text-xs">
                      <span className="font-medium text-[var(--color-text)]">{fmtInt.format(Math.round(i.qtd))}</span>{' '}
                      <span className="text-[var(--color-text-soft)]">({fmtPct(i.qtd, totalQtd)})</span>
                    </span>
                  ),
                },
                {
                  chave: 'valor',
                  cabecalho: <span title="Participação desse produto no faturamento TOTAL do período/tabela">Valor Vendido</span>,
                  alinhamento: 'right',
                  classeCabecalho: 'bg-[var(--color-accent)]/10',
                  className: 'whitespace-nowrap bg-[var(--color-accent)]/5',
                  render: (i) => (
                    <span className="text-xs">
                      <span className="font-medium text-[var(--color-text)]">{fmtBRL.format(i.valorVendido)}</span>{' '}
                      <span className="text-[var(--color-text-soft)]">({fmtPct(i.valorVendido, totalValor)})</span>
                    </span>
                  ),
                },
                {
                  chave: 'custo',
                  cabecalho: <span title="Custo em relação ao faturamento DESSE produto (custo ÷ valor vendido dele mesmo)">Custo</span>,
                  alinhamento: 'right',
                  className: 'whitespace-nowrap',
                  render: (i) => (
                    <span className="text-xs">
                      <span className="font-medium text-[var(--color-text)]">{fmtBRL.format(i.custoTotal)}</span>{' '}
                      <span className="text-[var(--color-text-soft)]">({fmtPct(i.custoTotal, i.valorVendido)})</span>
                    </span>
                  ),
                },
                {
                  chave: 'encargos',
                  cabecalho: (
                    <span title="Estimativa: imposto + comissão + cartão (% da Tabela de Preço, ver Precificação) sobre o valor vendido desse produto. Marcado com * porque a alíquota de imposto usada é uma média entre Categorias, não a exata do produto. O desconto médio é informativo só no card principal, não entra aqui.">
                      Encargos*
                    </span>
                  ),
                  alinhamento: 'right',
                  className: 'whitespace-nowrap',
                  render: (i) => {
                    const encargosSemDesconto = i.encargosDetalhe.impostoReais + i.encargosDetalhe.comissaoReais + i.encargosDetalhe.cartaoReais;
                    return (
                      <span
                        className="text-xs"
                        title={[
                          `Imposto: ${fmtBRL.format(i.encargosDetalhe.impostoReais)} (${fmtPct(i.encargosDetalhe.impostoReais, i.valorVendido)})`,
                          `Comissão: ${fmtBRL.format(i.encargosDetalhe.comissaoReais)} (${fmtPct(i.encargosDetalhe.comissaoReais, i.valorVendido)})`,
                          `Cartão: ${fmtBRL.format(i.encargosDetalhe.cartaoReais)} (${fmtPct(i.encargosDetalhe.cartaoReais, i.valorVendido)})`,
                        ].join('\n')}
                      >
                        <span className="font-medium text-[var(--color-text)]">{fmtBRL.format(encargosSemDesconto)}</span>{' '}
                        <span className="text-[var(--color-text-soft)]">({fmtPct(encargosSemDesconto, i.valorVendido)})</span>
                      </span>
                    );
                  },
                },
                {
                  chave: 'margem',
                  cabecalho: (
                    <span title="Margem líquida do produto (valor vendido − custo − Encargos*) e rentabilidade dela mesma (margem ÷ valor vendido)">Margem</span>
                  ),
                  alinhamento: 'right',
                  className: 'whitespace-nowrap',
                  render: (i) => (
                    <span className={`text-xs ${i.margem >= 0 ? 'text-[var(--color-text)]' : 'text-bad'}`}>
                      {fmtBRL.format(i.margem)} <span className="text-[var(--color-text-soft)]">({(i.margemPct * 100).toFixed(1)}%)</span>
                    </span>
                  ),
                },
                { chave: 'classe', cabecalho: 'Classe', alinhamento: 'right', render: (i) => <Badge tom={CORES_CLASSE[i.classe]}>{i.classe}</Badge> },
              ]}
              linhas={exibidos}
              vazio={`Nenhum produto Classe ${classeFiltro} neste período/tabela.`}
            />
          </Card>

          {mostrarGrafico && exibidos.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
                Curva ABC — top {Math.min(TOP_N_GRAFICO, exibidos.length)} produtos por {ROTULO_CRITERIO[criterioABC]}
                {classeFiltro !== 'all' ? ` (Classe ${classeFiltro})` : ''}
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
