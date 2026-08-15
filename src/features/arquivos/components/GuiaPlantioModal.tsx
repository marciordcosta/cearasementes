import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Produto } from '@/features/pricing/types';
import {
  arredondarSacos,
  calcularKgPorHectareNumero,
  calcularSementesPorM2,
  covasM2Alvo,
  distanciaDeCovasM2,
  espacamentoDeDistancia,
  fatorDe,
  germinacaoFinalSemeadura,
  kgPorHaDeSementesCova,
  precisaPesoPorCova,
  sementesComAjustePorDistancia,
  sementesCovaAtual,
  validadeParaOrdenacao,
} from '../calculoSemeadura';
import { gerarGuiaPlantioPdf } from '../guiaPlantioPdf';
import { calcularVC, paraNumero } from '../metricas';
import {
  encontrarProdutoPreco,
  normalizarNome,
  resolverDensidadeBase,
  resolverMargemTolerancia,
  resolverFatorCondicao,
  resolverMaxPlantulasCova,
  resolverMaxPlantulasMetroLinear,
  resolverModoPlantio,
  resolverPmsBaseTexto,
} from '../parametrizacaoProdutos';
import type { ArquivoLaudo, ChecklistPergunta, FatorPlantio, ManualPlantio, ProdutoParametrizacao } from '../types';
import { ChecklistCondicaoModal } from './ChecklistCondicaoModal';

interface GuiaPlantioModalProps {
  open: boolean;
  arquivos: ArquivoLaudo[];
  produtos: ProdutoParametrizacao[];
  fatores: FatorPlantio[];
  checklist: ChecklistPergunta[];
  manual: ManualPlantio | null;
  /** Laudo já vindo selecionado da grade de Arquivos — entra sozinho na pilha ao abrir. */
  laudoInicial: ArquivoLaudo | null;
  produtosPreco: Produto[];
  onFechar: () => void;
}

type Modo = 'linha_cova' | 'lanco' | 'linha';
type Condicao = 'ideal' | 'media' | 'baixa';

interface ItemGuia {
  laudoId: string;
  area: string;
  /** Modo de plantio — individual por item (produtos diferentes na mesma pilha podem ter modos diferentes). */
  modo: Modo;
  /**
   * Único campo editável do espaçamento (modo Covas) — Distância é sempre DERIVADA dele pra manter
   * Covas/m² travado no alvo parametrizado (ver covasM2Alvo/distanciaDerivada): não guarda Distância
   * nem tem como o espaçamento "descolar" do Covas/m² alvo.
   */
  corredor: string;
  /**
   * Sementes/cova — editável SÓ em Milho/Sorgo (ver ehMilhoOuSorgo/covasM2AlvoMilhoSorgo), padrão '1'.
   * Nos demais produtos esse campo existe mas não é usado (Sementes/cova vem travada, ver
   * sementesCovaAtual).
   */
  sementesCova: string;
}

const OPCOES_MODO: { valor: Modo; rotulo: string }[] = [
  { valor: 'lanco', rotulo: 'A Lanço' },
  { valor: 'linha_cova', rotulo: 'Covas' },
  { valor: 'linha', rotulo: 'Linha' },
];

const OPCOES_CONDICAO: { valor: Condicao; rotulo: string }[] = [
  { valor: 'baixa', rotulo: 'Baixa' },
  { valor: 'media', rotulo: 'Média' },
  { valor: 'ideal', rotulo: 'Ideal' },
];

function formatarCovas(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
}


/** PMS do lote (se digitado) ou, em branco, o PMS base do produto na Parametrização — como texto cru (ex.: "4,5"), pra exibir igual foi cadastrado. */
function pmsDoLaudo(laudo: Pick<ArquivoLaudo, 'nomeProduto' | 'especie' | 'processo' | 'cultivar' | 'pms'>, produtos: ProdutoParametrizacao[]): string | null {
  return laudo.pms || resolverPmsBaseTexto(laudo, produtos);
}

/** Igual pmsDoLaudo, já convertido pra número — usado pra converter Sementes/cova em Peso/cova (kg/ha, exibição em modo Tradicional). */
function pmsNumericoDoLaudo(laudo: Pick<ArquivoLaudo, 'nomeProduto' | 'especie' | 'processo' | 'cultivar' | 'pms'>, produtos: ProdutoParametrizacao[]): number | null {
  return paraNumero(pmsDoLaudo(laudo, produtos));
}

/** Reconhece Milho ou Sorgo pelo nome do produto (independente do que está cadastrado em Parametrização) — dispara a regra própria de Sementes/cova editável (ver ItemGuia.sementesCova/covasM2AlvoMilhoSorgo), separada da regra geral dos demais produtos (ver sementesCovaAtual/covasM2Alvo). */
function ehMilhoOuSorgo(nomeProduto: string): boolean {
  const normalizado = normalizarNome(nomeProduto);
  return normalizado.includes('milho') || normalizado.includes('sorgo');
}

/** Igual sementesCovaAtual, já formatado pra exibir — "Sementes/cova" (inteiro) ou "Peso/cova (g)" (Tradicional, via PMS), conforme o Processo do laudo (ver precisaPesoPorCova). '' quando falta algum dado. Só regra geral — Milho/Sorgo usa campo editável (ver ItemGuia.sementesCova). */
function formatarSementesCovaAtual(laudo: ArquivoLaudo, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicaoValor: number, espacamentoAtual: number | null): string {
  const sementesCova = sementesCovaAtual(laudo, produtos, fatorModo, fatorCondicaoValor, espacamentoAtual);
  if (sementesCova === null) return '';
  if (!precisaPesoPorCova(laudo)) return String(Math.round(sementesCova));
  const pms = pmsNumericoDoLaudo(laudo, produtos);
  return pms !== null && pms > 0 ? formatarCovas((sementesCova * pms) / 1000) : '';
}

/** Distância (cm) — SEMPRE derivada do Corredor pra manter o Covas/m² travado (regra geral, ver covasM2Alvo). Nunca editável, nunca guardada — impossível o espaçamento "descolar" do alvo. Null com Corredor inválido. */
function distanciaDerivada(corredorTexto: string): number | null {
  return distanciaDeCovasM2(covasM2Alvo(), corredorTexto);
}

/** Igual espacamentoDeDistancia, já resolvendo a Distância a partir do Corredor (regra geral, ver distanciaDerivada). */
function espacamentoEfetivo(corredorTexto: string): number | null {
  return espacamentoDeDistancia(distanciaDerivada(corredorTexto), corredorTexto);
}

/**
 * Corredor MÁXIMO (cm) que ainda cabe no Máx. plântulas/metro linear cadastrado, pra uma dada Densidade
 * — regra PRÓPRIA do modo Linha (independente de Covas/Milho-Sorgo). Plântulas/m linear = Densidade
 * (plantas/m²) × Corredor(m) — a Germinação cancela dos dois lados (Sementes/m² já é Densidade÷Germinação,
 * × Germinação/100 volta pra Densidade), por isso não entra aqui. Corredor maior que esse teto exigiria
 * mais plântulas por metro de linha do que o cadastrado permite fisicamente. Null sem os 2 cadastros
 * (Densidade, Máx. plântulas/metro linear).
 *
 * Testado usar a densidade da regra de Covas (Covas/m² alvo × Máx.plântulas/cova) no lugar da Densidade
 * de A Lanço — voltado atrás: essa densidade normalmente é BEM menor (Máx.plântulas/cova é um teto físico
 * baixo), reduzindo demais a Taxa de Semeadura calculada pro modo Linha. Densidade de A Lanço é a
 * referência certa.
 */
function corredorMaximoLinha(laudo: Pick<ArquivoLaudo, 'nomeProduto' | 'especie' | 'processo' | 'cultivar'>, produtos: ProdutoParametrizacao[]): number | null {
  const densidade = resolverDensidadeBase(laudo, produtos);
  const maxPlantulasMetroLinear = resolverMaxPlantulasMetroLinear(laudo, produtos);
  if (densidade === null || densidade <= 0 || maxPlantulasMetroLinear === null || maxPlantulasMetroLinear <= 0) return null;
  return (100 * maxPlantulasMetroLinear) / densidade;
}

