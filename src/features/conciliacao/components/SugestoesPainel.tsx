import { useEffect, useState } from 'react';
import { PainelFlutuante } from '@/components/ui/PainelFlutuante';
import { fmtBRL, fmtDataBR } from '@/lib/format';
import type { LancamentoBanco, LancamentoSistema, SugestoesConciliacao } from '../types';

interface SugestoesPainelProps {
  itemBanco: LancamentoBanco | null;
  sugestoes: SugestoesConciliacao | null;
  /** O painel só fecha de verdade quando o item é desmarcado (fora daqui) — o "x" apenas minimiza. */
  minimizado: boolean;
  onMinimizar: () => void;
  onRestaurar: () => void;
  onConciliar: (sistemaIds: string[]) => void;
  /** Filtra a grade Banco (OFX) pra mostrar só o(s) lançamento(s) da sugestão aberta (pode ser mais de um, na combinação "somar todos"). */
  onVerRegistroOfx: () => void;
  /** Abre o "Novo Lançamento Manual" pré-preenchido com os dados do OFX selecionado — pra quando nenhuma sugestão bate de verdade. */
  onRegistroManual: () => void;
}

const ROTULOS: Record<keyof SugestoesConciliacao, string> = {
  mesmoRemetente: 'Mesmo remetente PIX (outro lançamento do banco)',
  mesmoNome: 'Nome parecido no sistema',
  mesmoValorMesmaData: 'Mesmo valor, mesma data',
  mesmoValorOutraData: 'Mesmo valor, outra data',
  combinacaoCartao: 'Combinação de títulos (soma bate com o valor)',
};

function correspondeBusca(termo: string, campos: Array<string | number | null | undefined>): boolean {
  if (!termo) return true;
  return campos.some((c) => c != null && String(c).toLowerCase().includes(termo));
}

export function SugestoesPainel({ itemBanco, sugestoes, minimizado, onMinimizar, onRestaurar, onConciliar, onVerRegistroOfx, onRegistroManual }: SugestoesPainelProps) {
  const [busca, setBusca] = useState('');

  // Cada novo item (ou combinação) selecionado é uma busca nova — não faz
  // sentido herdar o filtro de texto da sugestão anterior.
  useEffect(() => {
    setBusca('');
  }, [itemBanco?.id]);

  const categorias = (Object.keys(ROTULOS) as (keyof SugestoesConciliacao)[]).filter((k) => k !== 'mesmoRemetente' && (sugestoes?.[k]?.length ?? 0) > 0);

  if (itemBanco && minimizado) {
    return (
      <div className="fixed bottom-6 right-6 z-[200]">
        <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-accent)] opacity-75" />
        <button
          type="button"
          onClick={onRestaurar}
          className="relative flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-5 py-3 text-sm font-bold text-white shadow-2xl hover:brightness-105"
        >
          ● Sugestões
        </button>
      </div>
    );
  }

  const termo = busca.trim().toLowerCase();

  return (
    <PainelFlutuante open={itemBanco !== null} title={`Sugestões para: ${itemBanco?.descricao ?? ''}`} onClose={onMinimizar}>
      <div className="space-y-4">
        {itemBanco && (
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={onVerRegistroOfx} className="text-xs font-semibold text-[var(--color-accent)] hover:underline">
              Filtrar Registro OFX
            </button>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="pesquisar…"
              className="w-40 rounded-md border border-[var(--color-line)] bg-[var(--color-page)] px-2.5 py-1.5 text-sm text-[var(--color-text)]"
            />
          </div>
        )}

        {categorias.length === 0 ? (
          <p className="text-sm text-[var(--color-text-soft)]">Nenhuma sugestão automática encontrada. Selecione manualmente na lista do sistema.</p>
        ) : (
          categorias.map((cat) => {
            const itens = sugestoes?.[cat] as LancamentoSistema[] | undefined;
            if (!itens || itens.length === 0) return null;
            const itensFiltrados = itens.filter((s) =>
              correspondeBusca(termo, [s.cliente, s.valor, fmtBRL.format(s.valor), s.data, s.data ? fmtDataBR(s.data) : null, s.documento, s.nf]),
            );
            if (itensFiltrados.length === 0) return null;
            return (
              <div key={cat} className="space-y-1.5">
                <p className="border-b border-[var(--color-line)] pb-1 text-sm font-bold text-[var(--color-text)]">{ROTULOS[cat]}</p>
                {itensFiltrados.map((s) => {
                  const infoDocNf = [s.documento ? `Doc ${s.documento}` : null, s.nf ? `NF ${s.nf}` : null].filter(Boolean).join(' · ');
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--color-page)] px-3 py-1.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold">{s.cliente || '—'}</div>
                        <div className="truncate text-[11px] text-[var(--color-text-soft)]">
                          {s.data ? fmtDataBR(s.data) : '—'}
                          {infoDocNf && ` · ${infoDocNf}`}
                        </div>
                      </div>
                      <span className="num shrink-0 font-semibold">{fmtBRL.format(s.valor)}</span>
                      <button
                        type="button"
                        onClick={() => onConciliar(cat === 'combinacaoCartao' ? itens.map((i) => i.id) : [s.id])}
                        className="shrink-0 whitespace-nowrap rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[11px] font-semibold text-white hover:brightness-105"
                      >
                        Conciliar
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}

        <button
          type="button"
          onClick={onRegistroManual}
          className="w-full rounded-md border border-dashed border-[var(--color-line)] py-2 text-xs font-semibold text-[var(--color-text-soft)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          + Registro manual (nenhuma sugestão bate?)
        </button>
      </div>
    </PainelFlutuante>
  );
}
