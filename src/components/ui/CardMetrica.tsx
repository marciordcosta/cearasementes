interface CardMetricaProps {
  label: string;
  value: string;
  sub?: string;
  destaque?: boolean;
}

export function CardMetrica({ label, value, sub, destaque = false }: CardMetricaProps) {
  return (
    <div>
      <p className="text-xs text-[var(--color-text-soft)]">{label}</p>
      <p className={`font-semibold text-[var(--color-text)] ${destaque ? 'text-2xl' : 'text-lg'}`}>{value}</p>
      {sub && <p className="text-xs text-[var(--color-text-soft)]">{sub}</p>}
    </div>
  );
}
