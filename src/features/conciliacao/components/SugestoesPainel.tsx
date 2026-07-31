import { ChevronDown, ChevronRight, Filter, Link2, Package, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { PainelFlutuante } from '@/components/ui/PainelFlutuante';
import { fmtBRL, fmtDataBR } from '@/lib/format';
import { CORES_FORMA_PAGAMENTO } from '../coresFormaPagamento';
import { descricaoCategoria, ROTULOS_CATEGORIA_SUGESTAO, rotuloCategoria, type LancamentoBanco, type LancamentoSistema, type SugestoesConciliacao, type SugestoesConciliacaoInversa } from '../types';
import { getCategoriaSistema } from '../utils';

/** Qual lado está fixo (a origem da busca) — decide se os candidatos vêm do Sistema ou do Banco. */
export type ItemFixo = { direcao: 'banco'; item: LancamentoBanco } | { direcao: 'sistema'; item: LancamentoSistema };

interface SugestoesPainelProps {
  itemFixo: ItemFixo | null;
  sugestoes: SugestoesConciliacao | SugestoesConciliacaoInversa | null;
  /** O painel só fecha de verdade quando o item é desmarcado (fora daqui) — o "x" apenas minimiza. */
  minimizado: boolean;
  onMinimizar: () => void;
  onRestaurar: () => void;
  onConciliar: (candidatoIds: string[]) => void;
  /** "x" ao lado de "Conciliar" — descarta essa sugestão só pra esse par (item fixo + candidato(s), no caso de combinação todos de uma vez). Pede confirmação antes (ver onPedirDescartarSugestao). */
  onDescartar: (candidatoIds: string[]) => void;
  /** A conciliação em si demora um pouco (grava no Supabase) — desabilita os botões e avisa, pra não deixar clicar várias vezes achando que não funcionou. */
  processando: boolean;
  /** Filtra a grade do MESMO lado do item fixo pra mostrar todos os lançamentos com o mesmo valor (pode ser mais de um, na combinação "somar todos"). */
  onVerRegistroFixo: () => void;
  /** Se esse filtro de "mesmo valor" está ativo agora — só pra colorir o botão como "ativo" (verde), igual os outros ícones de filtro do painel. */
  filtroRegistroFixoAtivo: boolean;
  /** Abre o "Novo Lançamento Manual" pré-preenchido com os dados do OFX selecionado — só existe no sentido Banco→Sistema (null esconde o botão). */
  onRegistroManual: (() => void) | null;
  /** Sugestão pode bater com um lançamento já conciliado (ou pré-conciliado) — mostra mesmo assim, sinalizado, com esses dois atalhos em vez de "Conciliar". */
  onPedirCancelarConciliacao: (grupoId: string) => void;
  /** Filtra a grade DO OUTRO LADO (relativo ao item fixo) pelo grupo do candidato clicado — Sistema quando o fixo é Banco, e vice-versa. */
  onFiltrarOutroLadoPorGrupo: (grupoId: string) => void;
  /** Grupo atualmente filtrado do outro lado — usado só pra colorir o ícone de filtro como "ativo". */
  filtroOutroLadoAtivo: string | null;
  /** Quantos candidatos já foram descartados (o "x") pra ESSE item fixo especificamente — badge no título, só aparece quando > 0. */
  descartadosCount: number;
  /** Abre o modal com a lista desses descartes (com "Restaurar" em cada). */
  onAbrirDescartados: () => void;
  /** Abre o modal com produtos/pagamento da venda (Relatório 396) por trás do documento — só aparece em candidato do Sistema (direção Banco→Sistema) com `documento` preenchido. */
  onAbrirVendaDetalhe: (item: LancamentoSistema) => void;
}

const ROTULOS = ROTULOS_CATEGORIA_SUGESTAO;

function correspondeBusca(termo: string, campos: Array<string | number | null | undefined>): boolean {
  if (!termo) return true;
  return campos.some((c) => c != null && String(c).toLowerCase().includes(termo));
}

/** Cor de fundo da linha de sugestão conforme o status do candidato. Candidato do Banco (sentido invertido) não tem a distinção fina pré-conciliado/pré-lançamento — sempre verde quando conciliado. */
function corDoStatus(candidato: LancamentoSistema | LancamentoBanco, direcao: 'banco' | 'sistema'): string {
  if (!candidato.conciliado) return 'bg-[var(--color-page)]';
  if (direcao === 'sistema') return 'bg-good-soft';
  const s = candidato as LancamentoSistema;
  const semNf = !(s.nf && s.nf.trim());
  if (semNf && s.origem === 'sistema') return 'bg-[#FFF6DE]'; // pré-conciliado
  if (semNf && s.origem === 'manual') return 'bg-[#E1EEFF]'; // pré-lançamento
  return 'bg-good-soft'; // conciliado de verdade
}

export function SugestoesPainel({
  itemFixo,
  sugestoes,
  minimizado,
  onMinimizar,
  onRestaurar,
  onConciliar,
  onDescartar,
  processando,
  onVerRegistroFixo,
  filtroRegistroFixoAtivo,
  onRegistroManual,
  onPedirCancelarConciliacao,
  onFiltrarOutroLadoPorGrupo,
  filtroOutroLadoAtivo,
  descartadosCount,
  onAbrirDescartados,
  onAbrirVendaDetalhe,
}: SugestoesPainelProps) {
  const [busca, setBusca] = useState('');
  const [categoriasExpandidas, setCategoriasExpandidas] = useState<Set<keyof SugestoesConciliacao>>(new Set());

  // Cada novo item (ou combinação) selecionado é uma busca nova — não faz
  // sentido herdar o filtro de texto nem os "já conciliados" expandidos da sugestão anterior.
  useEffect(() => {
    setBusca('');
    setCategoriasExpandidas(new Set());
  }, [itemFixo?.item.id]);

  function alternarExpandida(cat: keyof SugestoesConciliacao) {
    setCategoriasExpandidas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(cat)) proximo.delete(cat);
      else proximo.add(cat);
      return proximo;
    });
  }

  const direcao = itemFixo?.direcao ?? 'banco';
  const categorias = (Object.keys(ROTULOS) as (keyof SugestoesConciliacao)[]).filter((k) => (sugestoes?.[k]?.length ?? 0) > 0);

  if (itemFixo && minimizado) {
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
  const tituloItemFixo = itemFixo ? (itemFixo.direcao === 'banco' ? itemFixo.item.descricao : itemFixo.item.cliente) : '';
  // Item fixo é o cheque do Sistema — mostra o vencimento (é ele que entra na busca, não o recebimento).
  const vencimentoItemFixo =
    itemFixo && itemFixo.direcao === 'sistema' && getCategoriaSistema(itemFixo.item.formaPagamentoRaw) === 'CHEQUE' ? itemFixo.item.dataVencimento : null;

  return (
    <PainelFlutuante
      open={itemFixo !== null}
      title={
        <>
          <span className="truncate">{`Sugestões para: ${tituloItemFixo ?? ''}`}</span>
          {descartadosCount > 0 && (
            <button
              type="button"
              onClick={onAbrirDescartados}
              title="Sugestões descartadas pra este registro"
              className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-white/28"
            >
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-bad text-[9px]">{descartadosCount}</span>
              Descartados
            </button>
          )}
        </>
      }
      onClose={onMinimizar}
      lado={direcao === 'sistema' ? 'esquerda' : 'direita'}
    >
      <div className="space-y-4">
        {vencimentoItemFixo && itemFixo?.direcao === 'sistema' && (
          <p className="text-[11px] text-[var(--color-text-soft)]">
            Vencimento do cheque: {fmtDataBR(vencimentoItemFixo)} (receb. {itemFixo.item.data ? fmtDataBR(itemFixo.item.data) : '—'}) — é o vencimento usado na busca
          </p>
        )}
        {itemFixo && (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onVerRegistroFixo}
              className={`text-xs font-semibold hover:underline ${filtroRegistroFixoAtivo ? 'text-good' : 'text-[var(--color-text-soft)]'}`}
            >
              Filtrar mesmo valor
            </button>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="pesquisar…"
              className="w-40 rounded-md border border-[var(--color-line)] bg-[var(--color-page)] px-2.5 py-1.5 text-sm text-[var(--color-text)]"
            />
          </div>
        )}

        {processando && (
          <p className="rounded-md bg-[var(--color-accent)]/10 py-1.5 text-center text-xs font-semibold text-[var(--color-accent)]">Processando conciliação, aguarde…</p>
        )}

        {categorias.length === 0 ? (
          <p className="text-sm text-[var(--color-text-soft)]">Nenhuma sugestão automática encontrada. Selecione manualmente na lista do {direcao === 'banco' ? 'sistema' : 'banco'}.</p>
        ) : (
          categorias.map((cat) => {
            const itens = sugestoes?.[cat] as (LancamentoSistema | LancamentoBanco)[] | undefined;
            if (!itens || itens.length === 0) return null;
            const itensFiltrados = itens.filter((item) => {
              if (direcao === 'banco') {
                const s = item as LancamentoSistema;
                return correspondeBusca(termo, [
                  s.cliente,
                  s.valor,
                  fmtBRL.format(s.valor),
                  s.data,
                  s.data ? fmtDataBR(s.data) : null,
                  s.dataVencimento,
                  s.dataVencimento ? fmtDataBR(s.dataVencimento) : null,
                  s.documento,
                  s.nf,
                ]);
              }
              const b = item as LancamentoBanco;
              return correspondeBusca(termo, [b.descricao, b.bancoNome, b.valor, fmtBRL.format(b.valor), b.data, fmtDataBR(b.data)]);
            });
            if (itensFiltrados.length === 0) return null;
            // Combinação de títulos concilia todo mundo junto num clique só —
            // se qualquer um dos títulos da combinação já estiver conciliado,
            // o grupo inteiro fica só pra consulta (sem botão "Conciliar"),
            // já que tocar nele exigiria desfazer a conciliação alheia antes.
            const grupoTemConciliado = (cat === 'combinacaoBoleto' || cat === 'combinacaoPix') && itens.some((i) => i.conciliado);
            const pendentes = itensFiltrados.filter((item) => !(item.conciliado || grupoTemConciliado));
            const conciliados = itensFiltrados.filter((item) => item.conciliado || grupoTemConciliado);
            const expandida = categoriasExpandidas.has(cat);

            function renderLinha(item: LancamentoSistema | LancamentoBanco) {
              const linha1 = direcao === 'banco' ? (item as LancamentoSistema).cliente || '—' : (item as LancamentoBanco).descricao || '—';
              const linha2 =
                direcao === 'banco'
                  ? [(item as LancamentoSistema).documento ? `Doc ${(item as LancamentoSistema).documento}` : null, (item as LancamentoSistema).nf ? `NF ${(item as LancamentoSistema).nf}` : null]
                      .filter(Boolean)
                      .join(' · ')
                  : (item as LancamentoBanco).bancoNome ?? '';
              const jaConciliado = item.conciliado || grupoTemConciliado;
              // Candidato do Banco (sentido Sistema→Banco): Cartão grava sempre o
              // valor líquido, mas mostrar o bruto aqui (quando conhecido, Stone)
              // facilita comparar de relance com o valor bruto do Sistema, que é
              // exatamente o que está sendo comparado na busca.
              const candidatoBanco = direcao === 'sistema' ? (item as LancamentoBanco) : null;
              const mostrarBruto = !!candidatoBanco && candidatoBanco.formaPagamento === 'CARTAO' && candidatoBanco.valorBrutoCartao != null && !item.conciliado;
              const valorExibido = mostrarBruto ? candidatoBanco!.valorBrutoCartao! : item.valor;
              // Tag de forma de pagamento do PRÓPRIO candidato — só faz sentido em
              // "recebimento diferente" (a tag dele é justamente diferente da do
              // item fixo); nas demais categorias a forma já é a mesma, não
              // precisa repetir.
              const categoriaCandidato = direcao === 'banco' ? getCategoriaSistema((item as LancamentoSistema).formaPagamentoRaw) : (item as LancamentoBanco).formaPagamento;
              // Cheque compara pelo vencimento, não pelo recebimento (ver dataComparavelSistema em matching.ts) —
              // mostra os dois na sugestão pra não parecer que a data "não bate" quando na verdade bateu pelo vencimento.
              const vencimentoCandidato = direcao === 'banco' && categoriaCandidato === 'CHEQUE' ? (item as LancamentoSistema).dataVencimento : null;
              return (
                <div key={item.id} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm ${corDoStatus(item, direcao)}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-xs font-semibold">
                      <span className="truncate">{linha1}</span>
                      {cat === 'recebimentoDiferente' && (
                        <span className="inline-block shrink-0 origin-left scale-75">
                          <Badge cor={CORES_FORMA_PAGAMENTO[categoriaCandidato]}>{categoriaCandidato}</Badge>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-soft)]">
                      <span className="min-w-0 truncate">
                        {vencimentoCandidato ? fmtDataBR(vencimentoCandidato) : item.data ? fmtDataBR(item.data) : '—'}
                        {linha2 && ` · ${linha2}`}
                      </span>
                      {direcao === 'banco' && (item as LancamentoSistema).documento && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAbrirVendaDetalhe(item as LancamentoSistema);
                          }}
                          className="shrink-0 text-[var(--color-text-soft)] opacity-50 hover:text-[var(--color-text)] hover:opacity-100"
                          title="Ver produtos e pagamento da venda"
                        >
                          <Package size={12} />
                        </button>
                      )}
                    </div>
                    {vencimentoCandidato && (
                      <div className="truncate text-[11px] text-[var(--color-text-soft)]">(receb. {item.data ? fmtDataBR(item.data) : '—'})</div>
                    )}
                  </div>
                  <span className="num shrink-0 text-right font-semibold">
                    {fmtBRL.format(valorExibido)}
                    {mostrarBruto && <span className="block text-[10px] font-normal text-[var(--color-text-soft)]">(bruto)</span>}
                  </span>
                  {jaConciliado ? (
                    <div className="flex shrink-0 items-center gap-2" title="Este lançamento já está conciliado (ou pré-conciliado) — pode ter sido um erro">
                      <button
                        type="button"
                        onClick={() => item.grupoId && onFiltrarOutroLadoPorGrupo(item.grupoId)}
                        className={
                          item.grupoId && filtroOutroLadoAtivo === item.grupoId
                            ? 'text-[var(--color-accent)]'
                            : 'text-[var(--color-text-soft)] hover:text-[var(--color-text)]'
                        }
                        title="Filtrar lançamento(s) ligados a este"
                      >
                        <Filter size={14} />
                      </button>
                      <button type="button" onClick={() => item.grupoId && onPedirCancelarConciliacao(item.grupoId)} className="text-bad hover:brightness-125" title="Desfazer conciliação">
                        <X size={16} strokeWidth={2.5} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        disabled={processando}
                        onClick={() => onConciliar(cat === 'combinacaoBoleto' || cat === 'combinacaoPix' ? itens!.map((i) => i.id) : [item.id])}
                        title="Conciliar"
                        className="flex shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] p-1 text-white hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
                      >
                        <Link2 size={13} strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        disabled={processando}
                        onClick={() => onDescartar(cat === 'combinacaoBoleto' || cat === 'combinacaoPix' ? itens!.map((i) => i.id) : [item.id])}
                        title="Descartar esta sugestão (some só pra este registro)"
                        className="text-[var(--color-text-soft)] hover:text-bad disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div key={cat} className="space-y-1.5">
                <div className="flex items-center gap-2 border-b border-[var(--color-line)] pb-1">
                  <p className="text-sm font-bold text-[var(--color-text)]" title={descricaoCategoria(cat)}>
                    {rotuloCategoria(cat, direcao)}
                  </p>
                  {conciliados.length > 0 && (
                    <button
                      type="button"
                      onClick={() => alternarExpandida(cat)}
                      className="flex items-center gap-0.5 rounded-full bg-good-soft px-1.5 py-0.5 text-[10px] font-semibold text-good hover:brightness-95"
                      title="Já conciliados nesta busca"
                    >
                      {expandida ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      {conciliados.length}
                    </button>
                  )}
                </div>
                {expandida && conciliados.map(renderLinha)}
                {pendentes.map(renderLinha)}
              </div>
            );
          })
        )}

        {onRegistroManual && (
          <button
            type="button"
            onClick={onRegistroManual}
            className="w-full rounded-md border border-dashed border-[var(--color-line)] py-2 text-xs font-semibold text-[var(--color-text-soft)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            + Registro manual (nenhuma sugestão bate?)
          </button>
        )}
      </div>
    </PainelFlutuante>
  );
}
