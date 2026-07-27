import { Filter, FileText, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { VirtualList } from '@/components/ui/VirtualList';
import { fmtBRL } from '@/lib/format';
import { CORES_FORMA_PAGAMENTO } from '../coresFormaPagamento';
import type { LancamentoSistema } from '../types';
import { getCategoriaSistema } from '../utils';

interface ListaSistemaProps {
  itens: LancamentoSistema[];
  /** Item(s) marcado(s), vindo(s) da lista COMPLETA (não filtrada) — fixado(s) no topo independente de filtro/busca aplicado depois. */
  itensFixados: LancamentoSistema[];
  selecionados: Set<string>;
  busca: string;
  onChangeBusca: (busca: string) => void;
  onToggleSelecionado: (id: string) => void;
  onToggleDesativado: (item: LancamentoSistema) => void;
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
  /** Filtro "Com NF"/"Sem NF" do cabeçalho — mesmo padrão do filtro de banco na grade OFX. */
  filtroNf: 'com' | 'sem' | null;
  onChangeFiltroNf: (filtro: 'com' | 'sem' | null) => void;
  /** Quando ativo (toggle global, no topbar), marcar o checkbox de um lançamento já abre o painel de sugestões (buscando no OFX) automaticamente. */
  modoSugestaoAtivo: boolean;
  onVerSugestoesSistema: (item: LancamentoSistema) => void;
  /** Disparado (em vez do toggle normal) ao marcar um 2º+ item com o modo automático ativo — soma direto com o(s) já selecionado(s) e busca sugestões pelo valor combinado. */
  onMarcarESomar: (item: LancamentoSistema) => void;
  /** Ao desmarcar um item, a página fecha o painel de sugestões se ele estiver mostrando esse item. */
  onDesmarcarSistema: (id: string) => void;
  /** Quando true, `itens` já veio recortado só com o(s) lançamento(s) da sugestão aberta — mostra o aviso pra voltar a ver todos. */
  filtroSugestaoAtivo: boolean;
  onLimparFiltroSugestao: () => void;
}

const ALTURA_LINHA = 76;

export function ListaSistema({
  itens,
  itensFixados,
  selecionados,
  busca,
  onChangeBusca,
  onToggleSelecionado,
  onToggleDesativado,
  filtroGrupoBancoAtivo,
  onFiltrarBancoPorGrupo,
  onPedirCancelarConciliacao,
  onAbrirInformarNf,
  onAbrirCompletarPreLancamento,
  pendenciasCount,
  onAbrirPendencias,
  filtroNf,
  onChangeFiltroNf,
  modoSugestaoAtivo,
  onVerSugestoesSistema,
  onMarcarESomar,
  onDesmarcarSistema,
  filtroSugestaoAtivo,
  onLimparFiltroSugestao,
}: ListaSistemaProps) {
  function renderLinha(item: LancamentoSistema) {
    const categoria = getCategoriaSistema(item.formaPagamentoRaw);
    const partesDocNf: ReactNode[] = [];
    if (item.documento) partesDocNf.push(`Doc ${item.documento}`);
    if (item.nf) {
      partesDocNf.push(`NF ${item.nf}`);
    } else if (item.origem !== 'taxa_automatica') {
      partesDocNf.push(
        <span key="sem-nf" className="font-semibold text-bad">
          Sem NF
        </span>,
      );
    }
    const semNfPreConciliacao = item.conciliado && item.origem === 'sistema' && !(item.nf && item.nf.trim());
    const preLancamento = item.conciliado && item.origem === 'manual' && !(item.nf && item.nf.trim());
    const corConciliado = semNfPreConciliacao ? 'bg-[#FFF6DE]' : preLancamento ? 'bg-[#E1EEFF]' : 'bg-good-soft';
    const corLinha = item.conciliado ? corConciliado : 'bg-[var(--color-surface)]';
    return (
      <div className={`flex h-full items-start gap-2.5 border-b border-[var(--color-line)] px-4 py-1.5 ${corLinha} ${item.desativado ? 'opacity-40 grayscale' : ''}`}>
        {!item.conciliado && !item.desativado && item.origem !== 'taxa_automatica' && (
          <input
            type="checkbox"
            checked={selecionados.has(item.id)}
            onChange={() => {
              const marcando = !selecionados.has(item.id);
              if (marcando && modoSugestaoAtivo && selecionados.size >= 1) {
                onMarcarESomar(item);
                return;
              }
              onToggleSelecionado(item.id);
              if (marcando) {
                if (modoSugestaoAtivo) onVerSugestoesSistema(item);
              } else {
                onDesmarcarSistema(item.id);
              }
            }}
            className="mt-1 shrink-0 accent-[var(--color-navy)]"
          />
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
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-[11px] text-[var(--color-text-soft)]">
              {partesDocNf.map((parte, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  {parte}
                </span>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {item.conciliado ? (
                item.origem === 'taxa_automatica' ? (
                  <span className="whitespace-nowrap text-xs text-[var(--color-text-soft)]">automático</span>
                ) : (
                  <>
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
                  </>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => onToggleDesativado(item)}
                  className="text-xs text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
                  title={item.desativado ? 'Reativar' : 'Desativar'}
                >
                  {item.desativado ? '↺' : '⊘'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const itensSelecionados = itensFixados;

  // Item fixado no topo (ver abaixo) já aparece lá — na grade normal ele
  // vira um espaço em branco, senão apareceria duplicado enquanto rola.
  // Volta a mostrar o conteúdo normal assim que for desmarcado.
  function renderLinhaGrade(item: LancamentoSistema) {
    if (selecionados.has(item.id)) {
      return (
        <div className="flex h-full items-center border-b border-[var(--color-line)] px-4">
          <span className="text-xs italic text-[var(--color-text-soft)]">Fixado</span>
        </div>
      );
    }
    return renderLinha(item);
  }

  return (
    <Card className="flex max-h-[calc(100vh-180px)] flex-col overflow-hidden p-0">
      <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 bg-[var(--color-navy)] px-4 py-3">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
          Sistema (Max Data)
          {pendenciasCount > 0 && (
            <button
              type="button"
              onClick={onAbrirPendencias}
              title="Pendentes de lançamento"
              className="flex h-5 w-5 items-center justify-center rounded-full bg-bad text-[10px] font-bold text-white hover:brightness-110"
            >
              {pendenciasCount}
            </button>
          )}
          <select
            value={filtroNf ?? ''}
            onChange={(e) => onChangeFiltroNf((e.target.value || null) as 'com' | 'sem' | null)}
            className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs font-normal text-white focus:border-[var(--color-accent)] focus:bg-white/20 focus:outline-none"
          >
            <option value="" className="text-[var(--color-text)]">
              Todos
            </option>
            <option value="com" className="text-[var(--color-text)]">
              Com NF
            </option>
            <option value="sem" className="text-[var(--color-text)]">
              Sem NF
            </option>
          </select>
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
      <div className="relative min-h-0 flex-1">
        {itensSelecionados.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[5]">
            {itensSelecionados.map((item) => (
              <div key={item.id} className="pointer-events-auto shadow-[0_8px_14px_-4px_rgba(0,0,0,0.28)]" style={{ height: ALTURA_LINHA }}>
                {renderLinha(item)}
              </div>
            ))}
          </div>
        )}
        <VirtualList
          itens={itens}
          altura={ALTURA_LINHA}
          className="h-full overflow-y-auto"
          style={{ paddingTop: itensSelecionados.length * ALTURA_LINHA }}
          keyExtractor={(item) => item.id}
          vazio={<p className="px-4 py-6 text-center text-sm text-[var(--color-text-soft)]">Nenhum lançamento.</p>}
          renderItem={renderLinhaGrade}
        />
      </div>
    </Card>
  );
}

function formatarDataBR(iso: string): string {
  const partes = iso.split('-');
  if (partes.length !== 3) return iso;
  const [y, m, d] = partes;
  return `${d}/${m}/${y}`;
}
