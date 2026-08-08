import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PieController,
  PointElement,
  Tooltip,
  type Plugin,
} from 'chart.js';

const CAT_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const CAT_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

export function palette(isDark: boolean): string[] {
  return isDark ? CAT_DARK : CAT_LIGHT;
}

export function chartChrome(isDark: boolean) {
  return isDark
    ? { text2: '#c3c2b7', muted: '#898781', grid: '#2c2c2a', baseline: '#383835', tooltipBg: '#1a1a19' }
    : { text2: '#52514e', muted: '#898781', grid: '#e1e0d9', baseline: '#c3c2b7', tooltipBg: '#fcfcfb' };
}

// Desenha o valor de cada barra acima/ao lado dela — Chart.js não faz isso
// nativamente, então usamos um plugin próprio (igual ao BI local original).
export const directLabelPlugin: Plugin<'bar'> = {
  id: 'directLabel',
  afterDatasetsDraw(chart, _args, opts: { enabled?: boolean; color?: string; formatter?: (v: number) => string }) {
    if (!opts?.enabled) return;
    const { ctx } = chart;
    const horizontal = chart.options.indexAxis === 'y';
    chart.data.datasets.forEach((dataset, di) => {
      const meta = chart.getDatasetMeta(di);
      meta.data.forEach((bar, i) => {
        const value = dataset.data[i] as number | null | undefined;
        if (value === undefined || value === null) return;
        const label = opts.formatter ? opts.formatter(value) : String(value);
        ctx.save();
        ctx.fillStyle = opts.color || '#52514e';
        ctx.font = `600 11px system-ui, -apple-system, "Segoe UI", sans-serif`;
        if (horizontal) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, bar.x + 6, bar.y);
        } else {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(label, bar.x, bar.y - 6);
        }
        ctx.restore();
      });
    });
  },
};

// Linhas verticais pontilhadas discretas na marcação de cada mês (eixo X) —
// o grid nativo do Chart.js não tem opção de tracejado por gridline (só a
// borda do eixo), então desenhamos por conta própria. Passado por instância
// via prop `plugins` do react-chartjs-2 (não precisa Chart.register); a cor
// vem fechada na fábrica pra não depender de tipagem de opção customizada.
export function criarGridVerticalPontilhado(color: string): Plugin<'line'> {
  return {
    id: 'dashedVerticalGrid',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const xScale = scales.x;
      if (!xScale || !chartArea) return;
      ctx.save();
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = color;
      const contagem = xScale.ticks.length;
      for (let i = 0; i < contagem; i++) {
        const x = xScale.getPixelForTick(i);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

// Registrado no carregamento do módulo (não dentro de um useEffect!). O
// <Bar> do react-chartjs-2 cria o gráfico no PRÓPRIO useEffect dele, que —
// por ser filho — dispara ANTES do efeito do componente pai. Registrar aqui
// dentro de um efeito do componente pai chegava tarde demais: o Chart.js
// tentava montar sem "category"/"linear" ainda registrados, lançava, e sem
// error boundary isso derrubava a árvore inteira (tela em branco).
Chart.register(CategoryScale, LinearScale, BarElement, BarController, LineElement, PointElement, LineController, ArcElement, PieController, Tooltip, Legend, directLabelPlugin);
Chart.defaults.animation = false;
