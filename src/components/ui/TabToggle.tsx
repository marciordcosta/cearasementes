interface TabToggleOption<T extends string> {
  value: T;
  label: string;
}

interface TabToggleProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: TabToggleOption<T>[];
  className?: string;
}

/** Alternância entre 2+ modos exclusivos (ex.: Cidade única/Rota, Quantidade/Valor) — texto plano com uma linha verde embaixo do modo selecionado, em vez de botões. */
export function TabToggle<T extends string>({ value, onChange, options, className = '' }: TabToggleProps<T>) {
  return (
    <div className={`flex gap-4 ${className}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`border-b-2 pb-1 text-sm font-semibold transition ${
            opt.value === value
              ? 'border-[var(--color-accent)] text-[var(--color-text)]'
              : 'border-transparent text-[var(--color-text-soft)] hover:text-[var(--color-text)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
