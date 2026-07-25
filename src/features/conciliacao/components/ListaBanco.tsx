import { Filter, FileText, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { VirtualList } from '@/components/ui/VirtualList';
import { fmtBRL } from '@/lib/format';
import { CORES_FORMA_PAGAMENTO } from '../coresFormaPagamento';
import type { LancamentoBanco, LancamentoSistema } from '../types';

const ALTURA_LINHA = 76;

interface ListaBancoProps {
  itens: LancamentoBanco[];
  selecionados: Set<string>;
  busca: string;
  onChangeBusca: (busca: string) => void;
  onToggleSelecionado: (id: string) => void;
  onVerSugestoes: (item: LancamentoBanco) => void;
  onToggleDesativado: (item: LancamentoBanco) => void;
  bancoFiltro: string | null;
  onChangeBancoFiltro: (banco: string | null) => void;
  bancosDisponiveis: string[];
  /** Texto "Doc X · NF Y" do(s) lançamento(s) do Sistema conciliado(s) neste grupo, por `grupoId`. */
  infoSistemaPorGrupo: Map<string, string>;
  /** Quando ativo, marcar o checkbox de um lançamento já abre o painel de sugestões dele automaticamente. */
  modoSugestaoAtivo: boolean;
  onToggleModoSugestao: () => void;
  /** Disparado (em vez do toggle normal) ao marcar um 2º+ item com o modo automático ativo — a página pergunta se soma os valores ou usa só o último. */
  onPerguntarSelecaoMultipla: (item: LancamentoBanco) => void;
  /** Ao desmarcar um item, a página fecha o painel de sugestões se ele estiver mostrando esse item. */
  onDesmarcarBanco: (id: string) => void;
  /** Quando true, `itens` já veio recortado só com o(s) lançamento(s) da sugestão aberta — mostra o aviso pra voltar a ver todos. */
  filtroSugestaoAtivo: boolean;
  onLimparFiltroSugestao: () => void;
  /** grupoId cujo(s) lançamento(s) do Sistema estão filtrados na outra grade agora — usado só pra destacar o ícone do item correspondente. */
  filtroGrupoSistemaAtivo: string | null;
  /** Alterna (liga/desliga) o filtro da grade Sistema pra mostrar só o(s) lançamento(s) ligados a esse grupo. */
  onFiltrarSistemaPorGrupo: (grupoId: string) => void;
  onPedirCancelarConciliacao: (grupoId: string) => void;
  /** grupoId -> lançamento do Sistema daquele grupo ainda sem NF — grupo "pré-conciliado" (amarelo) em vez de conciliado de verdade (verde). */
  sistemaSemNfPorGrupo: Map<string, LancamentoSistema>;
  onAbrirInformarNf: (item: LancamentoSistema) => void;
  /** grupoId -> lançamento manual "pré-lançamento" (azul) daquele grupo — criado direto do OFX, ainda sem cliente/documento/NF. */
  sistemaPreLancamentoPorGrupo: Map<string, LancamentoSistema>;
  onAbrirCompletarPreLancamento: (item: LancamentoSistema) => void;
  /** Total de pendências (pré-conciliados + pré-lançamentos) — bolinha vermelha ao lado do título. */
  pendenciasCount: number;
  onAbrirPendencias: () => void;
}

export function ListaBanco({
  itens,
  selecionados,
  busca,
  onChangeBusca,
  onToggleSelecionado,
  onVerSugestoes,
  onToggleDesativado,
  bancoFiltro,
  onChangeBancoFiltro,
  bancosDisponiveis,
  infoSistemaPorGrupo,
  modoSugestaoAtivo,
  onToggleModoSugestao,
  onPerguntarSelecaoMultipla,
  onDesmarcarBanco,
  filtroSugestaoAtivo,
  onLimparFiltroSugestao,
  filtroGrupoSistemaAtivo,
  onFiltrarSistemaPorGrupo,
  onPedirCancelarConciliacao,
  sistemaSemNfPorGrupo,
  onAbrirInformarNf,
  sistemaPreLancamentoPorGrupo,
  onAbrirCompletarPreLancamento,
  pendenciasCount,
  onAbrirPendencias,
}: ListaBancoProps) {
  return (
    <Card className="flex max-h-[calc(100vh-240px)] flex-col overflow-hidden p-0">
      <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 bg-[var(--color-navy)] px-4 py-3">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
          Banco (OFX)
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
          <select
            value={bancoFiltro ?? ''}
            onChange={(e) => onChangeBancoFiltro(e.target.value || null)}
            className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs font-normal text-white focus:border-[var(--color-accent)] focus:bg-white/20 focus:outline-none"
          >
            <option value="" className="text-[var(--color-text)]">
              Todos
            </option>
            {bancosDisponiveis.map((b) => (
              <option key={b} value={b} className="text-[var(--color-text)]">
                {b}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onToggleModoSugestao}
            title="Ao marcar um lançamento, já abre o painel de sugestões dele automaticamente"
            className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
              modoSugestaoAtivo ? 'bg-[var(--color-accent)] text-white' : 'border border-white/40 text-white hover:bg-white/12'
            }`}
          >
            {modoSugestaoAtivo ? '✓ Sugestão automática' : 'Ativar sugestão'}
          </button>
        </span>
        <input
          value={busca}
          onChange={(e) => onChangeBusca(e.target.value)}
          placeholder="pesquisar…"
          className="w-40 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-sm text-white placeholder:text-white/55 focus:border-[var(--color-accent)] focus:bg-white/20 focus:outline-none"
        />
      </div>
      {filtroSugestaoAtivo && (
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-line)] bg-[var(--color-accent)]/10 px-4 py-2 text-xs font-semibold text-[var(--color-accent)]">
          <span>Mostrando só o(s) lançamento(s) da sugestão aberta</span>
          <button type="button" onClick={onLimparFiltroSugestao} className="rounded-md border border-[var(--color-accent)]/40 px-2 py-0.5 hover:bg-[var(--color-accent)]/15">
            Ver todos
          </button>
        </div>
      )}
      <VirtualList
        itens={itens}
        altura={ALTURA_LINHA}
        className="flex-1 overflow-y-auto"
        keyExtractor={(item) => item.id}
        vazio={<p className="px-4 py-6 text-center text-sm text-[var(--color-text-soft)]">Nenhum lançamento.</p>}
        renderItem={(item) => {
          const infoSistema = item.conciliado && item.grupoId ? infoSistemaPorGrupo.get(item.grupoId) : undefined;
          const sistemaSemNf = item.grupoId ? sistemaSemNfPorGrupo.get(item.grupoId) : undefined;
          const sistemaPreLancamento = item.grupoId ? sistemaPreLancamentoPorGrupo.get(item.grupoId) : undefined;
          const corConciliado = sistemaSemNf ? 'bg-[#FFF6DE]' : sistemaPreLancamento ? 'bg-[#E1EEFF]' : 'bg-good-soft';
          return (
            <div
              className={`flex h-full items-start gap-2.5 border-b border-[var(--color-line)] px-4 py-1.5 ${item.desativado ? 'opacity-40 grayscale' : ''} ${
                item.conciliado ? corConciliado : selecionados.has(item.id) ? 'bg-[#cce5ff]' : ''
              }`}
            >
              {!item.conciliado && !item.desativado && (
                <input
                  type="checkbox"
                  checked={selecionados.has(item.id)}
                  onChange={() => {
                    const marcando = !selecionados.has(item.id);
                    if (marcando && modoSugestaoAtivo && selecionados.size >= 1) {
                      onPerguntarSelecaoMultipla(item);
                      return;
                    }
                    onToggleSelecionado(item.id);
                    if (marcando) {
                      if (modoSugestaoAtivo) onVerSugestoes(item);
                    } else {
                      onDesmarcarBanco(item.id);
                    }
                  }}
                  className="mt-1 shrink-0 accent-[var(--color-navy)]"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs text-[var(--color-text-soft)]">{formatarDataBR(item.data)}</span>
                    <span className={`num text-base font-extrabold ${item.valor < 0 ? 'text-bad' : 'text-good'}`}>— {fmtBRL.format(item.valor)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge cor={CORES_FORMA_PAGAMENTO[item.formaPagamento]}>{item.formaPagamento}</Badge>
                    {item.bancoNome && <Badge>{item.bancoNome.toUpperCase()}</Badge>}
                  </div>
                </div>
                <div className="mt-0.5 truncate text-xs font-semibold text-[var(--color-text)]" title={item.descricao ?? ''}>
                  {item.descricao || '—'}
                  {item.marcado && <span className="ml-1.5 text-[10px] font-semibold text-[#c98a1e]">● marcado</span>}
                </div>
                {infoSistema && <div className="mt-0.5 truncate text-[11px] text-[var(--color-text-soft)]">{infoSistema}</div>}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                {item.conciliado ? (
                  <div className="flex items-center gap-2">
                    {sistemaSemNf && (
                      <button type="button" onClick={() => onAbrirInformarNf(sistemaSemNf)} className="text-[#8a6d1f] hover:brightness-125" title="Informar NF (pré-conciliação)">
                        <FileText size={14} />
                      </button>
                    )}
                    {sistemaPreLancamento && (
                      <button type="button" onClick={() => onAbrirCompletarPreLancamento(sistemaPreLancamento)} className="text-[#1E5FA8] hover:brightness-125" title="Completar dados (pré-lançamento)">
                        <FileText size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => item.grupoId && onFiltrarSistemaPorGrupo(item.grupoId)}
                      className={item.grupoId && filtroGrupoSistemaAtivo === item.grupoId ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-soft)] hover:text-[var(--color-text)]'}
                      title={item.grupoId && filtroGrupoSistemaAtivo === item.grupoId ? 'Ver todos os lançamentos do Sistema' : 'Filtrar lançamento(s) do Sistema ligados a este'}
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
                ) : (
                  <button type="button" onClick={() => onToggleDesativado(item)} className="text-xs text-[var(--color-text-soft)] hover:text-[var(--color-text)]" title={item.desativado ? 'Reativar' : 'Desativar'}>
                    {item.desativado ? '↺' : '⊘'}
                  </button>
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
