import { AlertTriangle, Filter, FileText, Pencil, RotateCcw, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { VirtualList } from '@/components/ui/VirtualList';
import { fmtBRL, fmtDataBR } from '@/lib/format';
import { ALTURA_LINHA } from '../constants';
import { CORES_FORMA_PAGAMENTO } from '../coresFormaPagamento';
import type { LancamentoSistema } from '../types';
import { getCategoriaSistema, getSubtipoCartaoSistema } from '../utils';

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
  /** Filtro "Com NF"/"Sem NF"/"Ocultados" do cabeçalho — mesmo padrão do filtro de banco na grade OFX. */
  filtroNf: 'com' | 'sem' | 'ocultados' | null;
  onChangeFiltroNf: (filtro: 'com' | 'sem' | 'ocultados' | null) => void;
  /** Quando ativo (toggle global, no topbar), marcar o checkbox de um lançamento já abre o painel de sugestões (buscando no OFX) automaticamente. */
  modoSugestaoAtivo: boolean;
  onVerSugestoesSistema: (item: LancamentoSistema) => void;
  /** Disparado (em vez do toggle normal) ao marcar um 2º+ item com o modo automático ativo — soma direto com o(s) já selecionado(s) e busca sugestões pelo valor combinado. */
  onMarcarESomar: (item: LancamentoSistema) => void;
  /** Ao desmarcar um item, a página fecha o painel de sugestões se ele estiver mostrando esse item. */
  onDesmarcarSistema: (id: string) => void;
  /** Quando true, `itens` já veio recortado só com o(s) lançamento(s) filtrado(s) (sugestão aberta, ou "Filtrar" do card de observação) — mostra o aviso pra voltar a ver todos. */
  filtroSugestaoAtivo: boolean;
  onLimparFiltroSugestao: () => void;
  /** grupoId -> texto do aviso (valor/forma de pagamento diferentes) confirmado na hora da conciliação — presença na tabela decide se mostra o "!" informativo. */
  avisoPorGrupo: Map<string, string>;
  onAbrirAvisoDiferenca: (grupoId: string) => void;
  /** grupoId -> valor líquido creditado no Banco (Cartão com valor bruto conhecido) — mostrado discretamente ao lado do valor bruto do Sistema, já conciliado. */
  liquidoPorGrupo: Map<string, number>;
  /** Abre o modal de observação (informações adicionais) pra esse lançamento — mesma regra do Banco: só disponível enquanto não conciliado. */
  onAbrirObservacao: (item: LancamentoSistema) => void;
}

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
  avisoPorGrupo,
  onAbrirAvisoDiferenca,
  liquidoPorGrupo,
  onAbrirObservacao,
}: ListaSistemaProps) {
  function renderLinha(item: LancamentoSistema) {
    const categoria = getCategoriaSistema(item.formaPagamentoRaw);
    const liquido = item.conciliado && item.grupoId ? liquidoPorGrupo.get(item.grupoId) : undefined;
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
    const subtipoCartao = categoria === 'CARTAO' ? getSubtipoCartaoSistema(item.formaPagamentoRaw) : null;
    const avisoDiferenca = item.grupoId ? avisoPorGrupo.get(item.grupoId) : undefined;
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
              <span className="text-xs text-[var(--color-text-soft)]">
                {categoria === 'CHEQUE' && item.dataVencimento ? fmtDataBR(item.dataVencimento) : item.data ? fmtDataBR(item.data) : '—'}
              </span>
              {categoria === 'CHEQUE' && item.dataVencimento && (
                <span className="text-[10px] text-[var(--color-text-soft)]" title="Data de recebimento">
                  (receb. {item.data ? fmtDataBR(item.data) : '—'})
                </span>
              )}
              <span className={`num text-base font-extrabold ${item.valor < 0 ? 'text-bad' : 'text-good'}`}>— {fmtBRL.format(item.valor)}</span>
              {liquido != null && <span className="text-[10px] font-normal text-[var(--color-text-soft)]">(líquido: {fmtBRL.format(liquido)})</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <Badge cor={CORES_FORMA_PAGAMENTO[categoria]}>{categoria}</Badge>
              {subtipoCartao && <Badge>{subtipoCartao === 'CREDITO' ? 'CRÉDITO' : 'DÉBITO'}</Badge>}
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
                    {avisoDiferenca && (
                      <button
                        type="button"
                        onClick={() => item.grupoId && onAbrirAvisoDiferenca(item.grupoId)}
                        className="text-[#b8860b] hover:brightness-125"
                        title={avisoDiferenca}
                      >
                        <AlertTriangle size={14} />
                      </button>
                    )}
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
                <>
                  {(selecionados.has(item.id) || item.observacao) && (
                    <button
                      type="button"
                      onClick={() => onAbrirObservacao(item)}
                      className={item.observacao ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-soft)] hover:text-[var(--color-text)]'}
                      title={item.observacao ? `Observação: ${item.observacao}` : 'Adicionar observação'}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onToggleDesativado(item)}
                    className="text-xs text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
                    title={item.desativado ? 'Reativar' : 'Desativar'}
                  >
                    {item.desativado ? '↺' : '⊘'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const itensSelecionados = itensFixados;
  const multiplasFixadas = itensSelecionados.length >= 2;
  const itemUnicoFixado = itensSelecionados.length === 1 ? itensSelecionados[0] : null;

  const [viewport, setViewport] = useState({ scrollTop: 0, alturaVisivel: 0 });

  // Com 1 único item selecionado: só fixa (em cima ou embaixo) quando a
  // posição natural dele sai da área visível da grade — enquanto está
  // visível, aparece no próprio lugar, sem sobreposição nenhuma. Com 2+
  // selecionados (soma), mantém o comportamento antigo (sempre fixado em
  // cima) — ver `multiplasFixadas` abaixo.
  const posicaoFixacaoUnica = useMemo(() => {
    if (!itemUnicoFixado) return null;
    const indice = itens.findIndex((i) => i.id === itemUnicoFixado.id);
    if (indice === -1) return 'topo'; // saiu da lista filtrada atual (ex.: busca mudou) — mantém visível como antes
    const itemTop = indice * ALTURA_LINHA;
    const itemBottom = itemTop + ALTURA_LINHA;
    if (itemTop < viewport.scrollTop) return 'topo';
    if (itemBottom > viewport.scrollTop + viewport.alturaVisivel) return 'baixo';
    return null;
  }, [itemUnicoFixado, itens, viewport]);

  // Quando o item fixado saiu da lista filtrada (busca/filtro não bate mais
  // com ele), o overlay "topo" sobrepõe visualmente o próprio primeiro
  // resultado real da lista (scrollTop = 0) — sem esse respiro, esse
  // resultado fica escondido atrás do item fixado. Já quando ele só saiu de
  // vista por causa do scroll (ainda presente na lista), o overlay
  // intencionalmente cobre a linha que rolou pra debaixo dele, então não
  // precisa (e não deve) empurrar o restante da lista.
  const itemFixadoForaDaLista = itemUnicoFixado !== null && itens.findIndex((i) => i.id === itemUnicoFixado.id) === -1;

  // Item fixado (ver abaixo) já aparece lá — na grade normal ele vira um
  // espaço em branco, senão apareceria duplicado enquanto rola. Volta a
  // mostrar o conteúdo normal assim que for desmarcado (ou, no caso de 1 só,
  // assim que voltar a ficar visível na tela).
  function renderLinhaGrade(item: LancamentoSistema) {
    const estaFixado = multiplasFixadas ? selecionados.has(item.id) : itemUnicoFixado?.id === item.id && posicaoFixacaoUnica !== null;
    if (estaFixado) {
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
          <div
            className={`flex items-center gap-1 rounded-md border pl-2 pr-1 text-xs ${
              filtroNf !== null ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/20' : 'border-white/20 bg-white/10'
            }`}
          >
            <select
              value={filtroNf ?? ''}
              onChange={(e) => onChangeFiltroNf((e.target.value || null) as 'com' | 'sem' | 'ocultados' | null)}
              className="bg-transparent py-1 text-xs font-normal text-white focus:outline-none"
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
              <option value="ocultados" className="text-[var(--color-text)]">
                Ocultados
              </option>
            </select>
            {filtroNf !== null && (
              <button type="button" onClick={() => onChangeFiltroNf(null)} title="Limpar filtro" className="shrink-0 rounded-full p-0.5 text-white hover:bg-white/20">
                <RotateCcw size={12} />
              </button>
            )}
          </div>
          <span className="whitespace-nowrap text-[11px] font-normal text-white/50">
            {itens.length} registro{itens.length === 1 ? '' : 's'}
          </span>
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
          <span>Mostrando só o(s) lançamento(s) filtrado(s)</span>
          <button type="button" onClick={onLimparFiltroSugestao} className="rounded-md border border-[var(--color-accent)]/40 px-2 py-0.5 hover:bg-[var(--color-accent)]/15">
            Ver todos
          </button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {multiplasFixadas && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[5]">
            {itensSelecionados.map((item) => (
              <div key={item.id} className="pointer-events-auto shadow-[0_8px_14px_-4px_rgba(0,0,0,0.28)]" style={{ height: ALTURA_LINHA }}>
                {renderLinha(item)}
              </div>
            ))}
          </div>
        )}
        {itemUnicoFixado && posicaoFixacaoUnica === 'topo' && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[5]">
            <div className="pointer-events-auto shadow-[0_8px_14px_-4px_rgba(0,0,0,0.28)]" style={{ height: ALTURA_LINHA }}>
              {renderLinha(itemUnicoFixado)}
            </div>
          </div>
        )}
        {itemUnicoFixado && posicaoFixacaoUnica === 'baixo' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5]">
            <div className="pointer-events-auto shadow-[0_-8px_14px_-4px_rgba(0,0,0,0.28)]" style={{ height: ALTURA_LINHA }}>
              {renderLinha(itemUnicoFixado)}
            </div>
          </div>
        )}
        <VirtualList
          itens={itens}
          altura={ALTURA_LINHA}
          className="h-full overflow-y-auto"
          style={{ paddingTop: multiplasFixadas ? itensSelecionados.length * ALTURA_LINHA : itemFixadoForaDaLista ? ALTURA_LINHA : 0 }}
          keyExtractor={(item) => item.id}
          vazio={<p className="px-4 py-6 text-center text-sm text-[var(--color-text-soft)]">Nenhum lançamento.</p>}
          renderItem={renderLinhaGrade}
          onViewportChange={setViewport}
        />
      </div>
    </Card>
  );
}

