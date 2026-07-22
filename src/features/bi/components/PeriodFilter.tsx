import type { PeriodMode } from '../types';
import { getPeriodLabel, type PeriodContext } from '../calculations';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface PeriodFilterProps {
  ctx: PeriodContext;
  periods: string[];
  selectedPeriod: string;
  onChangeMode: (mode: PeriodMode) => void;
  onChangeSeasonStart: (month: number) => void;
  onChangeSelectedPeriod: (period: string) => void;
}

const campoClasse =
  'rounded-md border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white focus:border-[var(--color-accent)] focus:bg-white/20 focus:outline-none';

export function PeriodFilter({ ctx, periods, selectedPeriod, onChangeMode, onChangeSeasonStart, onChangeSelectedPeriod }: PeriodFilterProps) {
  if (periods.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        <label className="text-sm text-white/70">Agrupar por:</label>
        <select value={ctx.mode} onChange={(e) => onChangeMode(e.target.value as PeriodMode)} className={campoClasse}>
          <option value="calendar" className="text-[var(--color-text)]">Ano civil</option>
          <option value="season" className="text-[var(--color-text)]">Safra</option>
        </select>
      </div>

      {ctx.mode === 'season' && (
        <div className="flex items-center gap-1.5">
          <label className="text-sm text-white/70">Início da safra:</label>
          <select value={ctx.seasonStartMonth} onChange={(e) => onChangeSeasonStart(Number(e.target.value))} className={campoClasse}>
            {MESES.map((nome, i) => (
              <option key={nome} value={i + 1} className="text-[var(--color-text)]">
                {nome}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <label className="text-sm text-white/70">{ctx.mode === 'season' ? 'Safra:' : 'Ano:'}</label>
        <select value={selectedPeriod} onChange={(e) => onChangeSelectedPeriod(e.target.value)} className={campoClasse}>
          {periods.map((p) => (
            <option key={p} value={p} className="text-[var(--color-text)]">
              {getPeriodLabel(ctx, p)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
