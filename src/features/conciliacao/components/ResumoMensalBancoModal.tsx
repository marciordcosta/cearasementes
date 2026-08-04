import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { LancamentoBanco, LancamentoSistema } from '../types';

const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface ResumoMes {
  total: number;
  naoConciliados: number;
  preConciliados: number;
}

const RESUMO_VAZIO: ResumoMes = { total: 0, naoConciliados: 0, preConciliados: 0 };

interface ResumoMensalBancoModalProps {
  open: boolean;
  banco: LancamentoBanco[];
  /** Mesmo mapa usado no filtro de Status "Pré-conciliados" da grade (ver bancoFiltrado em ConciliacaoPage) — grupoId de venda real do Sistema ainda sem NF. */
  sistemaSemNfPorGrupo: Map<string, LancamentoSistema>;
  onFechar: () => void;
  /** status null = só o mês (todos os registros); clicar num número aplica o filtro na grade do Banco e fecha o modal. */
  onFiltrar: (ano: number, mes: number, status: 'nao' | 'preConciliados' | null) => void;
}

/**
 * Varredura mensal só da grade do Banco — pra conferir rápido, antes de mandar
 * pra contabilidade, se sobrou algum lançamento sem conciliar ou pendente de
 * NF em algum mês. Puramente informativo (não recalcula nada de conciliação);
 * clicar num número filtra a grade do Banco por aquele mês + status.
 */
export function ResumoMensalBancoModal({ open, banco, sistemaSemNfPorGrupo, onFechar, onFiltrar }: ResumoMensalBancoModalProps) {
  const resumoPorAnoMes = useMemo(() => {
    const mapa = new Map<string, ResumoMes>();
    for (const b of banco) {
      const chave = b.data.slice(0, 7); // "AAAA-MM"
      const atual = mapa.get(chave) ?? { total: 0, naoConciliados: 0, preConciliados: 0 };
      atual.total++;
      if (!b.conciliado) atual.naoConciliados++;
      if (b.grupoId && sistemaSemNfPorGrupo.has(b.grupoId)) atual.preConciliados++;
      mapa.set(chave, atual);
    }
    return mapa;
  }, [banco, sistemaSemNfPorGrupo]);

  const anoMaisRecente = useMemo(() => {
    let maior = 0;
    for (const chave of resumoPorAnoMes.keys()) {
      const ano = parseInt(chave.slice(0, 4), 10);
      if (ano > maior) maior = ano;
    }
    return maior || new Date().getFullYear();
  }, [resumoPorAnoMes]);

  const [ano, setAno] = useState(anoMaisRecente);

  // Toda vez que o modal abre, volta pro ano mais recente com dado — sem
  // isso, reabrir dias depois manteria preso num ano antigo escolhido antes.
  useEffect(() => {
    if (open) setAno(anoMaisRecente);
  }, [open, anoMaisRecente]);

  return (
    <Modal
      open={open}
      onClose={onFechar}
      widthClassName="max-w-[740px]"
      title={
        <div className="flex flex-1 items-center justify-between gap-3">
          <span>Resumo Mensal — Banco</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setAno((a) => a - 1)} title="Ano anterior" className="rounded-md bg-white/15 p-1 hover:bg-white/28">
              <ChevronLeft size={16} />
            </button>
            <span className="num w-11 text-center">{ano}</span>
            <button type="button" onClick={() => setAno((a) => a + 1)} title="Próximo ano" className="rounded-md bg-white/15 p-1 hover:bg-white/28">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {NOMES_MES.map((nome, mes) => {
          const chave = `${ano}-${String(mes + 1).padStart(2, '0')}`;
          const r = resumoPorAnoMes.get(chave) ?? RESUMO_VAZIO;
          return (
            <div key={mes} className="rounded-lg border border-[var(--color-line)] p-2.5">
              <p className="mb-1 text-sm font-bold text-[var(--color-text)]">{nome}</p>
              <button
                type="button"
                onClick={() => onFiltrar(ano, mes, null)}
                disabled={r.total === 0}
                title="Filtrar todos os registros do mês"
                className="flex w-full items-center justify-between rounded px-1.5 py-1 text-xs text-[var(--color-text-soft)] hover:bg-[var(--color-page)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span>Registros</span>
                <span className="num font-semibold text-[var(--color-text)]">{r.total}</span>
              </button>
              <button
                type="button"
                onClick={() => onFiltrar(ano, mes, 'nao')}
                disabled={r.naoConciliados === 0}
                title="Filtrar os não conciliados do mês"
                className="flex w-full items-center justify-between rounded px-1.5 py-1 text-xs text-[#8F2E2E] hover:bg-bad-soft disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span>Não conciliados</span>
                <span className="num font-semibold">{r.naoConciliados}</span>
              </button>
              <button
                type="button"
                onClick={() => onFiltrar(ano, mes, 'preConciliados')}
                disabled={r.preConciliados === 0}
                title="Filtrar os pré-conciliados (sem NF) do mês"
                className="flex w-full items-center justify-between rounded px-1.5 py-1 text-xs text-[#8A5B10] hover:bg-warn-soft disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span>Pré-conciliados</span>
                <span className="num font-semibold">{r.preConciliados}</span>
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
