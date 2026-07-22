import { Bar } from 'react-chartjs-2';
import { chartChrome } from '@/lib/chartSetup';
import { fmtBRL } from '@/lib/format';

interface MonthlyBarChartProps {
  labels: string[];
  data: number[];
  color: string;
  isDark: boolean;
}

export function MonthlyBarChart({ labels, data, color, isDark }: MonthlyBarChartProps) {
  const c = chartChrome(isDark);

  return (
    <Bar
      data={{
        labels,
        datasets: [
          {
            label: 'Valor Líquido',
            data,
            backgroundColor: color,
            borderRadius: 4,
            borderSkipped: false,
            barThickness: 24,
            maxBarThickness: 32,
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: c.tooltipBg,
            titleColor: c.text2,
            bodyColor: c.text2,
            borderColor: c.baseline,
            borderWidth: 1,
            callbacks: { label: (ctx) => fmtBRL.format(ctx.raw as number) },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: c.text2 } },
          y: { beginAtZero: true, grid: { color: c.grid }, ticks: { display: false }, border: { display: false } },
        },
      }}
    />
  );
}
