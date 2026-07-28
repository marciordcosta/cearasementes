import { AlertTriangle, Filter, FileText, Pencil, RotateCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { VirtualList } from '@/components/ui/VirtualList';
import { fmtBRL, fmtDataBR } from '@/lib/format';
import { ALTURA_LINHA, BANCO_FILTRO_OCULTADOS } from '../constants';
import { CORES_FORMA_PAGAMENTO } from '../coresFormaPagamento';
import type { LancamentoBanco, LancamentoSistema } from '../types';
import { getSubtipoCartaoOfx } from '../utils';

interface ListaBancoProps {
  itens: LancamentoBanco[];
  /** Item(s) marcado(s), vindo(s) da lista COMPLETA (não filtrada) — fixado(s) no topo independente de filtro/busca aplicado depois. */
  itensFixados: LancamentoBanco[];
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
  /** Quando ativo (toggle global, no topbar), marcar o checkbox de um lançamento já abre o painel de sugestões dele automaticamente. */
  modoSugestaoAtivo: boolean;
  /** Disparado (em vez do toggle normal) ao marcar um 2º+ item com o modo automático ativo — soma direto com o(s) já selecionado(s) e busca sugestões pelo valor combinado. */
  onMarcarESomar: (item: LancamentoBanco) => void;
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
  /** grupoId -> texto do aviso (valor/forma de pagamento diferentes) confirmado na hora da conciliação — presença na tabela decide se mostra o "!" informativo. */
  avisoPorGrupo: Map<string, string>;
  onAbrirAvisoDiferenca: (grupoId: string) => void;
  /** Abre o modal de observação (informações adicionais) pra esse lançamento — disponível em qualquer registro, conciliado ou não. */
  onAbrirObservacao: (item: LancamentoBanco) => void;
  /** grupoId -> categoria de sugestão que bateu nessa conciliação (ex.: "Mesmo valor, outra data") — reclassificado a partir dos dados já persistidos, só informativo. */
  criterioPorGrupo: Map<string, string>;
}

export function ListaBanco({
  itens,
  itensFixados,
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
  onMarcarESomar,
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
  avisoPorGrupo,
  onAbrirAvisoDiferenca,
  onAbrirObservacao,
  criterioPorGrupo,
}: ListaBancoProps) {
  function renderLinha(item: LancamentoBanco) {
    const infoSistema = item.conciliado && item.grupoId ? infoSistemaPorGrupo.get(item.grupoId) : undefined;
    const criterio = item.conciliado && item.grupoId ? criterioPorGrupo.get(item.grupoId) : undefined;
    const sistemaSemNf = item.grupoId ? sistemaSemNfPorGrupo.get(item.grupoId) : undefined;
    const sistemaPreLancamento = item.grupoId ? sistemaPreLancamentoPorGrupo.get(item.grupoId) : undefined;
    const corConciliado = sistemaSemNf ? 'bg-[#FFF6DE]' : sistemaPreLancamento ? 'bg-[#E1EEFF]' : 'bg-good-soft';
    const corLinha = item.conciliado ? corConciliado : 'bg-[var(--color-surface)]';
    const subtipoCartao = item.formaPagamento === 'CARTAO' ? getSubtipoCartaoOfx(item.descricao) : null;
    const avisoDiferenca = item.grupoId ? avisoPorGrupo.get(item.grupoId) : undefined;
    // Cartão (Stone) grava sempre o valor líquido — mas antes de conciliar mostra o
    // bruto (o que bate visualmente com a venda no Sistema), só trocando pro líquido
    // de verdade depois que a taxa da maquininha já foi contabilizada na conciliação.
    const mostrarBruto = item.formaPagamento === 'CARTAO' && item.valorBrutoCartao != null && !item.conciliado;
    const valorExibido = mostrarBruto ? item.valorBrutoCartao! : item.valor;
    return (
      <div className={`flex h-full items-start gap-2.5 border-b border-[var(--color-line)] px-4 py-1.5 ${corLinha} ${item.desativado ? 'opacity-40 grayscale' : ''}`}>
        {!item.conciliado && !item.desativado && (
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
              <span className="text-xs text-[var(--color-text-soft)]">{fmtDataBR(item.data)}</span>
              <span className={`num text-base font-extrabold ${valorExibido < 0 ? 'text-bad' : 'text-good'}`}>— {fmtBRL.format(valorExibido)}</span>
              {mostrarBruto && <span className="text-[10px] font-normal text-[var(--color-text-soft)]">(bruto)</span>}
            </div>
            <div className="flex items-center gap-1.5">
              {item.bancoNome && <Badge>{item.bancoNome.toUpperCase()}</Badge>}
              <Badge cor={CORES_FORMA_PAGAMENTO[item.formaPagamento]}>{item.formaPagamento}</Badge>
              {subtipoCartao && <Badge>{subtipoCartao === 'CREDITO' ? 'CRÉDITO' : 'DÉBITO'}</Badge>}
            </div>
          </div>
          <div className="mt-0.5 truncate text-xs font-semibold text-[var(--color-text)]" title={item.descricao ?? ''}>
            {item.descricao || '—'}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-[11px] text-[var(--color-text-soft)]" title={criterio}>
              {infoSistema}
              {infoSistema && criterio && ' · '}
              {criterio && <span className="italic">{criterio}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {item.conciliado ? (
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
                  <button type="button" onClick={() => item.grupoId && onPedirCancelarConciliacao(item.grupoId)} className="text-bad hover:brightness-125" title="Desfazer conciliação">
                    <X size={16} strokeWidth={2.5} />
                  </button>
                </>
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
  function renderLinhaGrade(item: LancamentoBanco) {
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
          Banco
          {pendenciasCount > 0 && (
            <button
              type="button"
              onClick={onAbrirPendencias}
              title="Pendentes de emissão de nota"
              className="flex h-5 w-5 items-center justify-center rounded-full bg-bad text-[10px] font-bold text-white hover:brightness-110"
            >
              {pendenciasCount}
            </button>
          )}
          <div
            className={`flex items-center gap-1 rounded-md border pl-2 pr-1 text-xs ${
              bancoFiltro !== null ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/20' : 'border-white/20 bg-white/10'
            }`}
          >
            <select
              value={bancoFiltro ?? ''}
              onChange={(e) => onChangeBancoFiltro(e.target.value || null)}
              className="bg-transparent py-1 text-xs font-normal text-white focus:outline-none"
            >
              <option value="" className="text-[var(--color-text)]">
                Todos
              </option>
              {bancosDisponiveis.map((b) => (
                <option key={b} value={b} className="text-[var(--color-text)]">
                  {b}
                </option>
              ))}
              <option value={BANCO_FILTRO_OCULTADOS} className="text-[var(--color-text)]">
                Ocultados
              </option>
            </select>
            {bancoFiltro !== null && (
              <button type="button" onClick={() => onChangeBancoFiltro(null)} title="Limpar filtro" className="shrink-0 rounded-full p-0.5 text-white hover:bg-white/20">
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
          <span>Mostrando só o(s) lançamento(s) da sugestão aberta</span>
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

