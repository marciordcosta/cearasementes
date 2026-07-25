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
import { TotaisRodape } from '@/features/conciliacao/components/TotaisRodape';
import { buscarSugestoes, conciliacaoAutomatica, itemBancoCombinado } from '@/features/conciliacao/matching';
import { fetchRegras, REGRAS_PADRAO, salvarRegra, type FormaRegra, type RegraConciliacao } from '@/features/conciliacao/regras';
import type { FiltrosConciliacao as FiltrosConciliacaoType, LancamentoBanco, LancamentoSistema, SugestoesConciliacao } from '@/features/conciliacao/types';
import { getCategoriaSistema } from '@/features/conciliacao/utils';
import { mensagemDeErro } from '@/lib/errors';
import { fmtBRL, fmtDataBR } from '@/lib/format';

/** Compara `termo` (já em minúsculas) contra qualquer um dos campos — pesquisa global da grade, não só um campo fixo. */
function correspondeBusca(termo: string, campos: Array<string | number | null | undefined>): boolean {
  if (!termo) return true;
  return campos.some((c) => c != null && String(c).toLowerCase().includes(termo));
}

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
  const [itemSugestoes, setItemSugestoes] = useState<LancamentoBanco | null>(null);
  const [bancoIdsSugestao, setBancoIdsSugestao] = useState<string[]>([]);
  const [sugestaoMinimizada, setSugestaoMinimizada] = useState(false);
  const [filtroIdsSugestao, setFiltroIdsSugestao] = useState<string[] | null>(null);
  const [filtroGrupoSistema, setFiltroGrupoSistema] = useState<string | null>(null);
  const [filtroGrupoBanco, setFiltroGrupoBanco] = useState<string | null>(null);
  const [grupoParaCancelar, setGrupoParaCancelar] = useState<string | null>(null);
  const [pendenteSemNf, setPendenteSemNf] = useState<{ bancoIds: string[]; sistemaIds: string[] } | null>(null);
  const [itemInformarNf, setItemInformarNf] = useState<LancamentoSistema | null>(null);
  const [contextoLancamentoManual, setContextoLancamentoManual] = useState<{ bancoIds: string[] } | null>(null);
  const [itemCompletarPreLancamento, setItemCompletarPreLancamento] = useState<LancamentoSistema | null>(null);
  // Separado por grade: Banco (OFX) notifica pré-conciliados (falta NF),
  // Sistema notifica pré-lançamentos (falta cliente/documento/NF) — cada
  // bolinha abre o modal só com o tipo correspondente.
  const [modalPendenciasAberto, setModalPendenciasAberto] = useState<'preConciliados' | 'preLancamentos' | null>(null);
  const [sugestoes, setSugestoes] = useState<SugestoesConciliacao | null>(null);
  const [modalManualAberto, setModalManualAberto] = useState(false);
  const [modalRegrasAberto, setModalRegrasAberto] = useState(false);
  const [modoSugestaoAtivo, setModoSugestaoAtivo] = useState(false);
  const [perguntaMultipla, setPerguntaMultipla] = useState<LancamentoBanco | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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

  const bancoFiltrado = useMemo(() => {
    if (filtroIdsSugestao) {
      const idsSet = new Set(filtroIdsSugestao);
      return banco.filter((b) => idsSet.has(b.id));
    }
    if (filtroGrupoBanco) {
      return banco.filter((b) => b.grupoId === filtroGrupoBanco);
    }
    const termo = buscaBanco.trim().toLowerCase();
    return banco.filter((b) => {
      if (filtros.bancoNome && b.bancoNome !== filtros.bancoNome) return false;
      if (filtros.dataInicio && b.data < filtros.dataInicio) return false;
      if (filtros.dataFim && b.data > filtros.dataFim) return false;
      if (filtros.formaPagamento && b.formaPagamento !== filtros.formaPagamento) return false;
      if (filtros.conciliado === 'sim' && !b.conciliado) return false;
      if (filtros.conciliado === 'nao' && b.conciliado) return false;
      if (filtros.conciliado === 'marcados' && !b.marcado) return false;
      const camposBanco = [b.descricao, b.bancoNome, b.data, fmtDataBR(b.data), b.valor, fmtBRL.format(b.valor), b.grupoId ? infoSistemaPorGrupo.get(b.grupoId) : null];
      if (filtros.busca && !correspondeBusca(filtros.busca.toLowerCase(), camposBanco)) return false;
      if (termo && !correspondeBusca(termo, camposBanco)) return false;
      return true;
    });
  }, [banco, filtros, buscaBanco, infoSistemaPorGrupo, filtroIdsSugestao, filtroGrupoBanco]);

  const sistemaFiltrado = useMemo(() => {
    if (filtroGrupoSistema) {
      return sistema.filter((s) => s.grupoId === filtroGrupoSistema);
    }
    const termo = buscaSistema.trim().toLowerCase();
    return sistema.filter((s) => {
      if (filtros.dataInicio && s.data && s.data < filtros.dataInicio) return false;
      if (filtros.dataFim && s.data && s.data > filtros.dataFim) return false;
      if (filtros.conciliado === 'sim' && !s.conciliado) return false;
      if (filtros.conciliado === 'nao' && s.conciliado) return false;
      const camposSistema = [s.cliente, s.documento, s.nf, s.data, s.data ? fmtDataBR(s.data) : null, s.valor, fmtBRL.format(s.valor)];
      if (filtros.busca && !correspondeBusca(filtros.busca.toLowerCase(), camposSistema)) return false;
      if (termo && !correspondeBusca(termo, camposSistema)) return false;
      return true;
    });
  }, [sistema, filtros, buscaSistema, filtroGrupoSistema]);

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

  // grupoId -> lançamento do Sistema (real, importado) daquele grupo que
  // ainda não tem NF — grades pintam esse grupo em amarelo (pré-conciliado)
  // em vez de verde. Só origem='sistema': registros manuais têm sua própria
  // cor/fluxo (pré-lançamento, azul — ver abaixo).
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
      setItemSugestoes(null);
      setBancoIdsSugestao([]);
      setFiltroIdsSugestao(null);
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
  // painel de Sugestões — pré-preenche com os dados do OFX selecionado.
  function onAbrirRegistroManual() {
    setContextoLancamentoManual({ bancoIds: bancoIdsSugestao });
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
      setItemSugestoes(null);
    } catch (e) {
      tratarErro(e);
    }
  }

  function onVerSugestoes(item: LancamentoBanco) {
    setItemSugestoes(item);
    setBancoIdsSugestao([item.id]);
    setSugestoes(buscarSugestoes(item, banco, sistema, regras));
    setSugestaoMinimizada(false);
    setFiltroIdsSugestao(null);
  }

  function onVerSugestoesCombinadas(itens: LancamentoBanco[]) {
    const combinado = itemBancoCombinado(itens);
    setItemSugestoes(combinado);
    setBancoIdsSugestao(itens.map((b) => b.id));
    setSugestoes(buscarSugestoes(combinado, banco, sistema, regras));
    setSugestaoMinimizada(false);
    setFiltroIdsSugestao(null);
  }

  // Marcar um 2º+ item com "Sugestão automática" ativo não decide sozinho —
  // pergunta se é pra somar o valor de todos os selecionados (ex.: 2 PIX que
  // juntos batem com 1 título do sistema) ou considerar só o último marcado
  // (aí os anteriores são desmarcados, pra não ficar seleção "presa" sem uso).
  function onPerguntarSelecaoMultipla(item: LancamentoBanco) {
    setPerguntaMultipla(item);
  }

  function onEscolherSomarSelecionados() {
    if (!perguntaMultipla) return;
    const novoSet = new Set(selecionadosBanco);
    novoSet.add(perguntaMultipla.id);
    setSelecionadosBanco(novoSet);
    onVerSugestoesCombinadas(banco.filter((b) => novoSet.has(b.id)));
    setPerguntaMultipla(null);
  }

  function onEscolherApenasUltimo() {
    if (!perguntaMultipla) return;
    const item = perguntaMultipla;
    setSelecionadosBanco(new Set([item.id]));
    onVerSugestoes(item);
    setPerguntaMultipla(null);
  }

  // Filtra a grade Banco (OFX) pra mostrar só o(s) lançamento(s) por trás da
  // sugestão aberta — mais confiável que rolar até lá, principalmente na
  // combinação "somar todos" (mais de um lançamento envolvido de uma vez).
  function onVerRegistroOfx() {
    setFiltroIdsSugestao(bancoIdsSugestao);
  }

  // Desmarcar um item que fazia parte da sugestão atual invalida o que está
  // no painel (era baseado naquela seleção) — fecha junto, em vez de deixar
  // uma sugestão "órfã" aberta.
  function onDesmarcarBanco(id: string) {
    if (bancoIdsSugestao.includes(id)) {
      setItemSugestoes(null);
      setBancoIdsSugestao([]);
      setSugestaoMinimizada(false);
      setFiltroIdsSugestao(null);
    }
  }

  async function onConciliarSugestao(sistemaIds: string[]) {
    const bancoIds = bancoIdsSugestao;
    if (algumSemNf(sistemaIds)) {
      setPendenteSemNf({ bancoIds, sistemaIds });
      return;
    }
    setSelecionadosBanco(new Set(bancoIds));
    try {
      const { bancoAtualizados, sistemaAtualizados } = await conciliar(bancoIds, sistemaIds);
      aplicarAtualizacaoBanco(bancoAtualizados);
      aplicarAtualizacaoSistema(sistemaAtualizados);
      setItemSugestoes(null);
      setBancoIdsSugestao([]);
      setSugestaoMinimizada(false);
      setFiltroIdsSugestao(null);
      setSelecionadosBanco(new Set());
    } catch (e) {
      tratarErro(e);
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

  // Filtro cruzado entre as grades: ao clicar no ícone de um item conciliado,
  // filtra a grade DO OUTRO LADO só com o(s) lançamento(s) do mesmo grupo —
  // clicar de novo (mesmo grupoId) desfiltra e volta a mostrar tudo.
  function onFiltrarSistemaPorGrupo(grupoId: string) {
    setFiltroGrupoSistema((atual) => (atual === grupoId ? null : grupoId));
  }

  function onFiltrarBancoPorGrupo(grupoId: string) {
    setFiltroGrupoBanco((atual) => (atual === grupoId ? null : grupoId));
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
      setErro(grupos.length === 0 ? 'Nenhum lançamento pôde ser conciliado automaticamente (sem ambiguidade).' : null);
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
        setItemSugestoes(null);
        setBancoIdsSugestao([]);
        setFiltroIdsSugestao(null);
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
      title={<FiltrosConciliacao filtros={filtros} onChange={setFiltros} />}
      mostrarParametrizacao
      onAbrirParametrizacao={() => setModalRegrasAberto(true)}
      actions={
        <Button variant="primary" disabled={processando} onClick={onConciliarAutomatico}>
          {processando ? 'Processando…' : 'Conciliar Automático'}
        </Button>
      }
    >
      <div className="space-y-4">
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
            onToggleModoSugestao={() => setModoSugestaoAtivo((v) => !v)}
            onPerguntarSelecaoMultipla={onPerguntarSelecaoMultipla}
            onDesmarcarBanco={onDesmarcarBanco}
            filtroSugestaoAtivo={filtroIdsSugestao !== null}
            onLimparFiltroSugestao={() => setFiltroIdsSugestao(null)}
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
            selecionados={selecionadosSistema}
            busca={buscaSistema}
            onChangeBusca={setBuscaSistema}
            onToggleSelecionado={toggleSelecionadoSistema}
            onToggleDesativado={onToggleDesativadoSistema}
            onConciliarManual={onConciliarManualSistema}
            filtroGrupoBancoAtivo={filtroGrupoBanco}
            onFiltrarBancoPorGrupo={onFiltrarBancoPorGrupo}
            onPedirCancelarConciliacao={onPedirCancelarConciliacao}
            onAbrirInformarNf={onAbrirInformarNf}
            onAbrirCompletarPreLancamento={onAbrirCompletarPreLancamento}
            pendenciasCount={registrosPreLancamento.length}
            onAbrirPendencias={onAbrirPendenciasSistema}
          />
        </div>

        <TotaisRodape banco={banco} sistema={sistema} />
      </div>

      <SugestoesPainel
        itemBanco={itemSugestoes}
        sugestoes={sugestoes}
        minimizado={sugestaoMinimizada}
        onMinimizar={() => setSugestaoMinimizada(true)}
        onRestaurar={() => setSugestaoMinimizada(false)}
        onConciliar={onConciliarSugestao}
        onVerRegistroOfx={onVerRegistroOfx}
        onRegistroManual={onAbrirRegistroManual}
      />

      <NovoLancamentoManualModal open={modalManualAberto} valoresIniciais={valoresIniciaisManual} onFechar={onFecharModalManual} onSalvar={onSalvarLancamentoManual} />

      <RegrasConciliacaoModal open={modalRegrasAberto} regras={regras} onFechar={() => setModalRegrasAberto(false)} onSalvar={onSalvarRegras} />

      <Modal
        open={perguntaMultipla !== null}
        title="Vários lançamentos selecionados"
        onClose={() => setPerguntaMultipla(null)}
        widthClassName="max-w-[440px]"
        footer={
          <>
            <Button variant="outline" onClick={() => setPerguntaMultipla(null)}>
              Cancelar
            </Button>
            <Button variant="action" onClick={onEscolherApenasUltimo}>
              Usar só o último
            </Button>
            <Button variant="primary" onClick={onEscolherSomarSelecionados}>
              Somar todos
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-text)]">
          Você já tinha {selecionadosBanco.size} lançamento(s) do banco marcado(s). Quer buscar sugestões pelo <strong>valor somado</strong> de todos os selecionados, ou considerar só <strong>o último</strong> marcado (os anteriores serão desmarcados)?
        </p>
      </Modal>

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
        <p className="text-sm text-[var(--color-text)]">
          O lançamento do Sistema selecionado ainda não tem NF emitida — a conciliação exige NF. Deseja pré-conciliar mesmo assim? Os lançamentos ficam travados em <strong>amarelo</strong> até
          alguém informar a NF depois.
        </p>
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