/**
 * Sementes/m linear (modo Linha) — mesma Sementes/m² do modo A Lanço (Densidade ÷ Germinação final,
 * ver calcularSementesPorM2), só multiplicada pelo Corredor (m) pra virar taxa por metro de linha —
 * referência pra calibrar a plantadeira, não entra em kg/ha (que já é por área, independente de como a
 * linha é espaçada). Null sem Sementes/m² ou Corredor válido.
 */
function sementesPorMetroLinearModoLinha(sementesPorM2: number | null, corredorTexto: string): number | null {
  const corredor = paraNumero(corredorTexto);
  return sementesPorM2 === null || corredor === null || corredor <= 0 ? null : sementesPorM2 * (corredor / 100);
}

/**
 * Covas/m² alvo — REGRA PRÓPRIA de Milho/Sorgo (ver ehMilhoOuSorgo), independente da regra geral
 * (covasM2Alvo). Aqui é o INVERSO da regra geral: o operador digita quantas sementes vão em cada cova
 * (ItemGuia.sementesCova, editável, padrão 1 — teto é o Máx. de plântulas/cova cadastrado); o sistema
 * calcula quantas plântulas cada cova realmente estabelece (Sementes/cova × Germinação final ÷ 100 —
 * nem toda semente vira plântula) e divide a Densidade cadastrada (plantas/m² alvo) por isso pra achar
 * quantas covas/m² são necessárias. Menos sementes/cova (ou Germinação pior) exige MAIS covas/m² (mais
 * apertado); mais sementes/cova (ou Germinação melhor) exige MENOS (mais espaçado) — o mesmo raciocínio
 * de "A Lanço" (Densidade ÷ Germinação), só que dividido também pelas sementes/cova. Null sem Densidade
 * cadastrada, sem Germinação, ou Sementes/cova ≤ 0.
 */
function covasM2AlvoMilhoSorgo(laudo: ArquivoLaudo, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicaoValor: number, sementesCovaDigitada: number): number | null {
  if (sementesCovaDigitada <= 0) return null;
  const densidade = resolverDensidadeBase(laudo, produtos);
  if (densidade === null || densidade <= 0) return null;
  const germinacaoFinal = germinacaoFinalSemeadura(laudo, produtos, fatorModo, fatorCondicaoValor);
  if (germinacaoFinal === null || germinacaoFinal <= 0) return null;
  const plantulasPorCova = sementesCovaDigitada * (germinacaoFinal / 100);
  return plantulasPorCova > 0 ? densidade / plantulasPorCova : null;
}

/**
 * Distância mínima EFETIVA (cm) pra Milho/Sorgo — derivada do Máx. de plântulas/metro linear cadastrado
 * (Parametrização): 100 ÷ esse valor = distância mínima em cm entre PLÂNTULAS estabelecidas, não por
 * semente jogada (nem toda semente vira plântula); então multiplica pelas plântulas esperadas por cova
 * (Sementes/cova digitada × Germinação final ÷ 100, o mesmo valor contínuo usado em
 * covasM2AlvoMilhoSorgo). Mas só multiplica pra CIMA — nunca abaixo de 1 plântula: com 1 semente/cova e
 * germinação imperfeita, o resultado esperado pode ficar abaixo de 1 (ex.: 0,8), só que a planta que
 * eventualmente nascer precisa do espaço INTEIRO de uma plântula, não um espaço proporcional à chance
 * dela nascer — não existe "0,8 de planta" fisicamente disputando espaço. Multiplicar só faz sentido com
 * 2+ sementes/cova, resultando em mais de 1 plântula esperada (aí sim precisa de mais espaço, ver a
 * explicação original do usuário: cova com 1 planta, cova com 2, a distância é a média). Null sem Máx.
 * plântulas/metro cadastrado ou sem Germinação — nesse caso o desconto por espaçamento continua sem
 * teto nenhum (ver sementesComAjustePorDistancia).
 */
function distanciaMinimaEfetivaMilhoSorgo(laudo: ArquivoLaudo, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicaoValor: number, sementesCovaDigitada: number): number | null {
  const maxPlantulasMetroLinear = resolverMaxPlantulasMetroLinear(laudo, produtos);
  if (maxPlantulasMetroLinear === null || maxPlantulasMetroLinear <= 0) return null;
  const distanciaMinimaCadastrada = 100 / maxPlantulasMetroLinear;
  const germinacaoFinal = germinacaoFinalSemeadura(laudo, produtos, fatorModo, fatorCondicaoValor);
  if (germinacaoFinal === null || germinacaoFinal <= 0) return null;
  const plantulasPorCova = Math.max(1, sementesCovaDigitada * (germinacaoFinal / 100));
  return distanciaMinimaCadastrada * plantulasPorCova;
}

/**
 * Sementes/cova EFETIVA de Milho/Sorgo pra entrar em kg/ha, Sementes/m² e Sementes/m linear — a digitada
 * pelo operador (ItemGuia.sementesCova), descontada quando o espaçamento efetivo fica mais apertado que
 * o ideal pro Covas/m² alvo atual (grade quadrada nesse alvo, ver covasM2AlvoMilhoSorgo) — SEM teto (a
 * conta continua linear, 1%/cm, sem parar numa porcentagem fixa): quem trava o espaçamento na Distância
 * mínima real é a correção do próprio Corredor ao sair do campo (ver corrigirCorredorMilhoSorgo), não
 * essa fórmula — travar aqui também só capava a conta de Sementes/m linear sem necessidade. Distância/
 * Corredor exibidos continuam vindo da digitada CRUA (não dessa efetiva) — só kg/ha, Sementes/m² e
 * Sementes/m linear absorvem esse desconto.
 */
function sementesCovaEfetivaMilhoSorgo(sementesCovaDigitada: number, espacamentoAtual: number | null, covasM2AlvoAtual: number | null): number {
  if (espacamentoAtual === null || covasM2AlvoAtual === null || covasM2AlvoAtual <= 0) return sementesCovaDigitada;
  const distanciaIdeal = Math.sqrt(10000 / covasM2AlvoAtual);
  return sementesComAjustePorDistancia(sementesCovaDigitada, espacamentoAtual, distanciaIdeal);
}

/**
 * Corredor padrão (cm) ao adicionar o produto — só o PONTO DE PARTIDA, o operador ajusta livremente
 * depois. Cada modo tem sua própria regra, independente: Linha usa o teto do Máx. plântulas/metro linear
 * pra essa Densidade (ver corredorMaximoLinha — já nasce no máximo que ainda cabe, sem precisar de
 * correção automática de cara); Covas usa grade quadrada (lado = √(10000 ÷ Covas/m² alvo)) — Milho/Sorgo
 * com a regra própria (Densidade + 1 semente/cova de partida, ver covasM2AlvoMilhoSorgo), os demais com o
 * Covas/m² cadastrado (ver covasM2Alvo).
 */
function corredorPadrao(laudo: ArquivoLaudo, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicaoValor: number, modo: Modo): string {
  if (modo === 'linha') {
    const max = corredorMaximoLinha(laudo, produtos);
    return String(max !== null && max > 0 ? Math.floor(max) : 50);
  }
  const covasM2 = ehMilhoOuSorgo(laudo.nomeProduto) ? covasM2AlvoMilhoSorgo(laudo, produtos, fatorModo, fatorCondicaoValor, 1) : covasM2Alvo();
  const lado = Math.ceil(Math.sqrt(10000 / (covasM2 !== null && covasM2 > 0 ? covasM2 : 4)));
  return String(lado > 0 ? lado : 50);
}

