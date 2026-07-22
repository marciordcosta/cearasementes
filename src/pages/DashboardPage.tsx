import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { useTheme } from '@/hooks/useTheme';
import { fetchEntregas, fetchVendas } from '@/features/bi/api';
import { agregarEntregas, agregarVendas } from '@/features/bi/aggregate';
import { PeriodFilter } from '@/features/bi/components/PeriodFilter';
import { YearComparisonTable } from '@/features/bi/components/YearComparisonTable';
import { Vendas396Section } from '@/features/bi/components/Vendas396Section';
import { Entregas124Section } from '@/features/bi/components/Entregas124Section';
import { getAvailableYears, type PeriodContext } from '@/features/bi/calculations';
import type { PeriodMode } from '@/features/bi/types';

export function DashboardPage() {
  const { isDark } = useTheme();

  const { data: entregas = [] } = useQuery({ queryKey: ['bi', 'entregas'], queryFn: fetchEntregas });
  const { data: vendas = [] } = useQuery({ queryKey: ['bi', 'vendas'], queryFn: fetchVendas });

  const carriers = useMemo(() => agregarEntregas(entregas), [entregas]);
  const priceTables = useMemo(() => agregarVendas(vendas), [vendas]);

  const [periodMode, setPeriodMode] = useState<PeriodMode>('calendar');
  const [seasonStartMonth, setSeasonStartMonth] = useState(10);
  const ctx: PeriodContext = useMemo(() => ({ mode: periodMode, seasonStartMonth }), [periodMode, seasonStartMonth]);

  const periods = useMemo(() => getAvailableYears(ctx, priceTables, carriers), [ctx, priceTables, carriers]);
  const [selectedPeriod, setSelectedPeriod] = useState('all');

  // Mantém a mesma seleção se ela ainda existir; senão cai para o período mais
  // recente (ou "all" se houver menos de 2 períodos) — igual ao BI local original.
  useEffect(() => {
    if (periods.length < 2) {
      setSelectedPeriod('all');
      return;
    }
    setSelectedPeriod((prev) => (periods.includes(prev) ? prev : periods[periods.length - 1]));
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
      <YearComparisonTable ctx={ctx} priceTables={priceTables} carriers={carriers} isDark={isDark} />
      <Vendas396Section ctx={ctx} priceTables={priceTables} selectedPeriod={selectedPeriod} isDark={isDark} />
      <Entregas124Section ctx={ctx} carriers={carriers} priceTables={priceTables} selectedPeriod={selectedPeriod} isDark={isDark} />
    </AppShell>
  );
}
