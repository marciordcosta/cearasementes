import type { FiltrosConciliacao as FiltrosConciliacaoType } from '../types';

interface FiltrosConciliacaoProps {
  filtros: FiltrosConciliacaoType;
  onChange: (filtros: FiltrosConciliacaoType) => void;
}

// Mesmo padrão do AddProductForm (Precificação) — os filtros agora vivem no
// Topbar navy, então precisam do estilo translúcido branco em vez do claro.
const campoClasse =
  'rounded-md border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-[var(--color-accent)] focus:bg-white/20 focus:outline-none';

export function FiltrosConciliacao({ filtros, onChange }: FiltrosConciliacaoProps) {
  function atualizar<K extends keyof FiltrosConciliacaoType>(campo: K, valor: FiltrosConciliacaoType[K]) {
    onChange({ ...filtros, [campo]: valor });
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <label className="flex items-center gap-1.5 text-xs text-white/70">
        Data início
        <input type="date" value={filtros.dataInicio ?? ''} onChange={(e) => atualizar('dataInicio', e.target.value || null)} className={campoClasse} />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-white/70">
        Data fim
        <input type="date" value={filtros.dataFim ?? ''} onChange={(e) => atualizar('dataFim', e.target.value || null)} className={campoClasse} />
      </label>

      <select value={filtros.formaPagamento ?? ''} onChange={(e) => atualizar('formaPagamento', (e.target.value || null) as FiltrosConciliacaoType['formaPagamento'])} className={campoClasse}>
        <option value="" className="text-[var(--color-text)]">Todas as formas</option>
        <option value="PIX" className="text-[var(--color-text)]">PIX</option>
        <option value="CARTAO" className="text-[var(--color-text)]">Cartão</option>
        <option value="BOLETO" className="text-[var(--color-text)]">Boleto</option>
        <option value="CHEQUE" className="text-[var(--color-text)]">Cheque</option>
        <option value="RENDIMENTO" className="text-[var(--color-text)]">Rendimento</option>
        <option value="OUTRO" className="text-[var(--color-text)]">Outro</option>
      </select>

      <select value={filtros.conciliado ?? ''} onChange={(e) => atualizar('conciliado', (e.target.value || null) as FiltrosConciliacaoType['conciliado'])} className={campoClasse}>
        <option value="" className="text-[var(--color-text)]">Todos</option>
        <option value="sim" className="text-[var(--color-text)]">Conciliados</option>
        <option value="nao" className="text-[var(--color-text)]">Não conciliados</option>
        <option value="marcados" className="text-[var(--color-text)]">Marcados</option>
      </select>

      <input
        type="text"
        placeholder="Pesquisar…"
        value={filtros.busca}
        onChange={(e) => atualizar('busca', e.target.value)}
        className={`min-w-[160px] ${campoClasse}`}
      />

      <button
        type="button"
        onClick={() => onChange({ bancoNome: null, dataInicio: null, dataFim: null, formaPagamento: null, tipoLancamento: null, conciliado: null, busca: '' })}
        className="whitespace-nowrap rounded-md border border-white/40 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-white/12"
      >
        Limpar Filtros
      </button>
    </div>
  );
}
