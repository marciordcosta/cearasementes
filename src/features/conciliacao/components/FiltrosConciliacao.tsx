import { RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fmtDataBR } from '@/lib/format';
import type { EscopoFiltro, FiltrosConciliacao as FiltrosConciliacaoType } from '../types';

const OPCOES_ESCOPO: { value: EscopoFiltro; label: string }[] = [
  { value: 'ambos', label: 'Ambos' },
  { value: 'banco', label: 'Banco' },
  { value: 'sistema', label: 'Sistema' },
];

/** Escolhe em qual grade um filtro vale — Banco, Sistema, ou as duas (padrão). Fica sempre no topo do popup do filtro, antes das opções em si. */
function SeletorEscopo({ valor, onSelecionar }: { valor: EscopoFiltro; onSelecionar: (v: EscopoFiltro) => void }) {
  return (
    <div className="flex gap-1 border-b border-[var(--color-line)] p-2">
      {OPCOES_ESCOPO.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onSelecionar(o.value)}
          className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold transition ${
            o.value === valor ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-page)] text-[var(--color-text-soft)] hover:text-[var(--color-text)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

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
function DropdownFiltro({
  rotulo,
  valor,
  opcoes,
  onSelecionar,
  extra,
  valorPadrao = null,
}: {
  rotulo: string;
  valor: string | null;
  opcoes: OpcaoFiltro[];
  onSelecionar: (value: string | null) => void;
  /** Conteúdo extra no topo do popup, antes das opções — usado pro seletor de escopo (Banco/Sistema/Ambos). */
  extra?: ReactNode;
  /** Valor considerado "de base" (padrão null = sem filtro nenhum) — só o filtro de Status usa outro (`'nao'`, o estado principal do dia a dia): nesse estado não faz sentido oferecer "restaurar", e restaurar dos demais volta pra ele, não pra "Todos". */
  valorPadrao?: string | null;
}) {
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
          valor !== valorPadrao ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/20 text-white' : 'border-white/20 bg-white/10 text-white/70 hover:bg-white/15'
        }`}
      >
        <button type="button" onClick={() => setAberto((v) => !v)} className="flex-1 text-left">
          {textoBotao} ▾
        </button>
        {valor !== valorPadrao && (
          <button
            type="button"
            onClick={() => {
              onSelecionar(valorPadrao);
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
          {extra}
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
            <SeletorEscopo valor={filtros.escopoData} onSelecionar={(v) => atualizar('escopoData', v)} />
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
        extra={<SeletorEscopo valor={filtros.escopoPagamento} onSelecionar={(v) => atualizar('escopoPagamento', v)} />}
        opcoes={[
          { value: null, label: 'Todas as formas' },
          { value: 'PIX', label: 'PIX' },
          { value: 'CARTAO', label: 'Cartão' },
          { value: 'BOLETO', label: 'Boleto' },
          { value: 'CHEQUE', label: 'Cheque' },
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
        valorPadrao="nao"
        opcoes={[
          { value: 'nao', label: 'Não conciliados' },
          { value: 'sim', label: 'Conciliados' },
          { value: 'preConciliados', label: 'Pré-conciliados' },
          { value: 'preLancamentos', label: 'Pré-lançamentos' },
          { value: 'divergentes', label: 'Divergentes' },
          { value: 'editados', label: 'Editados' },
          { value: null, label: 'Todos' },
        ]}
      />

      <button
        type="button"
        onClick={() => {
          onChange({
            bancoNome: null,
            dataInicio: null,
            dataFim: null,
            escopoData: 'ambos',
            formaPagamento: null,
            escopoPagamento: 'ambos',
            tipoLancamento: null,
            conciliado: 'nao',
            busca: '',
          });
          onLimparTudo();
        }}
        className="whitespace-nowrap rounded-md border border-white/40 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-white/12"
      >
        Limpar Filtros
      </button>
    </div>
  );
}
