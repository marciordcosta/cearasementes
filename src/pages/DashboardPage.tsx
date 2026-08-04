import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { useTheme } from '@/hooks/useTheme';
import { fetchEntregas, fetchVendaItens, fetchVendas } from '@/features/bi/api';
import { agregarCoberturaItens, agregarEntregas, agregarItens, agregarVendas } from '@/features/bi/aggregate';
import { PeriodFilter } from '@/features/bi/components/PeriodFilter';
import { TotalGeralCard } from '@/features/bi/components/TotalGeralCard';
import { YearComparisonTable } from '@/features/bi/components/YearComparisonTable';
import { Vendas396Section } from '@/features/bi/components/Vendas396Section';
import { Entregas124Section } from '@/features/bi/components/Entregas124Section';
import { AnaliseProdutosSection } from '@/features/bi/components/AnaliseProdutosSection';
import { construirTaxasPorTabela, getAvailableYears, type PeriodContext } from '@/features/bi/calculations';
import type { PeriodMode } from '@/features/bi/types';
import { fetchCanais, fetchCategorias } from '@/features/pricing/api';

export function DashboardPage() {
  const { isDark } = useTheme();

  const { data: entregas = [] } = useQuery({ queryKey: ['bi', 'entregas'], queryFn: fetchEntregas });
  const { data: vendas = [] } = useQuery({ queryKey: ['bi', 'vendas'], queryFn: fetchVendas });
  const { data: itens = [] } = useQuery({ queryKey: ['bi', 'itens'], queryFn: fetchVendaItens });
  const { data: canais = [] } = useQuery({ queryKey: ['pricing', 'canais'], queryFn: fetchCanais });
  const { data: categorias = [] } = useQuery({ queryKey: ['pricing', 'categorias'], queryFn: fetchCategorias });

  const carriers = useMemo(() => agregarEntregas(entregas), [entregas]);
  const priceTables = useMemo(() => agregarVendas(vendas), [vendas]);
  const itemAggs = useMemo(() => agregarItens(vendas, itens), [vendas, itens]);
  const cobertura = useMemo(() => agregarCoberturaItens(vendas, itens), [vendas, itens]);
  const taxasPorTabela = useMemo(() => construirTaxasPorTabela(canais, categorias), [canais, categorias]);

  const [periodMode, setPeriodMode] = useState<PeriodMode>('calendar');
  const [seasonStartMonth, setSeasonStartMonth] = useState(10);
  const ctx: PeriodContext = useMemo(() => ({ mode: periodMode, seasonStartMonth }), [periodMode, seasonStartMonth]);

  const periods = useMemo(() => getAvailableYears(ctx, priceTables, carriers), [ctx, priceTables, carriers]);
  // Começa vazio (não é nenhum período nem "all") só pra forçar o efeito abaixo
  // a cair no período mais recente no primeiro carregamento.
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const jaEscolheuInicial = useRef(false);

  // Antes dos dados chegarem do Supabase, `periods` vem vazio — não é ainda
  // "só tem 1 período" de verdade, é só a query carregando. Sem esse ref, a
  // escolha automática de "all" durante esse instante ficava marcada como se
  // fosse escolha manual do usuário (a regra "all uma vez escolhido não volta
  // sozinho" abaixo), e o dashboard nunca mais pulava pro ano mais recente.
  useEffect(() => {
    if (periods.length === 0) return;

    if (!jaEscolheuInicial.current) {
      jaEscolheuInicial.current = true;
      setSelectedPeriod(periods.length < 2 ? 'all' : periods[periods.length - 1]);
      return;
    }

    // Mantém a seleção atual se ainda for válida — "all" (Todos) é sempre
    // válido, uma vez escolhido manualmente não volta sozinho pro ano mais
    // recente. Senão cai pro período mais recente.
    setSelectedPeriod((prev) => (prev === 'all' || periods.includes(prev) ? prev : periods[periods.length - 1]));
  }, [periods]);

  return (
    <AppShell
      topbarNavy
      title="BI — Análise de Relatórios"
      actions={
        <PeriodFilter
          ctx={ctx}
          periods={periods}
          selectedPeriod={selectedPeriod}
          onChangeMode={setPeriodMode}
          onChangeSeasonStart={setSeasonStartMonth}
          onChangeSelectedPeriod={setSelectedPeriod}
        />
      }
    >
      <TotalGeralCard ctx={ctx} priceTables={priceTables} selectedPeriod={selectedPeriod} />
      <YearComparisonTable ctx={ctx} priceTables={priceTables} carriers={carriers} selectedPeriod={selectedPeriod} isDark={isDark} />
      <Vendas396Section ctx={ctx} priceTables={priceTables} selectedPeriod={selectedPeriod} isDark={isDark} />
      <Entregas124Section ctx={ctx} carriers={carriers} priceTables={priceTables} selectedPeriod={selectedPeriod} isDark={isDark} />
      <AnaliseProdutosSection
        ctx={ctx}
        items={itemAggs}
        cobertura={cobertura}
        priceTables={priceTables}
        selectedPeriod={selectedPeriod}
        isDark={isDark}
        taxasPorTabela={taxasPorTabela}
      />
    </AppShell>
  );
}
