import { Filter, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PainelFlutuante } from '@/components/ui/PainelFlutuante';
import { fmtBRL, fmtDataBR } from '@/lib/format';
import type { LancamentoBanco, LancamentoSistema, SugestoesConciliacao, SugestoesConciliacaoInversa } from '../types';

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
  /** A conciliação em si demora um pouco (grava no Supabase) — desabilita os botões e avisa, pra não deixar clicar várias vezes achando que não funcionou. */
  processando: boolean;
  /** Filtra a grade do MESMO lado do item fixo pra mostrar todos os lançamentos com o mesmo valor (pode ser mais de um, na combinação "somar todos"). */
  onVerRegistroFixo: () => void;
  rotuloRegistroFixo: string;
  /** Abre o "Novo Lançamento Manual" pré-preenchido com os dados do OFX selecionado — só existe no sentido Banco→Sistema (null esconde o botão). */
  onRegistroManual: (() => void) | null;
  /** Sugestão pode bater com um lançamento já conciliado (ou pré-conciliado) — mostra mesmo assim, sinalizado, com esses dois atalhos em vez de "Conciliar". */
  onPedirCancelarConciliacao: (grupoId: string) => void;
  /** Filtra a grade DO OUTRO LADO (relativo ao item fixo) pelo grupo do candidato clicado — Sistema quando o fixo é Banco, e vice-versa. */
  onFiltrarOutroLadoPorGrupo: (grupoId: string) => void;
  /** Grupo atualmente filtrado do outro lado — usado só pra colorir o ícone de filtro como "ativo". */
  filtroOutroLadoAtivo: string | null;
}

const ROTULOS: Record<keyof SugestoesConciliacao, string> = {
  mesmoNome: 'Nome parecido',
  mesmoValorMesmaData: 'Mesmo valor, mesma data',
  mesmoValorOutraData: 'Mesmo valor, outra data',
  mesmoValorParcelaDiferente: 'Mesmo valor, parcelas diferentes',
  combinacaoBoleto: 'Combinação de títulos (soma bate com o valor)',
};

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
  processando,
  onVerRegistroFixo,
  rotuloRegistroFixo,
  onRegistroManual,
  onPedirCancelarConciliacao,
  onFiltrarOutroLadoPorGrupo,
  filtroOutroLadoAtivo,
}: SugestoesPainelProps) {
  const [busca, setBusca] = useState('');

  // Cada novo item (ou combinação) selecionado é uma busca nova — não faz
  // sentido herdar o filtro de texto da sugestão anterior.
  useEffect(() => {
    setBusca('');
  }, [itemFixo?.item.id]);

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

  return (
    <PainelFlutuante
      open={itemFixo !== null}
      title={`Sugestões para: ${tituloItemFixo ?? ''}`}
      onClose={onMinimizar}
      lado={direcao === 'sistema' ? 'esquerda' : 'direita'}
    >
      <div className="space-y-4">
        {itemFixo && (
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={onVerRegistroFixo} className="text-xs font-semibold text-[var(--color-accent)] hover:underline">
              {rotuloRegistroFixo}
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
                return correspondeBusca(termo, [s.cliente, s.valor, fmtBRL.format(s.valor), s.data, s.data ? fmtDataBR(s.data) : null, s.documento, s.nf]);
              }
              const b = item as LancamentoBanco;
              return correspondeBusca(termo, [b.descricao, b.bancoNome, b.valor, fmtBRL.format(b.valor), b.data, fmtDataBR(b.data)]);
            });
            if (itensFiltrados.length === 0) return null;
            // Combinação de títulos concilia todo mundo junto num clique só —
            // se qualquer um dos títulos da combinação já estiver conciliado,
            // o grupo inteiro fica só pra consulta (sem botão "Conciliar"),
            // já que tocar nele exigiria desfazer a conciliação alheia antes.
            const grupoTemConciliado = cat === 'combinacaoBoleto' && itens.some((i) => i.conciliado);
            return (
              <div key={cat} className="space-y-1.5">
                <p className="border-b border-[var(--color-line)] pb-1 text-sm font-bold text-[var(--color-text)]">{ROTULOS[cat]}</p>
                {itensFiltrados.map((item) => {
                  const linha1 = direcao === 'banco' ? (item as LancamentoSistema).cliente || '—' : (item as LancamentoBanco).descricao || '—';
                  const linha2 =
                    direcao === 'banco'
                      ? [(item as LancamentoSistema).documento ? `Doc ${(item as LancamentoSistema).documento}` : null, (item as LancamentoSistema).nf ? `NF ${(item as LancamentoSistema).nf}` : null]
                          .filter(Boolean)
                          .join(' · ')
                      : (item as LancamentoBanco).bancoNome ?? '';
                  const jaConciliado = item.conciliado || grupoTemConciliado;
                  return (
                    <div key={item.id} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm ${corDoStatus(item, direcao)}`}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold">{linha1}</div>
                        <div className="truncate text-[11px] text-[var(--color-text-soft)]">
                          {item.data ? fmtDataBR(item.data) : '—'}
                          {linha2 && ` · ${linha2}`}
                        </div>
                      </div>
                      <span className="num shrink-0 font-semibold">{fmtBRL.format(item.valor)}</span>
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
                        <button
                          type="button"
                          disabled={processando}
                          onClick={() => onConciliar(cat === 'combinacaoBoleto' ? itens.map((i) => i.id) : [item.id])}
                          className="shrink-0 whitespace-nowrap rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[11px] font-semibold text-white hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
                        >
                          Conciliar
                        </button>
                      )}
                    </div>
                  );
                })}
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
