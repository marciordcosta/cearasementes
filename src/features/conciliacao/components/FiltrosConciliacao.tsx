import { RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { fmtDataBR } from '@/lib/format';
import type { FiltrosConciliacao as FiltrosConciliacaoType } from '../types';

interface FiltrosConciliacaoProps {
  filtros: FiltrosConciliacaoType;
  onChange: (filtros: FiltrosConciliacaoType) => void;
  /** Limpa também os demais filtros da tela (busca de cada grade, filtro de grupo/sugestão) — só os filtros, a marcação dos itens selecionados continua. */
  onLimparTudo: () => void;
}

interface OpcaoFiltro {
  value: string | null;
  label: string;
}

/**
 * Dropdown de filtro — a caixa mostra o NOME do filtro (ex.: "Transação")
 * só enquanto nada está selecionado; assim que uma opção é escolhida, a
 * caixa passa a mostrar o valor selecionado (ex.: "PIX"), igual um <select>
 * nativo faria, só que com a lista de opções sob nosso controle (pra poder
 * reordenar/estilizar igual em todos os filtros do topbar).
 */
function DropdownFiltro({ rotulo, valor, opcoes, onSelecionar }: { rotulo: string; valor: string | null; opcoes: OpcaoFiltro[]; onSelecionar: (value: string | null) => void }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('click', fechar);
    return () => document.removeEventListener('click', fechar);
  }, [aberto]);

  const textoBotao = valor !== null ? (opcoes.find((o) => o.value === valor)?.label ?? rotulo) : rotulo;

  return (
    <div ref={ref} className="relative">
      <div
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-sm ${
          valor !== null ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-white' : 'border-white/20 bg-white/10 text-white/70 hover:bg-white/15'
        }`}
      >
        <button type="button" onClick={() => setAberto((v) => !v)} className="flex-1 text-left">
          {textoBotao} ▾
        </button>
        {valor !== null && (
          <button
            type="button"
            onClick={() => {
              onSelecionar(null);
              setAberto(false);
            }}
            title={`Limpar filtro de ${rotulo}`}
            className="shrink-0 rounded-full p-0.5 hover:bg-white/20"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
      {aberto && (
        <div className="absolute top-[calc(100%+6px)] left-0 z-[70] min-w-[170px] overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-xl">
          {opcoes.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => {
                onSelecionar(o.value);
                setAberto(false);
              }}
              className={`block w-full px-3.5 py-2.5 text-left text-sm ${o.value === valor ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text)] hover:bg-[var(--color-page)]'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FiltrosConciliacao({ filtros, onChange, onLimparTudo }: FiltrosConciliacaoProps) {
  const [dataAberta, setDataAberta] = useState(false);
  const dataRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dataAberta) return;
    function fechar(e: MouseEvent) {
      if (dataRef.current && !dataRef.current.contains(e.target as Node)) setDataAberta(false);
    }
    document.addEventListener('click', fechar);
    return () => document.removeEventListener('click', fechar);
  }, [dataAberta]);

  function atualizar<K extends keyof FiltrosConciliacaoType>(campo: K, valor: FiltrosConciliacaoType[K]) {
    onChange({ ...filtros, [campo]: valor });
  }

  const rotuloData = filtros.dataInicio || filtros.dataFim ? `${filtros.dataInicio ? fmtDataBR(filtros.dataInicio) : '…'} – ${filtros.dataFim ? fmtDataBR(filtros.dataFim) : '…'}` : 'Data';

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div ref={dataRef} className="relative">
        <div
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-sm ${
            filtros.dataInicio || filtros.dataFim ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-white' : 'border-white/20 bg-white/10 text-white/70 hover:bg-white/15'
          }`}
        >
          <button type="button" onClick={() => setDataAberta((v) => !v)} className="flex-1 text-left">
            {rotuloData}
          </button>
          {(filtros.dataInicio || filtros.dataFim) && (
            <button
              type="button"
              onClick={() => {
                onChange({ ...filtros, dataInicio: null, dataFim: null });
                setDataAberta(false);
              }}
              title="Limpar filtro de Data"
              className="shrink-0 rounded-full p-0.5 hover:bg-white/20"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
        {dataAberta && (
          <div className="absolute top-[calc(100%+6px)] left-0 z-[70] flex flex-col gap-2.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-xl">
            <label className="flex items-center justify-between gap-2.5 text-xs text-[var(--color-text-soft)]">
              Início
              <input
                type="date"
                value={filtros.dataInicio ?? ''}
                onChange={(e) => atualizar('dataInicio', e.target.value || null)}
                className="rounded-md border border-[var(--color-line)] bg-[var(--color-page)] px-2 py-1.5 text-sm text-[var(--color-text)]"
              />
            </label>
            <label className="flex items-center justify-between gap-2.5 text-xs text-[var(--color-text-soft)]">
              Fim
              <input
                type="date"
                value={filtros.dataFim ?? ''}
                onChange={(e) => atualizar('dataFim', e.target.value || null)}
                className="rounded-md border border-[var(--color-line)] bg-[var(--color-page)] px-2 py-1.5 text-sm text-[var(--color-text)]"
              />
            </label>
          </div>
        )}
      </div>

      <DropdownFiltro
        rotulo="Pagamento"
        valor={filtros.formaPagamento}
        onSelecionar={(v) => atualizar('formaPagamento', v as FiltrosConciliacaoType['formaPagamento'])}
        opcoes={[
          { value: null, label: 'Todas as formas' },
          { value: 'PIX', label: 'PIX' },
          { value: 'CARTAO', label: 'Cartão' },
          { value: 'BOLETO', label: 'Boleto' },
          { value: 'CHEQUE', label: 'Cheque' },
          { value: 'RENDIMENTO', label: 'Rendimento' },
          { value: 'OUTRO', label: 'Outro' },
        ]}
      />

      <DropdownFiltro
        rotulo="Movimentação"
        valor={filtros.tipoLancamento}
        onSelecionar={(v) => atualizar('tipoLancamento', v as FiltrosConciliacaoType['tipoLancamento'])}
        opcoes={[
          { value: null, label: 'Todas as operações' },
          { value: 'Entrada', label: 'Entradas' },
          { value: 'Saída', label: 'Saídas' },
        ]}
      />

      <DropdownFiltro
        rotulo="Status"
        valor={filtros.conciliado}
        onSelecionar={(v) => atualizar('conciliado', v as FiltrosConciliacaoType['conciliado'])}
        opcoes={[
          { value: null, label: 'Todos' },
          { value: 'sim', label: 'Conciliados' },
          { value: 'nao', label: 'Não conciliados' },
          { value: 'preConciliados', label: 'Pré-conciliados' },
          { value: 'preLancamentos', label: 'Pré-lançamentos' },
          { value: 'divergentes', label: 'Divergentes' },
          { value: 'editados', label: 'Editados' },
        ]}
      />

      <button
        type="button"
        onClick={() => {
          onChange({ bancoNome: null, dataInicio: null, dataFim: null, formaPagamento: null, tipoLancamento: null, conciliado: null, busca: '' });
          onLimparTudo();
        }}
        className="whitespace-nowrap rounded-md border border-white/40 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-white/12"
      >
        Limpar Filtros
      </button>
    </div>
  );
}
