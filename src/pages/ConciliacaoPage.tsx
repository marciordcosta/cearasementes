import { ArrowDown, ArrowUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import {
  cancelarConciliacao,
  completarPreLancamento,
  conciliar,
  conciliarManualSistema,
  fetchLancamentosBanco,
  fetchLancamentosSistema,
  inserirLancamentoManualSistema,
  salvarNfSistema,
  toggleDesativadoBanco,
  toggleDesativadoSistema,
} from '@/features/conciliacao/api';
import { CompletarPreLancamentoModal } from '@/features/conciliacao/components/CompletarPreLancamentoModal';
import { FiltrosConciliacao } from '@/features/conciliacao/components/FiltrosConciliacao';
import { InformarNfModal } from '@/features/conciliacao/components/InformarNfModal';
import { ListaBanco } from '@/features/conciliacao/components/ListaBanco';
import { ListaSistema } from '@/features/conciliacao/components/ListaSistema';
import { NovoLancamentoManualModal } from '@/features/conciliacao/components/NovoLancamentoManualModal';
import { PendenciasModal } from '@/features/conciliacao/components/PendenciasModal';
import { RegrasConciliacaoModal } from '@/features/conciliacao/components/RegrasConciliacaoModal';
import { SugestoesPainel } from '@/features/conciliacao/components/SugestoesPainel';
import { buscarSugestoes, buscarSugestoesInverso, conciliacaoAutomatica, itemBancoCombinado, itemSistemaCombinado } from '@/features/conciliacao/matching';
import { fetchRegras, REGRAS_PADRAO, salvarRegra, type FormaRegra, type RegraConciliacao } from '@/features/conciliacao/regras';
import type { FiltrosConciliacao as FiltrosConciliacaoType, LancamentoBanco, LancamentoSistema } from '@/features/conciliacao/types';
import { getCategoriaSistema, valoresIguais } from '@/features/conciliacao/utils';
import { mensagemDeErro } from '@/lib/errors';
import { fmtBRL, fmtDataBR } from '@/lib/format';

/** Compara `termo` (já em minúsculas) contra qualquer um dos campos — pesquisa global da grade, não só um campo fixo. */
function correspondeBusca(termo: string, campos: Array<string | number | null | undefined>): boolean {
  if (!termo) return true;
  return campos.some((c) => c != null && String(c).toLowerCase().includes(termo));
}

/** Mesma data de fmtDataBR, mas sem zero à esquerda (ex.: "2/1/2026") — cobre o jeito mais comum de digitar uma data na busca. */
function fmtDataBRSemZero(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${parseInt(dia, 10)}/${parseInt(mes, 10)}/${ano}`;
}

/** Datas em ISO (YYYY-MM-DD) comparam certo por string — sem data vai sempre pro fim, nas duas ordens. */
function ordenarPorData<T extends { data: string | null }>(itens: T[], ordem: 'asc' | 'desc'): T[] {
  return [...itens].sort((a, b) => {
    if (!a.data && !b.data) return 0;
    if (!a.data) return 1;
    if (!b.data) return -1;
    return ordem === 'asc' ? a.data.localeCompare(b.data) : b.data.localeCompare(a.data);
  });
}

/** Qual lançamento(s) estão "fixos" na busca de sugestões aberta, e em qual direção — Banco→Sistema (padrão de sempre) ou Sistema→OFX (invertido). */
type SugestaoAtiva =
  | { direcao: 'banco'; item: LancamentoBanco; idsFixos: string[] }
  | { direcao: 'sistema'; item: LancamentoSistema; idsFixos: string[] };

const FILTROS_VAZIOS: FiltrosConciliacaoType = {
  bancoNome: null,
  dataInicio: null,
  dataFim: null,
  formaPagamento: null,
  tipoLancamento: null,
  conciliado: null,
  busca: '',
};

export function ConciliacaoPage() {
  const queryClient = useQueryClient();
  const { data: bancoData } = useQuery({ queryKey: ['conciliacao', 'banco'], queryFn: fetchLancamentosBanco });
  const { data: sistemaData } = useQuery({ queryKey: ['conciliacao', 'sistema'], queryFn: fetchLancamentosSistema });
  const { data: regrasData } = useQuery({ queryKey: ['conciliacao', 'regras'], queryFn: fetchRegras });

  const [banco, setBanco] = useState<LancamentoBanco[]>([]);
  const [sistema, setSistema] = useState<LancamentoSistema[]>([]);
  const [regras, setRegras] = useState<Record<FormaRegra, RegraConciliacao>>(REGRAS_PADRAO);

  // Diferente da Precificação (que "trava" o espelho local pra não perder
  // edição em andamento), aqui sincroniza sempre que a query mudar: agora
  // que o upload de OFX/Sistema vive na página de Uploads (não mais aqui),
  // a única forma de saber que chegou arquivo novo é reagir à invalidação
  // da query — mesmo com a página mantida montada (troca de módulo com
  // fade, sem desmontar) enquanto o import acontece em outra aba.
  useEffect(() => {
    if (!bancoData || !sistemaData) return;
    setBanco(bancoData);
    setSistema(sistemaData);
  }, [bancoData, sistemaData]);

  useEffect(() => {
    if (regrasData) setRegras(regrasData);
  }, [regrasData]);

  const [filtros, setFiltros] = useState<FiltrosConciliacaoType>(FILTROS_VAZIOS);
  const [buscaBanco, setBuscaBanco] = useState('');
  const [buscaSistema, setBuscaSistema] = useState('');
  const [selecionadosBanco, setSelecionadosBanco] = useState<Set<string>>(new Set());
  const [selecionadosSistema, setSelecionadosSistema] = useState<Set<string>>(new Set());
  const [sugestaoAtiva, setSugestaoAtiva] = useState<SugestaoAtiva | null>(null);
  const [sugestaoMinimizada, setSugestaoMinimizada] = useState(false);
  const [filtroIdsSugestaoBanco, setFiltroIdsSugestaoBanco] = useState<string[] | null>(null);
  const [filtroIdsSugestaoSistema, setFiltroIdsSugestaoSistema] = useState<string[] | null>(null);
  const [filtroGrupoSistema, setFiltroGrupoSistema] = useState<string | null>(null);
  const [filtroGrupoBanco, setFiltroGrupoBanco] = useState<string | null>(null);
  const [ordemData, setOrdemData] = useState<'asc' | 'desc'>('asc');
  const [filtroNfSistema, setFiltroNfSistema] = useState<'com' | 'sem' | null>(null);
  const [grupoParaCancelar, setGrupoParaCancelar] = useState<string | null>(null);
  const [pendenteSemNf, setPendenteSemNf] = useState<{ bancoIds: string[]; sistemaIds: string[] } | null>(null);
  const [itemInformarNf, setItemInformarNf] = useState<LancamentoSistema | null>(null);
  const [contextoLancamentoManual, setContextoLancamentoManual] = useState<{ bancoIds: string[] } | null>(null);
  const [itemParaConciliarManual, setItemParaConciliarManual] = useState<LancamentoSistema | null>(null);
  const [itemCompletarPreLancamento, setItemCompletarPreLancamento] = useState<LancamentoSistema | null>(null);
  // Separado por grade: Banco (OFX) notifica pré-conciliados (falta NF),
  // Sistema notifica pré-lançamentos (falta cliente/documento/NF) — cada
  // bolinha abre o modal só com o tipo correspondente.
  const [modalPendenciasAberto, setModalPendenciasAberto] = useState<'preConciliados' | 'preLancamentos' | null>(null);
  const [modalManualAberto, setModalManualAberto] = useState(false);
  const [modalRegrasAberto, setModalRegrasAberto] = useState(false);
  const [modoSugestaoAtivo, setModoSugestaoAtivo] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [processandoSugestao, setProcessandoSugestao] = useState(false);
  const [sucessoAutomatico, setSucessoAutomatico] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Se o usuário já tem uma sugestão aberta pra um lado (ex.: Banco) e marca
  // um registro na OUTRA grade (Sistema) — sinal de que quer conciliar esses
  // dois manualmente, não seguir a sugestão — minimiza o painel sozinho pra
  // não tampar a barra "Conciliar X do banco com Y do sistema" (e o aviso de
  // diferença, se houver). Só volta clicando na bolha ou marcando outro
  // registro do MESMO lado da sugestão (o que já reabre o painel sozinho).
  useEffect(() => {
    if (!sugestaoAtiva || sugestaoMinimizada) return;
    const outroLadoSelecionado = sugestaoAtiva.direcao === 'banco' ? selecionadosSistema.size > 0 : selecionadosBanco.size > 0;
    if (outroLadoSelecionado) setSugestaoMinimizada(true);
  }, [sugestaoAtiva, sugestaoMinimizada, selecionadosBanco, selecionadosSistema]);

  // Garantia central (independente de qualquer lógica pontual de desmarcar):
  // enquanto sobrar QUALQUER item selecionado do lado em que a sugestão está
  // ancorada, ela (e o balão) continuam existindo — só fecha de vez quando
  // esse lado zera de verdade. Isso é o que decide "tem balão ou não",
  // sempre a partir da contagem real de selecionados, nunca de um cálculo
  // feito no momento do clique (que pode ficar defasado).
  useEffect(() => {
    if (!sugestaoAtiva) return;
    const aindaTemSelecao = sugestaoAtiva.direcao === 'banco' ? selecionadosBanco.size > 0 : selecionadosSistema.size > 0;
    if (!aindaTemSelecao) {
      setSugestaoAtiva(null);
      setSugestaoMinimizada(false);
    }
  }, [sugestaoAtiva, selecionadosBanco, selecionadosSistema]);

  function tratarErro(e: unknown) {
    setErro(mensagemDeErro(e, 'Falha ao falar com o Supabase.'));
  }

  // Aplica localmente as linhas que o próprio Supabase devolveu depois de
  // cada mutação, em vez de recarregar a tabela inteira (Sistema tem
  // milhares de linhas — um refetch completo a cada clique deixava toda
  // ação de conciliação lenta). Map por id garante que, se a mesma linha
  // aparecer mais de uma vez (ex.: taxa automática tocada por vários grupos
  // no Conciliar Automático), a última atualização vence.
  function aplicarAtualizacaoBanco(atualizados: LancamentoBanco[]) {
    if (atualizados.length === 0) return;
    const porId = new Map(atualizados.map((item) => [item.id, item]));
    setBanco((prev) => prev.map((b) => porId.get(b.id) ?? b));
  }

  function aplicarAtualizacaoSistema(atualizados: LancamentoSistema[]) {
    if (atualizados.length === 0) return;
    const porId = new Map(atualizados.map((item) => [item.id, item]));
    setSistema((prev) => prev.map((s) => porId.get(s.id) ?? s));
  }

  // ---------- Filtros ----------
  const bancosDisponiveis = useMemo(() => Array.from(new Set(banco.map((b) => b.bancoNome).filter((n): n is string => !!n))).sort(), [banco]);

  // Pro item conciliado (ou pré-conciliado) do Banco (OFX) mostrar, por baixo
  // da descrição, cliente/documento/NF do(s) lançamento(s) do Sistema com
  // quem ele foi conciliado — texto bruto do OFX não diz muito de relance.
  const infoSistemaPorGrupo = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const s of sistema) {
      if (!s.grupoId || s.origem === 'taxa_automatica') continue;
      const partes = [s.cliente, s.documento ? `Doc ${s.documento}` : null, s.nf ? `NF ${s.nf}` : null].filter((p): p is string => !!p);
      if (partes.length === 0) continue;
      const texto = partes.join(' · ');
      const atual = mapa.get(s.grupoId);
      mapa.set(s.grupoId, atual ? `${atual} + ${texto}` : texto);
    }
    return mapa;
  }, [sistema]);

  // grupoId -> lançamento do Sistema (real, importado) daquele grupo que
  // ainda não tem NF — grades pintam esse grupo em amarelo (pré-conciliado)
  // em vez de verde. Só origem='sistema': registros manuais têm sua própria
  // cor/fluxo (pré-lançamento, azul — ver abaixo). Precisa vir antes de
  // bancoFiltrado, que usa esse mapa pro filtro de Status "Pré-conciliados".
  const sistemaSemNfPorGrupo = useMemo(() => {
    const mapa = new Map<string, LancamentoSistema>();
    for (const s of sistema) {
      if (s.conciliado && s.grupoId && s.origem === 'sistema' && !(s.nf && s.nf.trim())) {
        mapa.set(s.grupoId, s);
      }
    }
    return mapa;
  }, [sistema]);

  // grupoId -> lançamento manual "pré-lançamento" (azul) daquele grupo —
  // criado direto de um OFX sem par no Sistema, ainda sem cliente/documento/NF.
  const sistemaPreLancamentoPorGrupo = useMemo(() => {
    const mapa = new Map<string, LancamentoSistema>();
    for (const s of sistema) {
      if (s.conciliado && s.grupoId && s.origem === 'manual' && !(s.nf && s.nf.trim())) {
        mapa.set(s.grupoId, s);
      }
    }
    return mapa;
  }, [sistema]);

  const bancoFiltrado = useMemo(() => {
    // O filtro de grupo (ícone de filtro nas sugestões, pra inspecionar um
    // lançamento já conciliado) tem prioridade sobre o filtro de "mesmo
    // valor" do botão "Filtrar Registro OFX" — senão um clique no segundo
    // some com o resultado do primeiro sem o usuário conseguir voltar.
    if (filtroGrupoBanco) {
      return ordenarPorData(banco.filter((b) => b.grupoId === filtroGrupoBanco), ordemData);
    }
    if (filtroIdsSugestaoBanco) {
      const idsSet = new Set(filtroIdsSugestaoBanco);
      return ordenarPorData(banco.filter((b) => idsSet.has(b.id)), ordemData);
    }
    const termo = buscaBanco.trim().toLowerCase();
    const filtrado = banco.filter((b) => {
      if (filtros.bancoNome && b.bancoNome !== filtros.bancoNome) return false;
      if (filtros.dataInicio && b.data < filtros.dataInicio) return false;
      if (filtros.dataFim && b.data > filtros.dataFim) return false;
      if (filtros.formaPagamento && b.formaPagamento !== filtros.formaPagamento) return false;
      if (filtros.tipoLancamento && (b.valor >= 0 ? 'Entrada' : 'Saída') !== filtros.tipoLancamento) return false;
      if (filtros.conciliado === 'sim' && !b.conciliado) return false;
      if (filtros.conciliado === 'nao' && b.conciliado) return false;
      if (filtros.conciliado === 'preConciliados' && !(b.grupoId && sistemaSemNfPorGrupo.has(b.grupoId))) return false;
      if (filtros.conciliado === 'preLancamentos' && !(b.grupoId && sistemaPreLancamentoPorGrupo.has(b.grupoId))) return false;
      if (filtros.conciliado === 'ocultados' && !b.desativado) return false;
      const camposBanco = [
        b.descricao,
        b.bancoNome,
        b.data,
        fmtDataBR(b.data),
        fmtDataBRSemZero(b.data),
        b.valor,
        fmtBRL.format(b.valor),
        b.grupoId ? infoSistemaPorGrupo.get(b.grupoId) : null,
      ];
      if (filtros.busca && !correspondeBusca(filtros.busca.toLowerCase(), camposBanco)) return false;
      if (termo && !correspondeBusca(termo, camposBanco)) return false;
      return true;
    });
    return ordenarPorData(filtrado, ordemData);
  }, [banco, filtros, buscaBanco, infoSistemaPorGrupo, sistemaSemNfPorGrupo, sistemaPreLancamentoPorGrupo, filtroIdsSugestaoBanco, filtroGrupoBanco, ordemData]);

  const sistemaFiltrado = useMemo(() => {
    if (filtroGrupoSistema) {
      return ordenarPorData(sistema.filter((s) => s.grupoId === filtroGrupoSistema), ordemData);
    }
    if (filtroIdsSugestaoSistema) {
      const idsSet = new Set(filtroIdsSugestaoSistema);
      return ordenarPorData(sistema.filter((s) => idsSet.has(s.id)), ordemData);
    }
    const termo = buscaSistema.trim().toLowerCase();
    const filtrado = sistema.filter((s) => {
      if (filtros.dataInicio && s.data && s.data < filtros.dataInicio) return false;
      if (filtros.dataFim && s.data && s.data > filtros.dataFim) return false;
      if (filtros.formaPagamento && getCategoriaSistema(s.formaPagamentoRaw) !== filtros.formaPagamento) return false;
      if (filtros.tipoLancamento && s.tipoLancamento !== filtros.tipoLancamento) return false;
      if (filtros.conciliado === 'sim' && !s.conciliado) return false;
      if (filtros.conciliado === 'nao' && s.conciliado) return false;
      if (filtros.conciliado === 'preConciliados' && !(s.conciliado && s.origem === 'sistema' && !(s.nf && s.nf.trim()))) return false;
      if (filtros.conciliado === 'preLancamentos' && !(s.conciliado && s.origem === 'manual' && !(s.nf && s.nf.trim()))) return false;
      if (filtros.conciliado === 'ocultados' && !s.desativado) return false;
      if (filtroNfSistema === 'com' && !(s.nf && s.nf.trim())) return false;
      if (filtroNfSistema === 'sem' && s.nf && s.nf.trim()) return false;
      const camposSistema = [
        s.cliente,
        s.documento,
        s.nf,
        s.data,
        s.data ? fmtDataBR(s.data) : null,
        s.data ? fmtDataBRSemZero(s.data) : null,
        s.valor,
        fmtBRL.format(s.valor),
      ];
      if (filtros.busca && !correspondeBusca(filtros.busca.toLowerCase(), camposSistema)) return false;
      if (termo && !correspondeBusca(termo, camposSistema)) return false;
      return true;
    });
    return ordenarPorData(filtrado, ordemData);
  }, [sistema, filtros, buscaSistema, filtroGrupoSistema, filtroIdsSugestaoSistema, filtroNfSistema, ordemData]);

  // Item(s) fixado(s) no topo da grade (checkbox marcado) — calculado a
  // partir da lista COMPLETA (não da filtrada), pra nunca sumir da tela só
  // porque um filtro ou busca aplicado depois deixaria ele de fora.
  const itensFixadosBanco = useMemo(() => banco.filter((b) => selecionadosBanco.has(b.id)), [banco, selecionadosBanco]);
  const itensFixadosSistema = useMemo(() => sistema.filter((s) => selecionadosSistema.has(s.id)), [sistema, selecionadosSistema]);

  // Alerta (não bloqueia) quando a seleção manual do usuário mistura valores
  // ou formas de pagamento diferentes de cada lado — ele pode confirmar
  // assim mesmo (ex.: taxa/desconto), mas precisa ver a diferença antes.
  const avisoSelecao = useMemo(() => {
    if (selecionadosBanco.size === 0 || selecionadosSistema.size === 0) return null;
    const itensBanco = banco.filter((b) => selecionadosBanco.has(b.id));
    const itensSistema = sistema.filter((s) => selecionadosSistema.has(s.id));

    const somaBanco = itensBanco.reduce((soma, b) => soma + Math.abs(b.valor), 0);
    const somaSistema = itensSistema.reduce((soma, s) => soma + Math.abs(s.valor), 0);
    const diferenca = +(somaBanco - somaSistema).toFixed(2);

    const tagsBanco = Array.from(new Set(itensBanco.map((b) => b.formaPagamento)));
    const tagsSistema = Array.from(new Set(itensSistema.map((s) => getCategoriaSistema(s.formaPagamentoRaw))));
    const tagsDiferentes = tagsBanco.length > 1 || tagsSistema.length > 1 || tagsBanco.some((t) => !tagsSistema.includes(t));

    const partes: string[] = [];
    if (Math.abs(diferenca) >= 0.01) {
      partes.push(`Valores diferentes: banco ${fmtBRL.format(somaBanco)} × sistema ${fmtBRL.format(somaSistema)} (diferença de ${fmtBRL.format(Math.abs(diferenca))})`);
    }
    if (tagsDiferentes) {
      partes.push(`Formas de pagamento diferentes: banco ${tagsBanco.join('/')} × sistema ${tagsSistema.join('/')}`);
    }
    return partes.length > 0 ? partes.join(' — ') : null;
  }, [banco, sistema, selecionadosBanco, selecionadosSistema]);

  // Regra: um lançamento do Sistema sem NF não conciliaria "de verdade" — mas
  // em vez de bloquear, deixamos travar como "pré-conciliação" (ver abaixo).
  function algumSemNf(sistemaIds: string[]): boolean {
    return sistema.some((s) => sistemaIds.includes(s.id) && !(s.nf && s.nf.trim()));
  }

  function onAbrirInformarNf(item: LancamentoSistema) {
    setItemInformarNf(item);
  }

  async function onSalvarNf(nf: string) {
    if (!itemInformarNf) return;
    const item = itemInformarNf;
    try {
      await salvarNfSistema(item.id, nf);
      setSistema((prev) => prev.map((s) => (s.id === item.id ? { ...s, nf } : s)));
      setItemInformarNf(null);
    } catch (e) {
      tratarErro(e);
    }
  }

  // Confirmado no aviso "Documento sem NF": concilia mesmo sem NF — o grupo
  // fica travado (pré-conciliação, amarelo nas grades) até alguém informar
  // a NF depois pelo ícone que aparece nesses lançamentos.
  async function onConfirmarPreConciliacao() {
    if (!pendenteSemNf) return;
    const { bancoIds, sistemaIds } = pendenteSemNf;
    setPendenteSemNf(null);
    try {
      const { bancoAtualizados, sistemaAtualizados } = await conciliar(bancoIds, sistemaIds);
      aplicarAtualizacaoBanco(bancoAtualizados);
      aplicarAtualizacaoSistema(sistemaAtualizados);
      setSelecionadosBanco(new Set());
      setSelecionadosSistema(new Set());
      setSugestaoAtiva(null);
      setFiltroIdsSugestaoBanco(null);
      setFiltroIdsSugestaoSistema(null);
      setFiltroGrupoBanco(null);
      setFiltroGrupoSistema(null);
    } catch (e) {
      tratarErro(e);
    }
  }

  // Pré-conciliados (amarelo, notifica no Banco) e pré-lançamentos (azul,
  // notifica no Sistema) — listas separadas: cada bolinha só mostra/abre o
  // tipo do lado onde ela vive.
  const registrosPreConciliados = useMemo(() => Array.from(sistemaSemNfPorGrupo.values()), [sistemaSemNfPorGrupo]);
  const registrosPreLancamento = useMemo(() => Array.from(sistemaPreLancamentoPorGrupo.values()), [sistemaPreLancamentoPorGrupo]);

  function onAbrirPendenciasBanco() {
    setModalPendenciasAberto('preConciliados');
  }

  function onAbrirPendenciasSistema() {
    setModalPendenciasAberto('preLancamentos');
  }

  // "Informar NF" a partir do modal de pendências: fecha o modal e abre o
  // InformarNfModal pra esse item específico.
  function onInformarNfDaLista(item: LancamentoSistema) {
    setModalPendenciasAberto(null);
    onAbrirInformarNf(item);
  }

  // Abre o "Novo Lançamento Manual" a partir do botão "Registro manual" no
  // painel de Sugestões — pré-preenche com os dados do OFX selecionado. Só
  // existe no sentido Banco→Sistema (o SugestoesPainel esconde o botão nos
  // outros casos), mas o guard abaixo evita qualquer id fantasma mesmo assim.
  function onAbrirRegistroManual() {
    if (sugestaoAtiva?.direcao !== 'banco') return;
    setContextoLancamentoManual({ bancoIds: sugestaoAtiva.idsFixos });
    setModalManualAberto(true);
  }

  // Data/valor/forma de pagamento vêm do(s) lançamento(s) do Banco que
  // originaram esse registro manual — cliente/documento/NF ficam em branco
  // de propósito (completados na hora ou depois, na baixa do pré-lançamento).
  const valoresIniciaisManual = useMemo(() => {
    if (!contextoLancamentoManual) return undefined;
    const itens = banco.filter((b) => contextoLancamentoManual.bancoIds.includes(b.id));
    if (itens.length === 0) return undefined;
    const combinado = itens.length > 1 ? itemBancoCombinado(itens) : itens[0];
    return { data: combinado.data, valor: combinado.valor, formaPagamento: combinado.formaPagamento };
  }, [contextoLancamentoManual, banco]);

  function onFecharModalManual() {
    setModalManualAberto(false);
    setContextoLancamentoManual(null);
  }

  function onAbrirCompletarPreLancamento(item: LancamentoSistema) {
    setItemCompletarPreLancamento(item);
  }

  async function onCompletarPreLancamento(dados: { cliente: string; documento: string; nf: string }) {
    if (!itemCompletarPreLancamento) return;
    const item = itemCompletarPreLancamento;
    try {
      await completarPreLancamento(item.id, dados);
      setSistema((prev) => prev.map((s) => (s.id === item.id ? { ...s, cliente: dados.cliente, documento: dados.documento, nf: dados.nf } : s)));
      setItemCompletarPreLancamento(null);
    } catch (e) {
      tratarErro(e);
    }
  }

  // "Completar dados" a partir do modal de pendências: fecha o modal e abre
  // o CompletarPreLancamentoModal pra esse item específico.
  function onCompletarDaLista(item: LancamentoSistema) {
    setModalPendenciasAberto(null);
    onAbrirCompletarPreLancamento(item);
  }

  // ---------- Seleção / conciliação manual ----------
  function toggleSelecionadoBanco(id: string) {
    setSelecionadosBanco((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function toggleSelecionadoSistema(id: string) {
    setSelecionadosSistema((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function onConciliarSelecionados(sistemaIdsForcados?: string[]) {
    const bancoIds = Array.from(selecionadosBanco);
    const sistemaIds = sistemaIdsForcados ?? Array.from(selecionadosSistema);
    if (algumSemNf(sistemaIds)) {
      setPendenteSemNf({ bancoIds, sistemaIds });
      return;
    }
    try {
      const { bancoAtualizados, sistemaAtualizados } = await conciliar(bancoIds, sistemaIds);
      aplicarAtualizacaoBanco(bancoAtualizados);
      aplicarAtualizacaoSistema(sistemaAtualizados);
      setSelecionadosBanco(new Set());
      setSelecionadosSistema(new Set());
      setSugestaoAtiva(null);
    } catch (e) {
      tratarErro(e);
    }
  }

  // Derivado (não state manual) de propósito: assim, se o usuário desfizer
  // uma conciliação errada direto pelo painel de sugestões (botão "x" numa
  // sugestão já conciliada), a lista recalcula sozinha e o item some da
  // marcação "já conciliado" sem precisar reabrir a busca.
  const sugestoes = useMemo(() => {
    if (!sugestaoAtiva) return null;
    if (sugestaoAtiva.direcao === 'banco') return buscarSugestoes(sugestaoAtiva.item, banco, sistema, regras);
    return buscarSugestoesInverso(sugestaoAtiva.item, banco, sistema, regras);
  }, [sugestaoAtiva, banco, sistema, regras]);

  function onVerSugestoes(item: LancamentoBanco) {
    // Só bloqueia se a sugestão do OUTRO lado estiver VISÍVEL agora — assim
    // que ela minimiza (balão), qualquer marcação seguinte (nessa grade ou
    // na outra) já pode abrir/atualizar a sugestão livremente.
    if (sugestaoAtiva?.direcao === 'sistema' && !sugestaoMinimizada) return;
    setSugestaoAtiva({ direcao: 'banco', item, idsFixos: [item.id] });
    setSugestaoMinimizada(false);
    setFiltroIdsSugestaoBanco(null);
  }

  function onVerSugestoesCombinadas(itens: LancamentoBanco[]) {
    if (sugestaoAtiva?.direcao === 'sistema' && !sugestaoMinimizada) return;
    const combinado = itemBancoCombinado(itens);
    setSugestaoAtiva({ direcao: 'banco', item: combinado, idsFixos: itens.map((b) => b.id) });
    setSugestaoMinimizada(false);
    setFiltroIdsSugestaoBanco(null);
  }

  function onVerSugestoesSistema(item: LancamentoSistema) {
    // Mesmo motivo do onVerSugestoes: só bloqueia se a sugestão do Banco estiver visível agora.
    if (sugestaoAtiva?.direcao === 'banco' && !sugestaoMinimizada) return;
    setSugestaoAtiva({ direcao: 'sistema', item, idsFixos: [item.id] });
    setSugestaoMinimizada(false);
    setFiltroIdsSugestaoSistema(null);
  }

  function onVerSugestoesSistemaCombinadas(itens: LancamentoSistema[]) {
    if (sugestaoAtiva?.direcao === 'banco' && !sugestaoMinimizada) return;
    const combinado = itemSistemaCombinado(itens);
    setSugestaoAtiva({ direcao: 'sistema', item: combinado, idsFixos: itens.map((s) => s.id) });
    setSugestaoMinimizada(false);
    setFiltroIdsSugestaoSistema(null);
  }

  // Marcar um 2º+ item com "Sugestão automática" ativo soma direto com o(s)
  // já selecionado(s) (ex.: 2 PIX que juntos batem com 1 título do sistema)
  // — como o(s) selecionado(s) já ficam fixados/visíveis no topo da grade,
  // não precisa mais perguntar, é só somar.
  function onMarcarESomarBanco(item: LancamentoBanco) {
    const novoSet = new Set(selecionadosBanco);
    novoSet.add(item.id);
    setSelecionadosBanco(novoSet);
    onVerSugestoesCombinadas(banco.filter((b) => novoSet.has(b.id)));
  }

  function onMarcarESomarSistema(item: LancamentoSistema) {
    const novoSet = new Set(selecionadosSistema);
    novoSet.add(item.id);
    setSelecionadosSistema(novoSet);
    onVerSugestoesSistemaCombinadas(sistema.filter((s) => novoSet.has(s.id)));
  }

  // Filtra a grade do MESMO lado do item fixo pra mostrar todos os
  // lançamentos com o mesmo valor da sugestão aberta — dá mais opções de
  // escolha quando o lançamento certo não é necessariamente o que estava
  // selecionado (em vez de mostrar só ele, mostra os "irmãos" de mesmo valor).
  function onVerRegistroFixo() {
    if (!sugestaoAtiva) return;
    const valorAlvo = sugestaoAtiva.item.valor;
    if (sugestaoAtiva.direcao === 'banco') {
      const ids = banco.filter((b) => Math.sign(b.valor) === Math.sign(valorAlvo) && valoresIguais(Math.abs(b.valor), Math.abs(valorAlvo))).map((b) => b.id);
      setFiltroIdsSugestaoBanco(ids);
    } else {
      const ids = sistema.filter((s) => Math.sign(s.valor) === Math.sign(valorAlvo) && valoresIguais(Math.abs(s.valor), Math.abs(valorAlvo))).map((s) => s.id);
      setFiltroIdsSugestaoSistema(ids);
    }
  }

  // Desmarcar um item que fazia parte da sugestão atual, DA MESMA grade que
  // ela: recalcula a sugestão com quem sobrou e continua aberta (nunca
  // minimiza sozinha por desmarcar). Se não sobrar ninguém, só limpa o
  // filtro de valor aqui — quem realmente fecha a sugestão (sem balão) é o
  // useEffect acima, com base na contagem real de selecionados, não neste
  // cálculo pontual do clique.
  function onDesmarcarBanco(id: string) {
    if (sugestaoAtiva?.direcao !== 'banco' || !sugestaoAtiva.idsFixos.includes(id)) return;
    setFiltroIdsSugestaoBanco(null);
    const idsRestantes = sugestaoAtiva.idsFixos.filter((fid) => fid !== id);
    if (idsRestantes.length === 0) return;
    onVerSugestoesCombinadas(banco.filter((b) => idsRestantes.includes(b.id)));
  }

  function onDesmarcarSistema(id: string) {
    if (sugestaoAtiva?.direcao !== 'sistema' || !sugestaoAtiva.idsFixos.includes(id)) return;
    setFiltroIdsSugestaoSistema(null);
    const idsRestantes = sugestaoAtiva.idsFixos.filter((fid) => fid !== id);
    if (idsRestantes.length === 0) return;
    onVerSugestoesSistemaCombinadas(sistema.filter((s) => idsRestantes.includes(s.id)));
  }

  async function onConciliarSugestao(candidatoIds: string[]) {
    if (!sugestaoAtiva) return;
    const bancoIds = sugestaoAtiva.direcao === 'banco' ? sugestaoAtiva.idsFixos : candidatoIds;
    const sistemaIds = sugestaoAtiva.direcao === 'banco' ? candidatoIds : sugestaoAtiva.idsFixos;
    if (algumSemNf(sistemaIds)) {
      setPendenteSemNf({ bancoIds, sistemaIds });
      return;
    }
    if (sugestaoAtiva.direcao === 'banco') setSelecionadosBanco(new Set(bancoIds));
    else setSelecionadosSistema(new Set(sistemaIds));
    setProcessandoSugestao(true);
    try {
      const { bancoAtualizados, sistemaAtualizados } = await conciliar(bancoIds, sistemaIds);
      aplicarAtualizacaoBanco(bancoAtualizados);
      aplicarAtualizacaoSistema(sistemaAtualizados);
      setSugestaoAtiva(null);
      setSugestaoMinimizada(false);
      setFiltroIdsSugestaoBanco(null);
      setFiltroIdsSugestaoSistema(null);
      setFiltroGrupoBanco(null);
      setFiltroGrupoSistema(null);
      setSelecionadosBanco(new Set());
      setSelecionadosSistema(new Set());
    } catch (e) {
      tratarErro(e);
    } finally {
      setProcessandoSugestao(false);
    }
  }

  async function onConciliarManualSistema(item: LancamentoSistema) {
    try {
      const { bancoCriado, sistemaAtualizado } = await conciliarManualSistema(item.id);
      setBanco((prev) => [...prev, bancoCriado]);
      aplicarAtualizacaoSistema([sistemaAtualizado]);
    } catch (e) {
      tratarErro(e);
    }
  }

  // "+ Registro manual" no painel de Sugestões, sentido Sistema→OFX: nenhum
  // lançamento do banco bate, então cria um lançamento manual no Banco com
  // os próprios dados do Sistema (já vêm todos preenchidos, diferente do
  // sentido Banco→Sistema) e concilia na hora — reaproveita conciliarManualSistema,
  // que já exige NF (mesma regra do botão "Conciliar sem OFX" da grade Sistema).
  function onAbrirConciliarManualDaSugestao() {
    if (sugestaoAtiva?.direcao !== 'sistema') return;
    if (!sugestaoAtiva.item.nf || !sugestaoAtiva.item.nf.trim()) return;
    setItemParaConciliarManual(sugestaoAtiva.item);
  }

  async function onConfirmarConciliarManualDaSugestao() {
    if (!itemParaConciliarManual) return;
    const item = itemParaConciliarManual;
    setItemParaConciliarManual(null);
    await onConciliarManualSistema(item);
    setSugestaoAtiva(null);
    setSugestaoMinimizada(false);
    setFiltroIdsSugestaoSistema(null);
    setFiltroGrupoBanco(null);
    setFiltroGrupoSistema(null);
  }

  // Filtro cruzado entre as grades: ao clicar no ícone de um item conciliado,
  // filtra a grade DO OUTRO LADO só com o(s) lançamento(s) do mesmo grupo —
  // clicar de novo (mesmo grupoId) desfiltra e volta a mostrar tudo.
  function onFiltrarSistemaPorGrupo(grupoId: string) {
    setFiltroGrupoSistema((atual) => (atual === grupoId ? null : grupoId));
  }

  function onFiltrarBancoPorGrupo(grupoId: string) {
    setFiltroGrupoBanco((atual) => (atual === grupoId ? null : grupoId));
  }

  // "Limpar Filtros" precisa zerar TODOS os filtros da tela (busca de cada
  // grade, filtro de grupo/sugestão) — não só os campos do topbar — mas sem
  // mexer na marcação (checkbox) dos itens já selecionados.
  function onLimparTodosOsFiltros() {
    setBuscaBanco('');
    setBuscaSistema('');
    setFiltroIdsSugestaoBanco(null);
    setFiltroIdsSugestaoSistema(null);
    setFiltroGrupoSistema(null);
    setFiltroGrupoBanco(null);
    setFiltroNfSistema(null);
  }

  // "Desfazer conciliação" (o "x" vermelho) não age direto — abre a
  // confirmação abaixo, só desfaz de verdade se o usuário confirmar.
  function onPedirCancelarConciliacao(grupoId: string) {
    setGrupoParaCancelar(grupoId);
  }

  async function onConfirmarCancelarConciliacao() {
    if (!grupoParaCancelar) return;
    const grupoId = grupoParaCancelar;
    try {
      const { bancoIdsRemovidos, bancoRevertidos, sistemaRevertidos, linhaTaxaAtualizada } = await cancelarConciliacao(grupoId);
      if (bancoIdsRemovidos.length > 0) {
        const removidos = new Set(bancoIdsRemovidos);
        setBanco((prev) => prev.filter((b) => !removidos.has(b.id)));
      }
      aplicarAtualizacaoBanco(bancoRevertidos);
      aplicarAtualizacaoSistema(linhaTaxaAtualizada ? [...sistemaRevertidos, linhaTaxaAtualizada] : sistemaRevertidos);
      if (filtroGrupoSistema === grupoId) setFiltroGrupoSistema(null);
      if (filtroGrupoBanco === grupoId) setFiltroGrupoBanco(null);
      setGrupoParaCancelar(null);
    } catch (e) {
      tratarErro(e);
    }
  }

  async function onToggleDesativadoBanco(item: LancamentoBanco) {
    try {
      await toggleDesativadoBanco(item.id, !item.desativado);
      setBanco((prev) => prev.map((b) => (b.id === item.id ? { ...b, desativado: !item.desativado } : b)));
    } catch (e) {
      tratarErro(e);
    }
  }

  async function onToggleDesativadoSistema(item: LancamentoSistema) {
    try {
      await toggleDesativadoSistema(item.id, !item.desativado);
      setSistema((prev) => prev.map((s) => (s.id === item.id ? { ...s, desativado: !item.desativado } : s)));
    } catch (e) {
      tratarErro(e);
    }
  }

  async function onConciliarAutomatico() {
    setProcessando(true);
    setErro(null);
    setSucessoAutomatico(null);
    try {
      const grupos = conciliacaoAutomatica(banco, sistema, regras);
      const bancoAtualizadosTotal: LancamentoBanco[] = [];
      const sistemaAtualizadosTotal: LancamentoSistema[] = [];
      for (const g of grupos) {
        const { bancoAtualizados, sistemaAtualizados } = await conciliar(g.bancoIds, g.sistemaIds);
        bancoAtualizadosTotal.push(...bancoAtualizados);
        sistemaAtualizadosTotal.push(...sistemaAtualizados);
      }
      aplicarAtualizacaoBanco(bancoAtualizadosTotal);
      aplicarAtualizacaoSistema(sistemaAtualizadosTotal);
      if (grupos.length === 0) {
        setErro('Nenhum lançamento pôde ser conciliado automaticamente (sem ambiguidade).');
      } else {
        setSucessoAutomatico(
          `${grupos.length} grupo(s) conciliado(s) automaticamente — ${bancoAtualizadosTotal.length} lançamento(s) do banco e ${sistemaAtualizadosTotal.length} do sistema.`,
        );
      }
    } catch (e) {
      tratarErro(e);
    } finally {
      setProcessando(false);
    }
  }

  // Sempre disparado a partir de um OFX selecionado no painel de Sugestões
  // — depois de criar o registro, já concilia com o(s) lançamento(s) do
  // Banco pendentes (isso é o "pré-lançamento": trava os dois, azul, até
  // cliente/documento/NF serem completados na baixa).
  async function onSalvarLancamentoManual(input: Parameters<typeof inserirLancamentoManualSistema>[0]) {
    try {
      const novo = await inserirLancamentoManualSistema(input);
      setSistema((prev) => [...prev, novo]);
      setModalManualAberto(false);

      if (contextoLancamentoManual) {
        const bancoIds = contextoLancamentoManual.bancoIds;
        setContextoLancamentoManual(null);
        const { bancoAtualizados, sistemaAtualizados } = await conciliar(bancoIds, [novo.id]);
        aplicarAtualizacaoBanco(bancoAtualizados);
        aplicarAtualizacaoSistema(sistemaAtualizados);
        setSelecionadosBanco(new Set());
        setSelecionadosSistema(new Set());
        setSugestaoAtiva(null);
        setFiltroIdsSugestaoBanco(null);
      }
    } catch (e) {
      tratarErro(e);
    }
  }

  async function onSalvarRegras(regrasEditadas: RegraConciliacao[]) {
    try {
      const salvas = await Promise.all(regrasEditadas.map((r) => salvarRegra(r)));
      const porForma = { ...regras };
      for (const r of salvas) porForma[r.formaPagamento] = r;
      setRegras(porForma);
      queryClient.invalidateQueries({ queryKey: ['conciliacao', 'regras'] });
    } catch (e) {
      tratarErro(e);
    }
  }

  return (
    <AppShell
      topbarNavy
      title={<FiltrosConciliacao filtros={filtros} onChange={setFiltros} onLimparTudo={onLimparTodosOsFiltros} />}
      mostrarParametrizacao
      onAbrirParametrizacao={() => setModalRegrasAberto(true)}
      actions={
        <>
          <button
            type="button"
            onClick={() => setModoSugestaoAtivo((v) => !v)}
            title="Ao marcar um lançamento (Banco ou Sistema), já abre o painel de sugestões dele automaticamente — na direção correspondente"
            className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
              modoSugestaoAtivo ? 'bg-[var(--color-accent)] text-white' : 'border border-white/40 text-white hover:bg-white/12'
            }`}
          >
            {modoSugestaoAtivo ? '✓ Sugestão automática' : 'Ativar sugestão'}
          </button>
          <Button variant="primary" disabled={processando} onClick={onConciliarAutomatico}>
            {processando ? 'Processando…' : 'Conciliar Automático'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Card className="flex flex-wrap items-center gap-3 p-3">
          <input
            type="text"
            value={filtros.busca}
            onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
            placeholder="Pesquisar por nome, data (15/02/2026) ou valor — busca nas duas grades…"
            className="w-full max-w-md rounded-md border border-[var(--color-line)] bg-[var(--color-page)] px-3 py-1.5 text-sm text-[var(--color-text)]"
          />
          <button
            type="button"
            onClick={() => setOrdemData((o) => (o === 'asc' ? 'desc' : 'asc'))}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
            title="Alternar ordem das datas"
          >
            {ordemData === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            Ordenar {ordemData === 'asc' ? '(mais antigas primeiro)' : '(mais recentes primeiro)'}
          </button>
        </Card>

        {processando && (
          <Card className="flex items-center justify-center gap-2 border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 p-3 text-sm font-semibold text-[var(--color-accent)]">
            Processando conciliação automática, aguarde… (pode demorar um pouco, são muitos registros)
          </Card>
        )}

        {sucessoAutomatico && (
          <Card className="flex items-center justify-between gap-3 border-good/40 bg-good-soft p-3 text-sm font-semibold text-good">
            <span>{sucessoAutomatico}</span>
            <button type="button" onClick={() => setSucessoAutomatico(null)} className="font-semibold hover:underline">
              Fechar
            </button>
          </Card>
        )}

        {erro && (
          <Card className="flex items-center justify-between gap-3 border-bad/40 bg-bad-soft p-3 text-sm text-[#8F2E2E]">
            <span>{erro}</span>
            <button type="button" onClick={() => setErro(null)} className="font-semibold hover:underline">
              Fechar
            </button>
          </Card>
        )}

        {selecionadosBanco.size > 0 &&
          selecionadosSistema.size > 0 &&
          (avisoSelecao ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#e0a300]/40 bg-[#fff6de] px-4 py-2.5 text-sm font-semibold text-[#8a6d1f]">
              <span>⚠ {avisoSelecao}. Conciliar mesmo assim?</span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelecionadosSistema(new Set())}
                  className="whitespace-nowrap rounded-md border border-[#8a6d1f]/40 px-3 py-1.5 text-xs font-bold text-[#8a6d1f] hover:bg-[#8a6d1f]/10"
                >
                  Não
                </button>
                <button
                  type="button"
                  onClick={() => onConciliarSelecionados()}
                  className="whitespace-nowrap rounded-md bg-[#8a6d1f] px-3 py-1.5 text-xs font-bold text-white hover:brightness-110"
                >
                  Sim
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onConciliarSelecionados()}
              className="w-full rounded-lg bg-[var(--color-accent)] py-2.5 text-sm font-bold text-white hover:brightness-105"
            >
              Conciliar {selecionadosBanco.size} do banco com {selecionadosSistema.size} do sistema
            </button>
          ))}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ListaBanco
            itens={bancoFiltrado}
            itensFixados={itensFixadosBanco}
            selecionados={selecionadosBanco}
            busca={buscaBanco}
            onChangeBusca={setBuscaBanco}
            onToggleSelecionado={toggleSelecionadoBanco}
            onVerSugestoes={onVerSugestoes}
            onToggleDesativado={onToggleDesativadoBanco}
            bancoFiltro={filtros.bancoNome}
            onChangeBancoFiltro={(bancoNome) => setFiltros((f) => ({ ...f, bancoNome }))}
            bancosDisponiveis={bancosDisponiveis}
            infoSistemaPorGrupo={infoSistemaPorGrupo}
            modoSugestaoAtivo={modoSugestaoAtivo}
            onMarcarESomar={onMarcarESomarBanco}
            onDesmarcarBanco={onDesmarcarBanco}
            filtroSugestaoAtivo={filtroIdsSugestaoBanco !== null}
            onLimparFiltroSugestao={() => setFiltroIdsSugestaoBanco(null)}
            filtroGrupoSistemaAtivo={filtroGrupoSistema}
            onFiltrarSistemaPorGrupo={onFiltrarSistemaPorGrupo}
            onPedirCancelarConciliacao={onPedirCancelarConciliacao}
            sistemaSemNfPorGrupo={sistemaSemNfPorGrupo}
            onAbrirInformarNf={onAbrirInformarNf}
            sistemaPreLancamentoPorGrupo={sistemaPreLancamentoPorGrupo}
            onAbrirCompletarPreLancamento={onAbrirCompletarPreLancamento}
            pendenciasCount={registrosPreConciliados.length}
            onAbrirPendencias={onAbrirPendenciasBanco}
          />
          <ListaSistema
            itens={sistemaFiltrado}
            itensFixados={itensFixadosSistema}
            selecionados={selecionadosSistema}
            busca={buscaSistema}
            onChangeBusca={setBuscaSistema}
            onToggleSelecionado={toggleSelecionadoSistema}
            onToggleDesativado={onToggleDesativadoSistema}
            filtroGrupoBancoAtivo={filtroGrupoBanco}
            onFiltrarBancoPorGrupo={onFiltrarBancoPorGrupo}
            onPedirCancelarConciliacao={onPedirCancelarConciliacao}
            onAbrirInformarNf={onAbrirInformarNf}
            onAbrirCompletarPreLancamento={onAbrirCompletarPreLancamento}
            pendenciasCount={registrosPreLancamento.length}
            onAbrirPendencias={onAbrirPendenciasSistema}
            filtroNf={filtroNfSistema}
            onChangeFiltroNf={setFiltroNfSistema}
            modoSugestaoAtivo={modoSugestaoAtivo}
            onVerSugestoesSistema={onVerSugestoesSistema}
            onMarcarESomar={onMarcarESomarSistema}
            onDesmarcarSistema={onDesmarcarSistema}
            filtroSugestaoAtivo={filtroIdsSugestaoSistema !== null}
            onLimparFiltroSugestao={() => setFiltroIdsSugestaoSistema(null)}
          />
        </div>
      </div>

      <SugestoesPainel
        itemFixo={sugestaoAtiva}
        sugestoes={sugestoes}
        minimizado={sugestaoMinimizada}
        onMinimizar={() => setSugestaoMinimizada(true)}
        onRestaurar={() => setSugestaoMinimizada(false)}
        onConciliar={onConciliarSugestao}
        processando={processandoSugestao}
        onVerRegistroFixo={onVerRegistroFixo}
        rotuloRegistroFixo={sugestaoAtiva?.direcao === 'sistema' ? 'Filtrar valor do Sistema' : 'Filtrar valor OFX'}
        onRegistroManual={
          sugestaoAtiva?.direcao === 'sistema'
            ? sugestaoAtiva.item.nf && sugestaoAtiva.item.nf.trim()
              ? onAbrirConciliarManualDaSugestao
              : null
            : onAbrirRegistroManual
        }
        onPedirCancelarConciliacao={onPedirCancelarConciliacao}
        onFiltrarOutroLadoPorGrupo={sugestaoAtiva?.direcao === 'sistema' ? onFiltrarSistemaPorGrupo : onFiltrarBancoPorGrupo}
        filtroOutroLadoAtivo={sugestaoAtiva?.direcao === 'sistema' ? filtroGrupoSistema : filtroGrupoBanco}
      />

      <NovoLancamentoManualModal open={modalManualAberto} valoresIniciais={valoresIniciaisManual} onFechar={onFecharModalManual} onSalvar={onSalvarLancamentoManual} />

      <Modal
        open={itemParaConciliarManual !== null}
        title="Conciliar sem OFX correspondente"
        onClose={() => setItemParaConciliarManual(null)}
        widthClassName="max-w-[420px]"
        footer={
          <>
            <Button variant="outline" onClick={() => setItemParaConciliarManual(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={onConfirmarConciliarManualDaSugestao}>
              Salvar
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-[var(--color-text)]">Registro com NF sem recebimento em conta PJ, informar registro?</p>
        {itemParaConciliarManual && (
          <div className="space-y-1 rounded-lg bg-[var(--color-page)] p-3 text-sm">
            <div className="font-semibold text-[var(--color-text)]">{itemParaConciliarManual.cliente || '—'}</div>
            <div className="text-[var(--color-text-soft)]">
              {itemParaConciliarManual.data ? fmtDataBR(itemParaConciliarManual.data) : '—'} · {fmtBRL.format(itemParaConciliarManual.valor)}
            </div>
            <div className="text-[var(--color-text-soft)]">
              {[itemParaConciliarManual.documento ? `Doc ${itemParaConciliarManual.documento}` : null, itemParaConciliarManual.nf ? `NF ${itemParaConciliarManual.nf}` : null]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        )}
      </Modal>

      <RegrasConciliacaoModal open={modalRegrasAberto} regras={regras} onFechar={() => setModalRegrasAberto(false)} onSalvar={onSalvarRegras} />

      <Modal
        open={grupoParaCancelar !== null}
        title="Desfazer conciliação"
        onClose={() => setGrupoParaCancelar(null)}
        widthClassName="max-w-[420px]"
        footer={
          <>
            <Button variant="outline" onClick={() => setGrupoParaCancelar(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={onConfirmarCancelarConciliacao}>
              Desfazer conciliação
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-text)]">Tem certeza que deseja desfazer essa conciliação? O(s) lançamento(s) do Banco e do Sistema voltam a aparecer como não conciliados.</p>
      </Modal>

      <Modal
        open={pendenteSemNf !== null}
        title="Documento sem NF"
        onClose={() => setPendenteSemNf(null)}
        widthClassName="max-w-[440px]"
        footer={
          <>
            <Button variant="outline" onClick={() => setPendenteSemNf(null)}>
              Não
            </Button>
            <Button variant="primary" onClick={onConfirmarPreConciliacao}>
              Sim, pré-conciliar
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-text)]">Registro sem NF emitida, é preciso emissão da NF posteriormente para concluir a conciliação.</p>
      </Modal>

      <InformarNfModal open={itemInformarNf !== null} item={itemInformarNf} onFechar={() => setItemInformarNf(null)} onSalvar={onSalvarNf} />

      <CompletarPreLancamentoModal
        open={itemCompletarPreLancamento !== null}
        item={itemCompletarPreLancamento}
        onFechar={() => setItemCompletarPreLancamento(null)}
        onSalvar={onCompletarPreLancamento}
      />

      <PendenciasModal
        open={modalPendenciasAberto !== null}
        titulo={modalPendenciasAberto === 'preLancamentos' ? 'Pré-lançamentos pendentes' : 'Pré-conciliados pendentes de NF'}
        itens={modalPendenciasAberto === 'preLancamentos' ? registrosPreLancamento : registrosPreConciliados}
        banco={banco}
        onFechar={() => setModalPendenciasAberto(null)}
        onInformarNf={onInformarNfDaLista}
        onCompletarPreLancamento={onCompletarDaLista}
      />
    </AppShell>
  );
}