/**
 * Guia de Plantio — busca ancorada direto nos laudos (não mais na Tabela de
 * Preço): o operador digita uma palavra-chave, o sistema filtra os laudos
 * cujo nome bate e agrupa por nome de produto. Escolher um lote empilha um
 * resultado, cada um com sua própria área — dá pra montar o plano de plantio
 * de vários produtos diferentes na mesma sessão, um "x" no canto tira um
 * resultado da pilha sem mexer nos outros.
 *
 * Em "A Lanço", a referência do cálculo é sempre a Densidade (Parametrização
 * de Produtos): Sementes/m² = Densidade ÷ Germinação final (VC%/teste ×
 * Sobrevivência% × Fatores de Modo/Condição) — não depende de PMS nem de
 * área. Em "Covas", a Densidade não serve de referência direta (ela é feita
 * pra semeadura contínua, não bate certo com competição dentro de uma cova)
 * — quem manda é o Máx. de plântulas/cova e o Covas/m² máximo cadastrados
 * (Parametrização): Sementes/cova mira o Máx. direto (ver sementesPorCovaAlvo)
 * e o Covas/m² fica TRAVADO no valor cadastrado (ver covasM2Alvo), nunca
 * editável — só o Corredor é livre, Distância é sempre derivada dele pra
 * manter esse travamento (ver distanciaDerivada). A densidade final
 * (Covas/m² × Máx./cova) é uma CONSEQUÊNCIA, pode ficar abaixo da Densidade
 * cadastrada de propósito. Sem os 2 campos cadastrados, Covas cai no cálculo
 * antigo (via Densidade, igual A Lanço), mas o Corredor continua sendo o
 * único campo editável. Em qualquer caso, PMS só entra DEPOIS, pra converter
 * Sementes/m² em kg/ha (peso); sem PMS, kg/ha, Peso e Sacos ficam pendentes,
 * mas Sementes/m²/cova continuam saindo.
 *
 * Peso do saco vem da Tabela de Preço (módulo Precificação), casando o
 * produto do laudo pelo nome com um produto cadastrado lá — só usado por
 * baixo dos panos pra converter kg em sacos, não aparece na busca nem exibe
 * valor algum (preços podem não condizer com o sistema).
 */
