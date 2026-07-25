import { Filter, FileText, Link2, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { VirtualList } from '@/components/ui/VirtualList';
import { fmtBRL } from '@/lib/format';
import { CORES_FORMA_PAGAMENTO } from '../coresFormaPagamento';
import type { LancamentoSistema } from '../types';
import { getCategoriaSistema } from '../utils';

interface ListaSistemaProps {
  itens: LancamentoSistema[];
  selecionados: Set<string>;
  busca: string;
  onChangeBusca: (busca: string) => void;
  onToggleSelecionado: (id: string) => void;
  onToggleDesativado: (item: LancamentoSistema) => void;
  onConciliarManual: (item: LancamentoSistema) => void;
  /** grupoId cujo(s) lançamento(s) do Banco estão filtrados na outra grade agora — usado só pra destacar o ícone do item correspondente. */
  filtroGrupoBancoAtivo: string | null;
  /** Alterna (liga/desliga) o filtro da grade Banco pra mostrar só o(s) lançamento(s) ligados a esse grupo. */
  onFiltrarBancoPorGrupo: (grupoId: string) => void;
  onPedirCancelarConciliacao: (grupoId: string) => void;
  onAbrirInformarNf: (item: LancamentoSistema) => void;
  onAbrirCompletarPreLancamento: (item: LancamentoSistema) => void;
  /** Total de pendências (pré-conciliados + pré-lançamentos) — bolinha vermelha ao lado do título. */
  pendenciasCount: number;
  onAbrirPendencias: () => void;
}

const ALTURA_LINHA = 76;

export function ListaSistema({
  itens,
  selecionados,
  busca,
  onChangeBusca,
  onToggleSelecionado,
  onToggleDesativado,
  onConciliarManual,
  filtroGrupoBancoAtivo,
  onFiltrarBancoPorGrupo,
  onPedirCancelarConciliacao,
  onAbrirInformarNf,
  onAbrirCompletarPreLancamento,
  pendenciasCount,
  onAbrirPendencias,
}: ListaSistemaProps) {
  return (
    <Card className="flex max-h-[calc(100vh-240px)] flex-col overflow-hidden p-0">
      <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 bg-[var(--color-navy)] px-4 py-3">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
          Sistema (Max Data)
          {pendenciasCount > 0 && (
            <button
              type="button"
              onClick={onAbrirPendencias}
              title="Pendências (pré-conciliados/pré-lançamentos)"
              className="flex h-5 w-5 items-center justify-center rounded-full bg-bad text-[10px] font-bold text-white hover:brightness-110"
            >
              {pendenciasCount}
            </button>
          )}
        </span>
        <input
          value={busca}
          onChange={(e) => onChangeBusca(e.target.value)}
          placeholder="pesquisar…"
          className="w-40 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-[var(--color-accent)] focus:bg-white/20 focus:outline-none"
        />
      </div>
      <VirtualList
        itens={itens}
        altura={ALTURA_LINHA}
        className="flex-1 overflow-y-auto"
        keyExtractor={(item) => item.id}
        vazio={<p className="px-4 py-6 text-center text-sm text-[var(--color-text-soft)]">Nenhum lançamento.</p>}
        renderItem={(item) => {
          const categoria = getCategoriaSistema(item.formaPagamentoRaw);
          const infoDocNf = [item.documento ? `Doc ${item.documento}` : null, item.nf ? `NF ${item.nf}` : null].filter(Boolean).join(' · ');
          const semNfPreConciliacao = item.conciliado && item.origem === 'sistema' && !(item.nf && item.nf.trim());
          const preLancamento = item.conciliado && item.origem === 'manual' && !(item.nf && item.nf.trim());
          const corConciliado = semNfPreConciliacao ? 'bg-[#FFF6DE]' : preLancamento ? 'bg-[#E1EEFF]' : 'bg-good-soft';
          return (
            <div
              className={`flex h-full items-start gap-2.5 border-b border-[var(--color-line)] px-4 py-1.5 ${item.desativado ? 'opacity-40 grayscale' : ''} ${
                item.conciliado ? corConciliado : selecionados.has(item.id) ? 'bg-[#cce5ff]' : ''
              }`}
            >
              {!item.conciliado && !item.desativado && item.origem !== 'taxa_automatica' && (
                <input type="checkbox" checked={selecionados.has(item.id)} onChange={() => onToggleSelecionado(item.id)} className="mt-1 shrink-0 accent-[var(--color-navy)]" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs text-[var(--color-text-soft)]">{item.data ? formatarDataBR(item.data) : '—'}</span>
                    <span className={`num text-base font-extrabold ${item.valor < 0 ? 'text-bad' : 'text-good'}`}>— {fmtBRL.format(item.valor)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge cor={CORES_FORMA_PAGAMENTO[categoria]}>{categoria}</Badge>
                    <Badge tom={item.tipoLancamento === 'Entrada' ? 'bom' : 'ruim'}>{item.tipoLancamento.toUpperCase()}</Badge>
                  </div>
                </div>
                <div className="mt-0.5 truncate text-xs font-semibold text-[var(--color-text)]" title={item.cliente ?? ''}>
                  {item.cliente || '—'}
                </div>
                {infoDocNf && <div className="mt-0.5 truncate text-[11px] text-[var(--color-text-soft)]">{infoDocNf}</div>}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                {item.conciliado ? (
                  item.origem === 'taxa_automatica' ? (
                    <span className="whitespace-nowrap text-xs text-[var(--color-text-soft)]">automático</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      {semNfPreConciliacao && (
                        <button type="button" onClick={() => onAbrirInformarNf(item)} className="text-[#8a6d1f] hover:brightness-125" title="Informar NF (pré-conciliação)">
                          <FileText size={14} />
                        </button>
                      )}
                      {preLancamento && (
                        <button type="button" onClick={() => onAbrirCompletarPreLancamento(item)} className="text-[#1E5FA8] hover:brightness-125" title="Completar dados (pré-lançamento)">
                          <FileText size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => item.grupoId && onFiltrarBancoPorGrupo(item.grupoId)}
                        className={item.grupoId && filtroGrupoBancoAtivo === item.grupoId ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-soft)] hover:text-[var(--color-text)]'}
                        title={item.grupoId && filtroGrupoBancoAtivo === item.grupoId ? 'Ver todos os lançamentos do Banco' : 'Filtrar lançamento(s) do Banco ligados a este'}
                      >
                        <Filter size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => item.grupoId && onPedirCancelarConciliacao(item.grupoId)}
                        className="text-bad hover:brightness-125"
                        title="Desfazer conciliação"
                      >
                        <X size={16} strokeWidth={2.5} />
                      </button>
                    </div>
                  )
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => item.nf && onConciliarManual(item)}
                      disabled={!item.nf}
                      className="text-[var(--color-accent)] hover:opacity-70 disabled:cursor-not-allowed disabled:text-[var(--color-text-soft)] disabled:opacity-40 disabled:hover:opacity-40"
                      title={item.nf ? 'Conciliar sem lançamento correspondente no banco (ex.: dinheiro em espécie)' : 'Conciliação manual exige NF — este lançamento não tem NF'}
                    >
                      <Link2 size={16} strokeWidth={2} />
                    </button>
                    <button type="button" onClick={() => onToggleDesativado(item)} className="text-xs text-[var(--color-text-soft)] hover:text-[var(--color-text)]" title={item.desativado ? 'Reativar' : 'Desativar'}>
                      {item.desativado ? '↺' : '⊘'}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        }}
      />
    </Card>
  );
}

function formatarDataBR(iso: string): string {
  const partes = iso.split('-');
  if (partes.length !== 3) return iso;
  const [y, m, d] = partes;
  return `${d}/${m}/${y}`;
}