export function GuiaPlantioModal({
  open,
  arquivos,
  produtos,
  fatores,
  checklist,
  manual,
  laudoInicial,
  produtosPreco,
  onFechar,
}: GuiaPlantioModalProps) {
  const [condicao, setCondicao] = useState<Condicao>('media');
  const [condicaoOrigem, setCondicaoOrigem] = useState<'manual' | 'checklist'>('manual');
  const [checklistAberto, setChecklistAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [itens, setItens] = useState<ItemGuia[]>([]);
  const [confirmarImpressaoAberto, setConfirmarImpressaoAberto] = useState(false);
  /**
   * Balão flutuante (não empurra o card) avisando que o Corredor foi corrigido sozinho ao sair do campo
   * (Milho/Sorgo, ver corrigirCorredorMilhoSorgo; ou modo Linha, ver corrigirCorredorLinha) — por
   * laudoId, some ao editar Corredor ou Sementes/cova de novo. Não é reativo a cada render (senão
   * apareceria já digitando, antes de sair do campo) — só liga no próprio blur, quando a correção de
   * fato acontece.
   */
  const [avisoCorredorCorrigido, setAvisoCorredorCorrigido] = useState<Record<string, boolean>>({});

  /**
   * Peso do pacote (kg) — prioriza o que o próprio laudo traz (Peso por
   * Embalagem do Boletim de Análise, ver interpretarConteudoLaudo.ts); sem
   * isso (laudo antigo, ou modelo de documento que não traz esse dado), cai
   * pro peso cadastrado na Tabela de Preço (casando pelo nome, mesmo mecanismo
   * do Selo). Usado só pra converter kg em sacos, nunca exibido como valor.
   */
  function pesoSacoDoLaudo(laudo: ArquivoLaudo): number | null {
    const doLaudo = paraNumero(laudo.pesoEmbalagem);
    if (doLaudo !== null && doLaudo > 0) return doLaudo;
    const produtoPreco = encontrarProdutoPreco(laudo.nomeProduto, produtosPreco);
    return produtoPreco && produtoPreco.peso > 0 ? produtoPreco.peso : null;
  }

  // Busca ancorada direto no laudo (nome livre, sem depender da Tabela de
  // Preço) — filtra os laudos cujo nome bate com a palavra-chave e agrupa
  // por nome de produto, só pra exibir os lotes juntos. Mesma regra do
  // Catálogo Online (ver itensFiltrados em CatalogoPublicoPage.tsx): cada
  // palavra digitada precisa aparecer em algum lugar do nome (qualquer
  // ordem), não um trecho contíguo só — "tradicional decumbens" agora acha
  // "Brachiaria Decumbens Tradicional" mesmo com as palavras trocadas.
  const gruposFiltrados = useMemo(() => {
    const palavras = normalizarNome(busca).split(' ').filter(Boolean);
    if (palavras.length === 0) return [];
    const porNome = new Map<string, { nome: string; laudos: ArquivoLaudo[] }>();
    for (const a of arquivos) {
      const descricao = normalizarNome(a.nomeProduto);
      if (!palavras.every((palavra) => descricao.includes(palavra))) continue;
      const chave = descricao;
      if (!porNome.has(chave)) porNome.set(chave, { nome: a.nomeProduto, laudos: [] });
      porNome.get(chave)!.laudos.push(a);
    }
    return [...porNome.values()]
      .map((grupo) => ({ ...grupo, laudos: grupo.laudos.sort((a, b) => validadeParaOrdenacao(b.validade) - validadeParaOrdenacao(a.validade)) }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .slice(0, 6);
  }, [arquivos, busca]);

  function selecionar(a: ArquivoLaudo) {
    if (itens.some((it) => it.laudoId === a.id)) {
      setBusca('');
      setBuscaAberta(false);
      return;
    }
    // Modo padrão vem da Parametrização (Cova, Lanço ou Linha, cadastrado
    // por grupo) — só o ponto de partida do item, o operador ainda troca à
    // vontade depois de adicionado (pills no card).
    const modoCadastrado = resolverModoPlantio(a, produtos);
    const modoPadrao: Modo = modoCadastrado === 'cova' ? 'linha_cova' : modoCadastrado === 'linha' ? 'linha' : 'lanco';
    // Ponto de partida do Corredor (ver corredorPadrao) — Distância (Covas) ou Sementes/m linear (Linha)
    // nunca são guardadas, são sempre derivadas dele.
    const corredorInicial = corredorPadrao(a, produtos, fatorDe(fatores, modoPadrao), resolverFatorCondicao(a, condicao, produtos, fatores), modoPadrao);
    setItens((prev) => [
      ...prev,
      {
        laudoId: a.id,
        // Começa em 1 ha (não zerado) — só pra já sair mostrando os
        // totais calculados; o operador ajusta a área de verdade em
        // seguida.
        area: '1',
        modo: modoPadrao,
        corredor: corredorInicial,
        // Só usado em Milho/Sorgo (ver ehMilhoOuSorgo) — começa em 1 semente/cova, o operador ajusta depois.
        sementesCova: '1',
      },
    ]);
    setBusca('');
    setBuscaAberta(false);
  }

  // Veio da grade de Arquivos com um laudo já escolhido (botão "Guia de Plantio" com 1 selecionado) — entra sozinho na pilha ao abrir.
  useEffect(() => {
    if (open && laudoInicial) selecionar(laudoInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, laudoInicial]);

  function removerItem(laudoId: string) {
    setItens((prev) => prev.filter((it) => it.laudoId !== laudoId));
  }

  function atualizarItem(laudoId: string, patch: Partial<ItemGuia>) {
    setItens((prev) => prev.map((it) => (it.laudoId === laudoId ? { ...it, ...patch } : it)));
  }

  /** Limpa o balão de "Corredor corrigido" desse laudo — chamado sempre que o operador volta a editar Corredor ou Sementes/cova, pra não deixar um aviso velho flutuando sobre um valor novo. */
  function limparAvisoCorredor(laudoId: string) {
    setAvisoCorredorCorrigido((prev) => {
      if (!(laudoId in prev)) return prev;
      const proximo = { ...prev };
      delete proximo[laudoId];
      return proximo;
    });
  }

  /** Corredor é o único campo editável do espaçamento — Distância acompanha sozinha (derivada, ver distanciaDerivada) pra manter o Covas/m² sempre travado no alvo parametrizado; impossível o espaçamento fugir dele. */
  function atualizarCorredor(item: ItemGuia, valorTexto: string) {
    atualizarItem(item.laudoId, { corredor: valorTexto });
    limparAvisoCorredor(item.laudoId);
  }

  /** Sementes/cova editável (só Milho/Sorgo, ver ehMilhoOuSorgo) — teto é o Máx. plântulas/cova cadastrado (Parametrização); sem esse cadastro, aceita qualquer inteiro positivo. Mínimo 1 (não existe cova sem semente). */
  function atualizarSementesCova(item: ItemGuia, valorTexto: string, maxPlantulasCova: number | null) {
    const valorLimpo = valorTexto.replace(/\D/g, '');
    if (valorLimpo === '') {
      atualizarItem(item.laudoId, { sementesCova: '' });
      limparAvisoCorredor(item.laudoId);
      return;
    }
    let n = parseInt(valorLimpo, 10);
    if (maxPlantulasCova !== null && maxPlantulasCova > 0 && n > maxPlantulasCova) n = Math.floor(maxPlantulasCova);
    if (n < 1) n = 1;
    atualizarItem(item.laudoId, { sementesCova: String(n) });
    limparAvisoCorredor(item.laudoId);
  }

  /**
   * Ao sair do campo Corredor (só Milho/Sorgo, ver ehMilhoOuSorgo), se o espaçamento efetivo (o menor
   * entre Distância derivada e o próprio Corredor digitado — quem estiver mais apertado é quem limita,
   * mesma lógica de espacamentoDeDistancia) ficar abaixo da mínima real (cadastrada por plântula — ver
   * distanciaMinimaEfetivaMilhoSorgo), corrige o Corredor pra travar esse espaçamento exatamente na
   * mínima, preservando o Covas/m² pretendido (Densidade ÷ plântulas esperadas por cova).
   *
   * Distância × Corredor = 10000 ÷ Covas/m² é uma constante (chamada aqui de `produtoConstante`) — então
   * existe uma faixa válida de Corredor que deixa OS DOIS (Distância e Corredor) ≥ mínima:
   * [mínima, produtoConstante ÷ mínima]. Corredor digitado abaixo da faixa (ele mesmo é quem aperta, ver
   * o caso de Corredor=10 com Distância folgada em 245) sobe pro piso da faixa; acima da faixa (a
   * Distância derivada é quem aperta) desce pro teto da faixa. Se nem o grid quadrado (Distância =
   * Corredor) cabe na mínima — densidade pedida fisicamente incompatível — aproxima o máximo possível
   * (√produtoConstante). Sem Distância mínima cadastrada, não corrige nada (mantém só o aviso genérico
   * de antes, com o teto fixo de 40%). Quando corrige, liga o balão flutuante (ver
   * avisoCorredorCorrigido) — só nesse momento, não a cada render.
   */
  function corrigirCorredorMilhoSorgo(laudo: ArquivoLaudo, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicaoValor: number, item: ItemGuia) {
    const sementesCovaDigitada = paraNumero(item.sementesCova) ?? 1;
    const covasM2 = covasM2AlvoMilhoSorgo(laudo, produtos, fatorModo, fatorCondicaoValor, sementesCovaDigitada);
    const distanciaMinimaEfetiva = distanciaMinimaEfetivaMilhoSorgo(laudo, produtos, fatorModo, fatorCondicaoValor, sementesCovaDigitada);
    const corredorAtual = paraNumero(item.corredor);
    if (covasM2 === null || covasM2 <= 0 || distanciaMinimaEfetiva === null || distanciaMinimaEfetiva <= 0 || corredorAtual === null || corredorAtual <= 0) return;
    const produtoConstante = 10000 / covasM2; // Distância × Corredor, fixo pro Covas/m² alvo atual
    let corredorCorrigido: number | null = null;
    if (produtoConstante < distanciaMinimaEfetiva * distanciaMinimaEfetiva) {
      corredorCorrigido = Math.sqrt(produtoConstante);
    } else if (corredorAtual < distanciaMinimaEfetiva) {
      corredorCorrigido = distanciaMinimaEfetiva;
    } else if (produtoConstante / corredorAtual < distanciaMinimaEfetiva) {
      corredorCorrigido = produtoConstante / distanciaMinimaEfetiva;
    }
    if (corredorCorrigido === null || corredorCorrigido <= 0 || Math.round(corredorCorrigido) === Math.round(corredorAtual)) return;
    atualizarItem(item.laudoId, { corredor: String(Math.round(corredorCorrigido)) });
    setAvisoCorredorCorrigido((prev) => ({ ...prev, [item.laudoId]: true }));
  }

  /**
   * Ao sair do campo Corredor (modo Linha), se ultrapassar o máximo que ainda cabe no Máx.
   * plântulas/metro linear cadastrado pra essa Densidade (ver corredorMaximoLinha), corrige pra esse
   * teto — corredor maior exigiria mais plântulas por metro de linha do que o cadastrado permite. Só
   * corrige pra CIMA do teto (corredor menor sempre cabe, só deixa a linha mais adensada, o que não é
   * problema). Sem os 2 campos cadastrados (Densidade, Máx. plântulas/metro linear), não corrige nada.
   */
  function corrigirCorredorLinha(laudo: ArquivoLaudo, produtos: ProdutoParametrizacao[], item: ItemGuia) {
    const max = corredorMaximoLinha(laudo, produtos);
    const corredorAtual = paraNumero(item.corredor);
    if (max === null || max <= 0 || corredorAtual === null || corredorAtual <= max) return;
    atualizarItem(item.laudoId, { corredor: String(Math.round(max)) });
    setAvisoCorredorCorrigido((prev) => ({ ...prev, [item.laudoId]: true }));
  }

  /**
   * Área (ha) e Total de sacos são ligados nos dois modos: kg/ha e peso do
   * saco são fixos (Parametrização e Tabela de Preço), então dá pra ir dos
   * sacos pra área tão bem quanto o contrário — editar Total de sacos
   * recalcula a Área que produz exatamente essa quantidade. Área continua
   * sendo a única fonte de verdade guardada no estado (Sacos é sempre
   * derivado dela pra exibir, ver calcularResultado) — diferente de
   * Cova/Corredor, não precisa de um 2º campo guardado nem de saber "qual
   * foi editado por último".
   */
  function atualizarSacos(item: ItemGuia, valorTexto: string, kgPorHa: number | null, pesoSaco: number | null) {
    const valorLimpo = valorTexto.replace(/\D/g, '');
    if (valorLimpo === '') {
      atualizarItem(item.laudoId, { area: '' });
      return;
    }
    if (kgPorHa === null || kgPorHa <= 0 || pesoSaco === null || pesoSaco <= 0) return;
    const sacosDigitados = parseInt(valorLimpo, 10);
    // Precisa usar o MESMO kg/ha arredondado pra cima que calcularResultado usa pra ir de
    // Área -> Peso total (linha ~358) — senão o round-trip Sacos -> Área -> Sacos não bate e o
    // campo "trava" num número diferente do que foi digitado sempre que a Taxa de Semeadura
    // (kg/ha) não é um inteiro exato.
    const areaNova = (sacosDigitados * pesoSaco) / Math.ceil(kgPorHa);
    atualizarItem(item.laudoId, { area: areaNova > 0 ? String(Math.round(areaNova * 100) / 100) : '' });
  }

  /** Trocar o modo (A Lanço ⇄ Covas) só muda o rótulo em si — Sementes/cova (ou Peso/cova) é sempre recalculada ao vivo pro modo/condição atuais (ver sementesCovaAtual), nunca precisa de recálculo manual aqui. */
  function mudarModo(item: ItemGuia, modo: Modo) {
    atualizarItem(item.laudoId, { modo });
  }

  function fecharTudo() {
    setBusca('');
    setItens([]);
    onFechar();
  }

  function calcularResultado(laudo: ArquivoLaudo, item: ItemGuia) {
    const fatorModo = fatorDe(fatores, item.modo);
    const fatorCondicaoItem = resolverFatorCondicao(laudo, condicao, produtos, fatores);
    let covasPorM2: number | null = null;
    let kgPorHa: number | null;
    let sementesPorM2: number | null;
    if (item.modo === 'linha_cova' && ehMilhoOuSorgo(laudo.nomeProduto)) {
      // Milho/Sorgo: regra própria — Sementes/cova é editável (ver ItemGuia.sementesCova), Covas/m² vem
      // da Densidade cadastrada dividida pelas plântulas que essa Sementes/cova realmente estabelece
      // (ver covasM2AlvoMilhoSorgo), nunca do Covas/m² cadastrado (Parametrização), que essa regra não usa.
      const sementesCovaDigitada = paraNumero(item.sementesCova) ?? 1;
      covasPorM2 = covasM2AlvoMilhoSorgo(laudo, produtos, fatorModo, fatorCondicaoItem, sementesCovaDigitada);
      const distancia = distanciaDeCovasM2(covasPorM2, item.corredor);
      const espacamentoAtual = espacamentoDeDistancia(distancia, item.corredor);
      const sementesCovaEfetiva = sementesCovaEfetivaMilhoSorgo(sementesCovaDigitada, espacamentoAtual, covasPorM2);
      sementesPorM2 = covasPorM2 !== null ? covasPorM2 * sementesCovaEfetiva : null;
      kgPorHa = kgPorHaDeSementesCova(covasPorM2, sementesCovaEfetiva, pmsNumericoDoLaudo(laudo, produtos));
    } else if (item.modo === 'linha_cova') {
      // Regra geral: kg/ha vem do Covas/m² travado e da Sementes/cova travada (Covas/m² × Sementes/cova
      // × PMS) — nunca só da Densidade (que funciona bem pra "A Lanço", mas em Covas o espaçamento pode
      // não bater a Densidade cadastrada de propósito, ver Máx./cova e Covas/m² na Parametrização).
      covasPorM2 = covasM2Alvo();
      const espacamentoAtual = espacamentoEfetivo(item.corredor);
      const sementesCova = sementesCovaAtual(laudo, produtos, fatorModo, fatorCondicaoItem, espacamentoAtual);
      sementesPorM2 = covasPorM2 !== null && sementesCova !== null ? covasPorM2 * sementesCova : null;
      kgPorHa = kgPorHaDeSementesCova(covasPorM2, sementesCova, pmsNumericoDoLaudo(laudo, produtos));
    } else {
      // A Lanço e Linha usam exatamente a mesma referência (Densidade cadastrada ÷ Germinação final) —
      // Linha só ACRESCENTA a exibição de Sementes/m linear (ver sementesPorMetroLinearModoLinha, na
      // renderização do card), não muda kg/ha nem Sementes/m² em nada.
      kgPorHa = calcularKgPorHectareNumero(laudo, produtos, fatorModo, fatorCondicaoItem);
      sementesPorM2 = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicaoItem);
    }
    const areaNum = paraNumero(item.area);
    // Total necessário parte do kg/ha já arredondado pra cima (o mesmo número
    // exibido em Taxa de Semeadura), não do valor cru — os cálculos de
    // Densidade/Germinação já carregam alguma imprecisão de campo, então é
    // melhor ter essa folga (compra um pouco a mais) do que fechar exato.
    const pesoTotal = kgPorHa !== null && areaNum !== null && areaNum > 0 ? Math.ceil(kgPorHa) * areaNum : null;
    const pesoSaco = pesoSacoDoLaudo(laudo);
    // Arredonda por margem de tolerância (Parametrização, 25% padrão) — não
    // por 0,5 nem sempre pra cima (Math.ceil antigo virava 1 saco a mais só
    // por faltar 1kg, um exagero em compras maiores).
    const margemTolerancia = resolverMargemTolerancia(laudo, produtos);
    const sacos = pesoTotal !== null && pesoSaco !== null && pesoSaco > 0 ? arredondarSacos(pesoTotal / pesoSaco, margemTolerancia / 100) : null;
    // Peso total REAL (o que efetivamente se compra/pesa) = sacos (arredondados) × peso do saco — diferente do
    // "Total previsto/necessário" (teórico, continuo) porque só dá pra comprar saco inteiro.
    const pesoTotalReal = sacos !== null && pesoSaco !== null ? sacos * pesoSaco : null;
    return { kgPorHa, pesoTotal, pesoTotalReal, pesoSaco, sacos, sementesPorM2, covasPorM2 };
  }

  /**
   * Taxa de Semeadura (kg/ha) nas outras 2 condições (não a selecionada agora) — só informativo, pra
   * comparar sem precisar trocar a condição global. Milho/Sorgo recalcula o Covas/m² pra cada condição
   * com a MESMA Sementes/cova digitada (ver covasM2AlvoMilhoSorgo); os demais usam o Covas/m² travado de
   * sempre, consistente com o que calcularResultado mostra pra condição selecionada.
   */
  function kgPorHaOutrasCondicoes(laudo: ArquivoLaudo, item: ItemGuia): { rotulo: string; kgPorHa: number | null }[] {
    const fatorModo = fatorDe(fatores, item.modo);
    if (item.modo !== 'linha_cova') {
      return OPCOES_CONDICAO.filter((o) => o.valor !== condicao).map((o) => ({
        rotulo: o.rotulo,
        kgPorHa: calcularKgPorHectareNumero(laudo, produtos, fatorModo, resolverFatorCondicao(laudo, o.valor, produtos, fatores)),
      }));
    }
    const pms = pmsNumericoDoLaudo(laudo, produtos);
    if (ehMilhoOuSorgo(laudo.nomeProduto)) {
      const sementesCovaDigitada = paraNumero(item.sementesCova) ?? 1;
      return OPCOES_CONDICAO.filter((o) => o.valor !== condicao).map((o) => {
        const fatorCondicaoAlt = resolverFatorCondicao(laudo, o.valor, produtos, fatores);
        const covasPorM2 = covasM2AlvoMilhoSorgo(laudo, produtos, fatorModo, fatorCondicaoAlt, sementesCovaDigitada);
        const distancia = distanciaDeCovasM2(covasPorM2, item.corredor);
        const espacamentoAtual = espacamentoDeDistancia(distancia, item.corredor);
        const sementesCovaEfetiva = sementesCovaEfetivaMilhoSorgo(sementesCovaDigitada, espacamentoAtual, covasPorM2);
        return { rotulo: o.rotulo, kgPorHa: kgPorHaDeSementesCova(covasPorM2, sementesCovaEfetiva, pms) };
      });
    }
    const covasPorM2 = covasM2Alvo();
    const espacamentoAtual = espacamentoEfetivo(item.corredor);
    return OPCOES_CONDICAO.filter((o) => o.valor !== condicao).map((o) => {
      const fatorCondicaoAlt = resolverFatorCondicao(laudo, o.valor, produtos, fatores);
      const sementesCova = sementesCovaAtual(laudo, produtos, fatorModo, fatorCondicaoAlt, espacamentoAtual);
      return { rotulo: o.rotulo, kgPorHa: kgPorHaDeSementesCova(covasPorM2, sementesCova, pms) };
    });
  }

  // Soma dos cards empilhados — só entra na soma o que deu pra calcular (sacos/peso nulos são ignorados, não zerados).
  const resumoGeral = itens.reduce(
    (acc, item) => {
      const laudo = arquivos.find((a) => a.id === item.laudoId);
      if (!laudo) return acc;
      const r = calcularResultado(laudo, item);
      return {
        totalSacos: acc.totalSacos + (r.sacos ?? 0),
        totalPeso: acc.totalPeso + (r.pesoTotalReal ?? 0),
      };
    },
    { totalSacos: 0, totalPeso: 0 },
  );

  function imprimir(comManual: boolean) {
    const condicaoLabelAtual = OPCOES_CONDICAO.find((o) => o.valor === condicao)?.rotulo ?? '';
    const condicaoResumoAtual = fatores.find((f) => f.categoria === 'condicao' && f.chave === condicao)?.resumo ?? null;
    const linhas = itens.flatMap((item) => {
      const laudo = arquivos.find((a) => a.id === item.laudoId);
      if (!laudo) return [];
      const r = calcularResultado(laudo, item);
      const modoLabel = OPCOES_MODO.find((o) => o.valor === item.modo)?.rotulo ?? '';
      const condicaoLabel = condicaoLabelAtual;
      // Distância impressa vem do Covas/m² que calcularResultado já resolveu (r.covasPorM2) — funciona
      // igual pras 2 regras (geral e Milho/Sorgo), já que r.covasPorM2 é o alvo certo pra cada uma.
      const distanciaItem = item.modo === 'linha_cova' ? distanciaDeCovasM2(r.covasPorM2, item.corredor) : null;
      let sementesPorCovaValor: string | null = null;
      if (item.modo === 'linha_cova') {
        if (ehMilhoOuSorgo(laudo.nomeProduto)) {
          // Imprime a quantidade DIGITADA (o que o operador realmente solta em cada cova) — o desconto por
          // espaçamento mínimo (ver sementesCovaEfetivaMilhoSorgo) só ajusta o kg/ha por trás, não a instrução.
          sementesPorCovaValor = String(Math.round(paraNumero(item.sementesCova) ?? 1));
        } else {
          const fatorModoItem = fatorDe(fatores, item.modo);
          const fatorCondicaoAtual = resolverFatorCondicao(laudo, condicao, produtos, fatores);
          const espacamentoItem = espacamentoEfetivo(item.corredor);
          sementesPorCovaValor = formatarSementesCovaAtual(laudo, produtos, fatorModoItem, fatorCondicaoAtual, espacamentoItem) || '—';
        }
      }
      return [
        {
          nomeProduto: laudo.nomeProduto,
          lote: laudo.lote,
          condicaoLabel,
          modoLabel,
          area: item.area ? `${item.area} ha` : '—',
          taxaSemeadura: r.kgPorHa === null ? '—' : `${Math.ceil(r.kgPorHa)} kg/ha`,
          totalPrevisto: r.pesoTotal === null ? '—' : `${Math.ceil(r.pesoTotal)} kg`,
          totalSacos: r.sacos === null ? '—' : `${r.sacos} sacos`,
          sementesOuCovasLabel: item.modo === 'linha_cova' ? 'Covas/m²' : null,
          sementesOuCovasValor: item.modo === 'linha_cova' ? (r.covasPorM2 === null ? '—' : formatarCovas(r.covasPorM2)) : null,
          espacamento:
            item.modo === 'linha_cova'
              ? `${distanciaItem === null ? '—' : Math.round(distanciaItem)}×${item.corredor || '—'} cm`
              : item.modo === 'linha'
                ? `${item.corredor || '—'} cm`
                : null,
          sementesPorCovaLabel: item.modo === 'linha_cova' ? (precisaPesoPorCova(laudo) ? 'Peso/cova (g)' : 'Sem./cova') : null,
          sementesPorCovaValor,
        },
      ];
    });
    gerarGuiaPlantioPdf(
      linhas,
      {
        totalSacos: `${resumoGeral.totalSacos} sacos`,
        totalPeso: `${Math.ceil(resumoGeral.totalPeso)} kg`,
      },
      { label: condicaoLabelAtual, resumo: condicaoResumoAtual },
      manual,
      comManual,
    );
  }

  return (
    <Modal
      open={open}
      title={
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="whitespace-nowrap">Guia de Plantio</span>
            {itens.length > 0 && (
              <span className="whitespace-nowrap text-xs font-normal text-slate-300">
                <span className="font-semibold text-white">{resumoGeral.totalSacos}</span> sacos ·{' '}
                <span className="font-semibold text-white">{Math.ceil(resumoGeral.totalPeso)} kg</span>
              </span>
            )}
            {itens.length > 0 && (
              <button
                type="button"
                onClick={() => (manual ? setConfirmarImpressaoAberto(true) : imprimir(false))}
                title="Imprimir"
                className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/15 text-white/90 transition hover:bg-white/28"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
              </button>
            )}
          </div>
        </div>
      }
      onClose={fecharTudo}
      widthClassName="max-w-[640px]"
      heightClassName="sm:max-h-[92vh]"
    >
      <div className="min-h-[540px] space-y-3">
        <div className="sticky -top-[18px] z-20 -mx-[18px] -mt-[18px] space-y-1.5 bg-[var(--color-surface)] px-[18px] pb-2 pt-2 text-sm">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[var(--color-text-soft)]">Condição do plantio:</span>
              {OPCOES_CONDICAO.map((o) => {
                const selecionada = condicao === o.valor;
                const viaChecklist = selecionada && condicaoOrigem === 'checklist';
                return (
                  <button
                    key={o.valor}
                    type="button"
                    onClick={() => {
                      setCondicao(o.valor);
                      setCondicaoOrigem('manual');
                    }}
                    title={viaChecklist ? 'Definida pelo checklist' : undefined}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                      viaChecklist
                        ? 'bg-blue-600 text-white'
                        : selecionada
                          ? 'bg-[var(--color-accent)] text-white'
                          : 'bg-[var(--color-page)] text-[var(--color-text-soft)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    {o.rotulo}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setChecklistAberto(true)}
              title="Checklist de diagnóstico de campo"
              className="ml-auto rounded-full border border-[var(--color-line)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
            >
              ☑ Checklist
            </button>
          </div>

          <div className="relative">
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setBuscaAberta(true);
            }}
            onFocus={() => setBuscaAberta(true)}
            onBlur={() => setTimeout(() => setBuscaAberta(false), 120)}
            placeholder="Buscar produto no laudo..."
            autoComplete="off"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
          />
          {buscaAberta && gruposFiltrados.length > 0 && (
            <div className="absolute z-30 mt-1 max-h-[320px] w-full overflow-y-auto rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] shadow-lg">
              {gruposFiltrados.map((grupo) => (
                <div key={grupo.nome} className="border-b border-[var(--color-line)] py-1 last:border-b-0">
                  <p className="truncate px-3 py-1 text-sm font-semibold text-[var(--color-text)]" title={grupo.nome}>
                    {grupo.nome}
                  </p>
                  {grupo.laudos.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selecionar(a)}
                      className="flex w-full flex-col px-3 py-1 pl-4 text-left text-xs font-normal text-[var(--color-text-soft)] hover:bg-[var(--color-accent)]/15 hover:text-[var(--color-text)]"
                    >
                      Lote {a.lote ?? '—'} · Val. {a.validade ?? '—'} · {a.fornecedor ?? '—'}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          {buscaAberta && busca.trim() && gruposFiltrados.length === 0 && (
            <div className="absolute z-30 mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-xs font-normal text-[var(--color-text-soft)] shadow-lg">
              Nenhum laudo encontrado com esse nome.
            </div>
          )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {itens.map((item) => {
            const laudo = arquivos.find((a) => a.id === item.laudoId);
            if (!laudo) return null;
            const r = calcularResultado(laudo, item);
            return (
              <div key={item.laudoId}>
                <div className="mb-1 flex justify-end gap-0.5">
                  {OPCOES_MODO.map((o) => (
                    <button
                      key={o.valor}
                      type="button"
                      onClick={() => mudarModo(item, o.valor)}
                      className={`inline-flex h-5 items-center rounded-full px-1.5 text-[10px] font-medium transition ${
                        item.modo === o.valor ? 'bg-orange-500 text-white' : 'bg-[var(--color-page)] text-[var(--color-text-soft)] hover:text-[var(--color-text)]'
                      }`}
                    >
                      {o.rotulo}
                    </button>
                  ))}
                </div>
                <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
                <div
                  className={`grid ${
                    item.modo === 'linha_cova' || item.modo === 'linha'
                      ? 'grid-cols-[minmax(160px,1.1fr)_minmax(140px,0.9fr)_minmax(160px,1.2fr)]'
                      : 'grid-cols-[minmax(160px,1.1fr)_minmax(160px,2.1fr)]'
                  }`}
                >
                  {/* Coluna 1: Cabeçalho, Área e Total de sacos */}
                  <div className="relative flex flex-col p-2.5 pr-6">
                    <button
                      type="button"
                      onClick={() => removerItem(item.laudoId)}
                      title="Remover esse resultado"
                      className="absolute right-1.5 top-1.5 text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
                    >
                      ✕
                    </button>
                    <p className="truncate text-sm font-semibold text-[var(--color-text)]">{laudo.nomeProduto}</p>
                    <p className="truncate text-[10px] text-[var(--color-text-soft)]" title={`Lote ${laudo.lote ?? '—'} · VC ${calcularVC(laudo)} · PMS ${pmsDoLaudo(laudo, produtos) ?? '—'}`}>
                      Lote {laudo.lote ?? '—'} · VC {calcularVC(laudo)} · PMS {pmsDoLaudo(laudo, produtos) ?? '—'}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <div>
                        <p className="text-[10px] text-[var(--color-text-soft)]">Área (ha)</p>
                        <input
                          value={item.area}
                          onChange={(e) => atualizarItem(item.laudoId, { area: e.target.value })}
                          inputMode="decimal"
                          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)]"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] text-[var(--color-text-soft)]">Total de sacos</p>
                        <input
                          value={r.sacos === null ? '' : String(r.sacos)}
                          onChange={(e) => atualizarSacos(item, e.target.value, r.kgPorHa, r.pesoSaco)}
                          disabled={r.kgPorHa === null || r.pesoSaco === null}
                          inputMode="numeric"
                          title={
                            r.kgPorHa === null || r.pesoSaco === null
                              ? 'Precisa do kg/ha (Densidade/Sobrevivência) e do peso do saco (Tabela de Preço) pra ligar com a Área'
                              : 'Ligado com Área (ha) — editar recalcula a área pra essa quantidade de sacos'
                          }
                          className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Coluna 2: Espaçamento — só existe em modo Covas, some (não só esconde) em A Lanço pra deixar o card mais baixo */}
                  {item.modo === 'linha_cova' &&
                    (() => {
                      const pesoPorCova = precisaPesoPorCova(laudo);
                      const pms = pmsNumericoDoLaudo(laudo, produtos);
                      const semPmsParaPeso = pesoPorCova && pms === null;
                      const milhoSorgo = ehMilhoOuSorgo(laudo.nomeProduto);
                      const fatorModoItem = fatorDe(fatores, item.modo);
                      const fatorCondicaoAtual = resolverFatorCondicao(laudo, condicao, produtos, fatores);
                      const maxPlantulasCova = resolverMaxPlantulasCova(laudo, produtos);

                      let distancia: number | null;
                      let espacamentoAtual: number | null;
                      let sementesCovaNum: number | null;
                      if (milhoSorgo) {
                        const sementesCovaDigitada = paraNumero(item.sementesCova) ?? 1;
                        const covasM2 = covasM2AlvoMilhoSorgo(laudo, produtos, fatorModoItem, fatorCondicaoAtual, sementesCovaDigitada);
                        distancia = distanciaDeCovasM2(covasM2, item.corredor);
                        espacamentoAtual = espacamentoDeDistancia(distancia, item.corredor);
                        sementesCovaNum = sementesCovaEfetivaMilhoSorgo(sementesCovaDigitada, espacamentoAtual, covasM2);
                      } else {
                        distancia = distanciaDerivada(item.corredor);
                        espacamentoAtual = espacamentoEfetivo(item.corredor);
                        sementesCovaNum = sementesCovaAtual(laudo, produtos, fatorModoItem, fatorCondicaoAtual, espacamentoAtual);
                      }
                      // Sementes por metro linear de linha (covas por metro × Sementes/cova) — só informativo,
                      // útil pra calibrar plantadeira (mesma ideia do modo Linha, ver
                      // sementesPorMetroLinearModoLinha), sem trocar o layout do card (Covas nunca vira
                      // "semeadura contínua" sozinho — pra isso existe o modo Linha, independente).
                      const sementesPorMetroLinear = distancia !== null && distancia > 0 && sementesCovaNum !== null ? (100 / distancia) * sementesCovaNum : null;
                      const germinacaoFinalAtual = germinacaoFinalSemeadura(laudo, produtos, fatorModoItem, fatorCondicaoAtual);
                      const plantulasPorM2 = r.sementesPorM2 !== null && germinacaoFinalAtual !== null ? r.sementesPorM2 * (germinacaoFinalAtual / 100) : null;
                      // Nem toda semente lançada vira planta (germinação) — quantas realmente ESTABELECEM em
                      // cada cova, pro tooltip de Sementes/Peso por cova (mesma ideia do Sem./m linear ao lado,
                      // que já mostra Sementes/m² e Plântulas/m² juntos).
                      const plantulasPorCova = sementesCovaNum !== null && germinacaoFinalAtual !== null ? sementesCovaNum * (germinacaoFinalAtual / 100) : null;
                      const tituloPlantulasPorCova = `Plântulas/cova: ${plantulasPorCova === null ? '—' : formatarCovas(plantulasPorCova)}`;
                      return (
                        <div className="flex flex-col gap-1.5 border-l border-[var(--color-line)] p-2.5">
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <p className="text-[10px] text-[var(--color-text-soft)]">Distância (cm)</p>
                              <p
                                title={
                                  milhoSorgo
                                    ? 'Travada — vem da Densidade cadastrada e da Sementes/cova ao lado (quanto mais sementes/cova, menos covas/m² precisa)'
                                    : 'Travada — sempre derivada do Corredor pra manter o Covas/m² no alvo parametrizado'
                                }
                                className="border border-transparent px-1.5 py-1 text-xs font-medium text-[var(--color-text)]"
                              >
                                {distancia === null ? '—' : Math.round(distancia)}
                              </p>
                            </div>
                            <div className="relative">
                              <p className="text-[10px] text-[var(--color-text-soft)]">Corredor (cm)</p>
                              <input
                                value={item.corredor}
                                onChange={(e) => atualizarCorredor(item, e.target.value)}
                                onBlur={milhoSorgo ? () => corrigirCorredorMilhoSorgo(laudo, produtos, fatorModoItem, fatorCondicaoAtual, item) : undefined}
                                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                inputMode="decimal"
                                title={
                                  milhoSorgo
                                    ? 'Único campo editável do espaçamento — se a Distância ficar abaixo do mínimo cadastrado, corrige sozinho ao sair do campo'
                                    : 'Único campo editável do espaçamento — Distância acompanha sozinha pra manter o Covas/m² no alvo'
                                }
                                className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)]"
                              />
                              {/* Balão flutuante — não empurra o card (ver avisoCorredorCorrigido); só aparece depois que o
                                  operador sai do campo e o sistema já recalculou o Corredor sozinho. Fecha sozinho ao
                                  editar Corredor/Sementes/cova de novo, ou no ×. */}
                              {milhoSorgo && avisoCorredorCorrigido[item.laudoId] && (
                                <div className="absolute left-1/2 top-full z-40 mt-1 w-max max-w-[170px] -translate-x-1/2 rounded-md bg-bad py-1 pl-2 pr-1 text-[9px] leading-tight text-white shadow-lg">
                                  <div className="flex items-start gap-1">
                                    <span className="flex-1">Espaçamento abaixo do mínimo — Corredor e Taxa de Semeadura já ajustados</span>
                                    <button
                                      type="button"
                                      onClick={() => limparAvisoCorredor(item.laudoId)}
                                      title="Fechar aviso"
                                      className="shrink-0 px-0.5 text-white/80 hover:text-white"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <p className="text-[10px] text-[var(--color-text-soft)]">{pesoPorCova ? 'Peso/cova (g)' : 'Sem./cova'}</p>
                              {milhoSorgo ? (
                                <input
                                  value={item.sementesCova}
                                  onChange={(e) => atualizarSementesCova(item, e.target.value, maxPlantulasCova)}
                                  inputMode="numeric"
                                  title={
                                    maxPlantulasCova !== null
                                      ? `Editável — quantas sementes vão em cada cova, até ${maxPlantulasCova} (Máx. plântulas/cova cadastrado)\n${tituloPlantulasPorCova}`
                                      : `Editável — quantas sementes vão em cada cova\n${tituloPlantulasPorCova}`
                                  }
                                  className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)]"
                                />
                              ) : (
                                <p
                                  title={`Travada — quantidade ideal parametrizada pra Condição/Modo atuais, descontada quando o espaçamento fica mais apertado que o ideal do produto (1%/cm)\n${tituloPlantulasPorCova}`}
                                  className="border border-transparent px-1.5 py-1 text-xs font-medium text-[var(--color-text)]"
                                >
                                  {formatarSementesCovaAtual(laudo, produtos, fatorModoItem, fatorCondicaoAtual, espacamentoAtual) || '—'}
                                </p>
                              )}
                              {semPmsParaPeso && <p className="mt-0.5 text-[9px] text-bad">Sem PMS cadastrado</p>}
                            </div>
                            <div>
                              <p className="text-[10px] text-[var(--color-text-soft)]">Sem./m (linear)</p>
                              <p
                                title={`Sementes/m²: ${r.sementesPorM2 === null ? '—' : formatarCovas(r.sementesPorM2)}\nPlântulas/m²: ${plantulasPorM2 === null ? '—' : formatarCovas(plantulasPorM2)}`}
                                className="border border-transparent px-1.5 py-1 text-xs font-medium text-[var(--color-text)]"
                              >
                                {sementesPorMetroLinear === null ? '—' : formatarCovas(sementesPorMetroLinear)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                  {/* Coluna 2 (modo Linha): Corredor + Sementes/m linear — regra própria, independente de Covas (ver corredorMaximoLinha/corrigirCorredorLinha). */}
                  {item.modo === 'linha' &&
                    (() => {
                      const sementesPorMetroLinear = sementesPorMetroLinearModoLinha(r.sementesPorM2, item.corredor);
                      // Sementes/m² × Germinação/100 = Densidade cadastrada, por construção (ver calcularSementesPorM2)
                      // — mais direto pegar a própria Densidade do que recalcular via Germinação.
                      const plantulasPorM2 = resolverDensidadeBase(laudo, produtos);
                      // Mesma conversão de Sementes/m² -> Sementes/m linear (× Corredor em metros), aplicada em
                      // cima de Plântulas/m² — nem toda semente lançada vira planta, então o Corredor precisa
                      // escalar os dois do mesmo jeito.
                      const plantulasPorMetroLinear = sementesPorMetroLinearModoLinha(plantulasPorM2, item.corredor);
                      return (
                        <div className="flex flex-col gap-1.5 border-l border-[var(--color-line)] p-2.5">
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="relative">
                              <p className="text-[10px] text-[var(--color-text-soft)]">Corredor (cm)</p>
                              <input
                                value={item.corredor}
                                onChange={(e) => atualizarCorredor(item, e.target.value)}
                                onBlur={() => corrigirCorredorLinha(laudo, produtos, item)}
                                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                inputMode="decimal"
                                title="Espaçamento entre linhas — usado só pra calcular Sementes/m linear; se passar do Máx. plântulas/metro linear cadastrado pra essa densidade, corrige sozinho ao sair do campo"
                                className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)]"
                              />
                              {avisoCorredorCorrigido[item.laudoId] && (
                                <div className="absolute left-1/2 top-full z-40 mt-1 w-max max-w-[170px] -translate-x-1/2 rounded-md bg-bad py-1 pl-2 pr-1 text-[9px] leading-tight text-white shadow-lg">
                                  <div className="flex items-start gap-1">
                                    <span className="flex-1">Corredor acima do máximo — já ajustado pro Máx. plântulas/metro linear cadastrado</span>
                                    <button
                                      type="button"
                                      onClick={() => limparAvisoCorredor(item.laudoId)}
                                      title="Fechar aviso"
                                      className="shrink-0 px-0.5 text-white/80 hover:text-white"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="text-[10px] text-[var(--color-text-soft)]">Sem./m (linear)</p>
                              <p
                                title={`Sementes/m²: ${r.sementesPorM2 === null ? '—' : formatarCovas(r.sementesPorM2)}\nPlântulas/m²: ${plantulasPorM2 === null ? '—' : formatarCovas(plantulasPorM2)}\nPlântulas/m: ${plantulasPorMetroLinear === null ? '—' : formatarCovas(plantulasPorMetroLinear)}`}
                                className="border border-transparent px-1.5 py-1 text-xs font-medium text-[var(--color-text)]"
                              >
                                {sementesPorMetroLinear === null ? '—' : formatarCovas(sementesPorMetroLinear)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                  {/* Coluna 3: Resultado */}
                  <div className="flex flex-col border-l border-[var(--color-line)] p-2.5">
                    {r.kgPorHa === null && r.sementesPorM2 === null ? (
                      <p className="text-xs text-[var(--color-text-soft)]">
                        Faltam dados pra calcular esse lote — confira Densidade, Índice de Sobrevivência (ou teste de campo) na Parametrização de Produtos.
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 items-center gap-x-2 gap-y-1 text-xs">
                          {r.kgPorHa === null && (
                            <p className="col-span-2 pb-0.5 text-[10px] text-[var(--color-text-soft)]">
                              Sem PMS cadastrado — Taxa e Total ficam pendentes; Sementes/m²/cova continuam calculadas normalmente.
                            </p>
                          )}
                          <p className="whitespace-nowrap border-b border-[var(--color-line)] pb-1 text-[var(--color-text-soft)]">Taxa de Semeadura</p>
                          <p className="border-b border-[var(--color-line)] pb-1 text-right font-medium text-[var(--color-text)]">
                            {r.kgPorHa === null ? '—' : `${Math.ceil(r.kgPorHa)} kg/ha`}
                          </p>

                          <p className="whitespace-nowrap text-[var(--color-text-soft)]">Total necessário (kg)</p>
                          <p className="text-right font-medium text-[var(--color-text)]">{r.pesoTotal === null ? '—' : `${Math.ceil(r.pesoTotal)} kg`}</p>
                        </div>
                        <div className="mt-1.5 flex flex-1 flex-col justify-center gap-0.5 rounded-md bg-[var(--color-page)] px-2 py-1 text-[10px] text-[var(--color-text-soft)]">
                          {kgPorHaOutrasCondicoes(laudo, item).map((o) => (
                            <p key={o.rotulo} className="flex justify-between gap-2">
                              <span>Taxa na condição {o.rotulo}</span>
                              <span className="font-medium text-[var(--color-text)]">{o.kgPorHa === null ? '—' : `${Math.ceil(o.kgPorHa)} kg/ha`}</span>
                            </p>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ChecklistCondicaoModal
        open={checklistAberto}
        checklist={checklist}
        fatores={fatores}
        onFechar={() => setChecklistAberto(false)}
        onConfirmar={(chave) => {
          setCondicao(chave as Condicao);
          setCondicaoOrigem('checklist');
          setChecklistAberto(false);
        }}
      />
      <Modal
        open={confirmarImpressaoAberto}
        title="Imprimir Guia de Plantio"
        onClose={() => setConfirmarImpressaoAberto(false)}
        widthClassName="max-w-[420px]"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmarImpressaoAberto(false);
                imprimir(false);
              }}
            >
              Só os resultados
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirmarImpressaoAberto(false);
                imprimir(true);
              }}
            >
              Incluir Manual de Plantio
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-text)]">Deseja imprimir também o Manual de Plantio junto com os resultados?</p>
      </Modal>
    </Modal>
  );
}
