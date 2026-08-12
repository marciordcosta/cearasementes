import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Produto } from '@/features/pricing/types';
import { calcularKgPorHectareNumero, calcularSementesPorCova, calcularSementesPorM2, germinacaoFinalSemeadura } from '../calculoSemeadura';
import { gerarGuiaPlantioPdf } from '../guiaPlantioPdf';
import { calcularVC, paraNumero } from '../metricas';
import {
  encontrarProdutoPreco,
  normalizarNome,
  resolverDensidadeBase,
  resolverMargemTolerancia,
  resolverMaxCovasM2,
  resolverMaxPlantulasCova,
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

type Modo = 'linha_cova' | 'lanco';
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
}

const OPCOES_MODO: { valor: Modo; rotulo: string }[] = [
  { valor: 'lanco', rotulo: 'A Lanço' },
  { valor: 'linha_cova', rotulo: 'Covas' },
];

const OPCOES_CONDICAO: { valor: Condicao; rotulo: string }[] = [
  { valor: 'baixa', rotulo: 'Baixa' },
  { valor: 'media', rotulo: 'Média' },
  { valor: 'ideal', rotulo: 'Ideal' },
];

function fatorDe(fatores: FatorPlantio[], chave: string): number {
  return paraNumero(fatores.find((f) => f.chave === chave)?.fator ?? null) ?? 1;
}

function formatarCovas(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

/**
 * Arredonda o total de sacos por MARGEM de tolerância (cadastrada por grupo
 * em Parametrização, 25% se não cadastrado) em vez do arredondamento padrão
 * (0,5): até essa % de saco faltando ainda arredonda pra baixo (compra
 * menos), acima arredonda pra cima. Sempre no mínimo 1 saco quando há
 * alguma demanda de verdade (senão "faltar pouco" pra completar o PRIMEIRO
 * saco resultaria em 0 sacos, o que não faz sentido — tem que comprar pelo
 * menos 1 pra ter semente nenhuma).
 */
function arredondarSacos(quociente: number, margemFracao: number): number {
  const inteiros = Math.floor(quociente);
  const fracao = quociente - inteiros;
  const sacos = fracao > margemFracao ? inteiros + 1 : inteiros;
  return quociente > 0 ? Math.max(sacos, 1) : 0;
}

/** Sementes Tradicionais (soltas, pequenas) não dá pra catar uma a uma pra colocar na cova — só pesar; Incrustadas (peletizadas) são grandes o bastante pra contar. Decide qual campo o card mostra: "Sementes/cova" (Incrustado e demais) ou "Peso/cova (g)" (Tradicional). */
function precisaPesoPorCova(laudo: Pick<ArquivoLaudo, 'processo'>): boolean {
  return (laudo.processo ?? '').toLowerCase().includes('tradicional');
}

/** Validade no formato "MM/AAAA" (texto livre, digitado pelo operador) — convertida num número comparável (ano×12+mês). Sem validade cadastrada vai pro fim da lista. */
function validadeParaOrdenacao(validade: string | null): number {
  const partes = (validade ?? '').split('/');
  if (partes.length !== 2) return -Infinity;
  const mes = Number(partes[0]);
  const ano = Number(partes[1]);
  if (!Number.isFinite(mes) || !Number.isFinite(ano)) return -Infinity;
  return ano * 12 + mes;
}

/** PMS do lote (se digitado) ou, em branco, o PMS base do produto na Parametrização — como texto cru (ex.: "4,5"), pra exibir igual foi cadastrado. */
function pmsDoLaudo(laudo: Pick<ArquivoLaudo, 'nomeProduto' | 'pms'>, produtos: ProdutoParametrizacao[]): string | null {
  return laudo.pms || resolverPmsBaseTexto(laudo.nomeProduto, produtos);
}

/** Igual pmsDoLaudo, já convertido pra número — usado pra converter Sementes/cova em Peso/cova (kg/ha, exibição em modo Tradicional). */
function pmsNumericoDoLaudo(laudo: Pick<ArquivoLaudo, 'nomeProduto' | 'pms'>, produtos: ProdutoParametrizacao[]): number | null {
  return paraNumero(pmsDoLaudo(laudo, produtos));
}

/**
 * Sementes/cova (equivalente, sempre em SEMENTES mesmo pra Tradicional) que bate EXATAMENTE o Máx. de
 * plântulas/cova cadastrado (Parametrização), numa dada Germinação final — MODELO NOVO pro modo Covas,
 * onde a Densidade não serve de referência (ela funciona bem só pra "A Lanço"): a cultivar tem um teto
 * físico de plântulas por cova (competição dentro do buraco), então mira ESSE número direto, não um
 * alvo derivado da Densidade. Null sem Máx. cadastrado (cai no modelo antigo, ver sementesCovaAtual) ou
 * sem Germinação (VC/teste, Sobrevivência, Fatores).
 */
function sementesPorCovaAlvo(laudo: ArquivoLaudo, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicaoValor: number): number | null {
  const maxPlantulasCova = resolverMaxPlantulasCova(laudo.nomeProduto, produtos);
  if (maxPlantulasCova === null || maxPlantulasCova <= 0) return null;
  const germinacaoFinal = germinacaoFinalSemeadura(laudo, produtos, fatorModo, fatorCondicaoValor);
  return germinacaoFinal !== null && germinacaoFinal > 0 ? (maxPlantulasCova * 100) / germinacaoFinal : null;
}

// % de desconto na Sementes/cova por cm que a Distância na linha fica abaixo da distância ideal do
// produto (ver distanciaIdealProduto) — evita superdimensionar a cova em espaçamentos mais densos.
const TAXA_DESCONTO_SEMENTES_POR_CM = 1;
// Teto do desconto — por mais que a cova aperte, nunca desconta mais que isso (piso de segurança pra
// nunca jogar menos que 60% do volume padrão, mesmo com covas coladas).
const DESCONTO_MAXIMO_SEMENTES = 40;

/** Distância (cm) que o produto teria no espaçamento padrão (grade quadrada no Covas/m² alvo, ver covasM2Alvo) — referência de "0% de desconto" pra sementesComDescontoPorDistancia. Valor EXATO (sem arredondar pro centímetro fechado, diferente de corredorPadrao), pra a curva de desconto ficar contínua. */
function distanciaIdealProduto(laudo: Pick<ArquivoLaudo, 'nomeProduto'>, produtos: ProdutoParametrizacao[]): number {
  return Math.sqrt(10000 / covasM2Alvo(laudo, produtos));
}

/**
 * Desconta a Sementes/cova padrão quando a Distância na linha fica mais apertada que a distância ideal
 * do produto — 1%/cm abaixo do ideal (nunca desconta se estiver igual ou mais aberta), até um teto de
 * 40%: por mais que a cova aperte, nunca joga menos que 60% do volume padrão.
 */
function sementesComDescontoPorDistancia(sementesPadrao: number, distanciaAtual: number, distanciaIdeal: number): number {
  if (distanciaAtual >= distanciaIdeal) return sementesPadrao;
  const desconto = Math.min(DESCONTO_MAXIMO_SEMENTES, (distanciaIdeal - distanciaAtual) * TAXA_DESCONTO_SEMENTES_POR_CM);
  return sementesPadrao * (1 - desconto / 100);
}

/**
 * Sementes/cova (equivalente, sempre em sementes) que o card usa AGORA — TRAVADA, nunca digitada
 * manualmente: o sistema sempre traz a quantidade ideal parametrizada (Máx. de plântulas/cova cadastrado
 * — ver sementesPorCovaAlvo —, ou o modelo antigo por Densidade), já descontada se a Distância na linha
 * (derivada do Corredor, ver distanciaAtual) ficou mais apertada que o ideal do produto (ver
 * sementesComDescontoPorDistancia). O operador só ajusta o Corredor. Fica null quando falta algum dado
 * (Máx./Densidade, Germinação) ou a Distância não dá pra calcular.
 */
function sementesCovaAtual(laudo: ArquivoLaudo, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicaoValor: number, distanciaAtual: number | null): number | null {
  let sementesCova = sementesPorCovaAlvo(laudo, produtos, fatorModo, fatorCondicaoValor);
  if (sementesCova === null) {
    const sementesPorM2 = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicaoValor);
    sementesCova = calcularSementesPorCova(sementesPorM2, covasM2Alvo(laudo, produtos));
  }
  if (sementesCova === null || distanciaAtual === null) return sementesCova;
  return sementesComDescontoPorDistancia(sementesCova, distanciaAtual, distanciaIdealProduto(laudo, produtos));
}

/** Igual sementesCovaAtual, já formatado pra exibir — "Sementes/cova" (inteiro) ou "Peso/cova (g)" (Tradicional, via PMS), conforme o Processo do laudo (ver precisaPesoPorCova). '' quando falta algum dado. */
function formatarSementesCovaAtual(laudo: ArquivoLaudo, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicaoValor: number, distanciaAtual: number | null): string {
  const sementesCova = sementesCovaAtual(laudo, produtos, fatorModo, fatorCondicaoValor, distanciaAtual);
  if (sementesCova === null) return '';
  if (!precisaPesoPorCova(laudo)) return String(Math.round(sementesCova));
  const pms = pmsNumericoDoLaudo(laudo, produtos);
  return pms !== null && pms > 0 ? formatarCovas((sementesCova * pms) / 1000) : '';
}

/**
 * kg/ha a partir de Covas/m² × Sementes/cova (equivalente) × PMS — a conta "de verdade" em modo Covas,
 * usada tanto pro card (com a Sementes/cova atual, ver sementesCovaAtual) quanto pra comparação entre
 * condições (com a Sementes/cova alvo de cada uma, ver sementesPorCovaAlvo) — nunca pela Densidade
 * sozinha, que em Covas só serve de estimativa de fallback.
 */
function kgPorHaDeSementesCova(covasPorM2: number | null, sementesCova: number | null, pms: number | null): number | null {
  return covasPorM2 !== null && sementesCova !== null && pms !== null && pms > 0 ? (covasPorM2 * sementesCova * pms) / 100 : null;
}

/**
 * Covas/m² TRAVADO — não é editável de jeito nenhum, é sempre esse valor (nunca mais nem menos):
 * prioriza o Máx. cadastrado (Parametrização); sem isso, cai no cálculo antigo (Densidade ÷ Máx. de
 * plântulas/cova); sem nenhum dos dois, 4 (equivalente ao 50×50 de sempre). Único grau de liberdade que
 * sobra pro operador é o Corredor — Distância é sempre derivada dele pra manter esse valor fixo (ver
 * distanciaDerivada). Sempre positivo (nunca null), pra sempre existir um espaçamento válido.
 */
function covasM2Alvo(laudo: Pick<ArquivoLaudo, 'nomeProduto'>, produtos: ProdutoParametrizacao[]): number {
  const maxCovasM2 = resolverMaxCovasM2(laudo.nomeProduto, produtos);
  if (maxCovasM2 !== null && maxCovasM2 > 0) return maxCovasM2;
  const densidade = resolverDensidadeBase(laudo.nomeProduto, produtos);
  const maxPlantulasCova = resolverMaxPlantulasCova(laudo.nomeProduto, produtos);
  if (densidade !== null && densidade > 0 && maxPlantulasCova !== null && maxPlantulasCova > 0) {
    const covasPorM2 = densidade / maxPlantulasCova;
    if (covasPorM2 > 0) return covasPorM2;
  }
  return 4;
}

/** Corredor padrão (cm) ao adicionar o produto — grade quadrada (lado = √(10000 ÷ Covas/m² alvo)), arredondado pra cima. Só o PONTO DE PARTIDA — o operador ajusta o Corredor livremente depois, Distância acompanha sozinha (ver distanciaDerivada). */
function corredorPadrao(laudo: Pick<ArquivoLaudo, 'nomeProduto'>, produtos: ProdutoParametrizacao[]): string {
  const lado = Math.ceil(Math.sqrt(10000 / covasM2Alvo(laudo, produtos)));
  return String(lado > 0 ? lado : 50);
}

/** Distância (cm) — SEMPRE derivada do Corredor pra manter o Covas/m² travado (ver covasM2Alvo): Distância = 10000 ÷ (Corredor × Covas/m² alvo). Nunca editável, nunca guardada — impossível o espaçamento "descolar" do alvo parametrizado. Null com Corredor inválido. */
function distanciaDerivada(laudo: Pick<ArquivoLaudo, 'nomeProduto'>, corredorTexto: string, produtos: ProdutoParametrizacao[]): number | null {
  const corredor = paraNumero(corredorTexto);
  if (corredor === null || corredor <= 0) return null;
  return 10000 / (corredor * covasM2Alvo(laudo, produtos));
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

  const fatorCondicao = fatorDe(fatores, condicao);

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
  // por nome de produto, só pra exibir os lotes juntos.
  const gruposFiltrados = useMemo(() => {
    const termo = normalizarNome(busca);
    if (!termo) return [];
    const porNome = new Map<string, { nome: string; laudos: ArquivoLaudo[] }>();
    for (const a of arquivos) {
      if (!normalizarNome(a.nomeProduto).includes(termo)) continue;
      const chave = normalizarNome(a.nomeProduto);
      if (!porNome.has(chave)) porNome.set(chave, { nome: a.nomeProduto, laudos: [] });
      porNome.get(chave)!.laudos.push(a);
    }
    return [...porNome.values()]
      .map((grupo) => ({ ...grupo, laudos: grupo.laudos.sort((a, b) => validadeParaOrdenacao(b.validade) - validadeParaOrdenacao(a.validade)) }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .slice(0, 6);
  }, [arquivos, busca]);

  function selecionar(a: ArquivoLaudo) {
    setItens((prev) => {
      if (prev.some((it) => it.laudoId === a.id)) return prev;
      // Modo padrão vem da Parametrização (Cova ou Lanço, cadastrado por
      // grupo) — só o ponto de partida do item, o operador ainda troca à
      // vontade depois de adicionado (pills "A Lanço"/"Covas" no card).
      const modoPadrao: Modo = resolverModoPlantio(a.nomeProduto, produtos) === 'cova' ? 'linha_cova' : 'lanco';
      return [
        ...prev,
        {
          laudoId: a.id,
          // Começa em 1 ha (não zerado) — só pra já sair mostrando os
          // totais calculados; o operador ajusta a área de verdade em
          // seguida.
          area: '1',
          modo: modoPadrao,
          // Ponto de partida do Corredor (ver corredorPadrao) — Distância nunca é guardada, é sempre
          // derivada dele pra manter o Covas/m² travado no alvo parametrizado (ver distanciaDerivada).
          corredor: corredorPadrao(a, produtos),
        },
      ];
    });
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

  /** Corredor é o único campo editável do espaçamento — Distância acompanha sozinha (derivada, ver distanciaDerivada) pra manter o Covas/m² sempre travado no alvo parametrizado; impossível o espaçamento fugir dele. */
  function atualizarCorredor(item: ItemGuia, valorTexto: string) {
    atualizarItem(item.laudoId, { corredor: valorTexto });
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
    const fatorCondicaoItem = fatorCondicao;
    const covasPorM2 = item.modo === 'linha_cova' ? covasM2Alvo(laudo, produtos) : null;
    let kgPorHa: number | null;
    let sementesPorM2: number | null;
    if (item.modo === 'linha_cova') {
      // Em Covas, kg/ha vem do Covas/m² travado e da Sementes/cova travada (Covas/m² × Sementes/cova ×
      // PMS) — nunca só da Densidade (que funciona bem pra "A Lanço", mas em Covas o espaçamento pode
      // não bater a Densidade cadastrada de propósito, ver Máx./cova e Covas/m² na Parametrização).
      const distanciaAtual = distanciaDerivada(laudo, item.corredor, produtos);
      const sementesCova = sementesCovaAtual(laudo, produtos, fatorModo, fatorCondicaoItem, distanciaAtual);
      sementesPorM2 = covasPorM2 !== null && sementesCova !== null ? covasPorM2 * sementesCova : null;
      kgPorHa = kgPorHaDeSementesCova(covasPorM2, sementesCova, pmsNumericoDoLaudo(laudo, produtos));
    } else {
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
    const margemTolerancia = resolverMargemTolerancia(laudo.nomeProduto, produtos);
    const sacos = pesoTotal !== null && pesoSaco !== null && pesoSaco > 0 ? arredondarSacos(pesoTotal / pesoSaco, margemTolerancia / 100) : null;
    // Peso total REAL (o que efetivamente se compra/pesa) = sacos (arredondados) × peso do saco — diferente do
    // "Total previsto/necessário" (teórico, continuo) porque só dá pra comprar saco inteiro.
    const pesoTotalReal = sacos !== null && pesoSaco !== null ? sacos * pesoSaco : null;
    return { kgPorHa, pesoTotal, pesoTotalReal, pesoSaco, sacos, sementesPorM2, covasPorM2 };
  }

  /**
   * Taxa de Semeadura (kg/ha) nas outras 2 condições (não a selecionada agora) — só informativo, pra
   * comparar sem precisar trocar a condição global. Em Covas, usa o Covas/m² travado (fixo, não muda
   * com a condição) com a Sementes/cova ALVO de cada condição (ver sementesPorCovaAlvo), consistente com
   * o que calcularResultado mostra pra condição selecionada.
   */
  function kgPorHaOutrasCondicoes(laudo: ArquivoLaudo, item: ItemGuia): { rotulo: string; kgPorHa: number | null }[] {
    const fatorModo = fatorDe(fatores, item.modo);
    if (item.modo !== 'linha_cova') {
      return OPCOES_CONDICAO.filter((o) => o.valor !== condicao).map((o) => ({
        rotulo: o.rotulo,
        kgPorHa: calcularKgPorHectareNumero(laudo, produtos, fatorModo, fatorDe(fatores, o.valor)),
      }));
    }
    const covasPorM2 = covasM2Alvo(laudo, produtos);
    const pms = pmsNumericoDoLaudo(laudo, produtos);
    const distanciaAtual = distanciaDerivada(laudo, item.corredor, produtos);
    return OPCOES_CONDICAO.filter((o) => o.valor !== condicao).map((o) => {
      const fatorCondicaoAlt = fatorDe(fatores, o.valor);
      const sementesCova = sementesCovaAtual(laudo, produtos, fatorModo, fatorCondicaoAlt, distanciaAtual);
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
      const distanciaItem = item.modo === 'linha_cova' ? distanciaDerivada(laudo, item.corredor, produtos) : null;
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
              ? `${distanciaItem === null ? '—' : formatarCovas(distanciaItem)}×${item.corredor || '—'} cm`
              : null,
          sementesPorCovaLabel: item.modo === 'linha_cova' ? (precisaPesoPorCova(laudo) ? 'Peso/cova (g)' : 'Sementes/cova') : null,
          sementesPorCovaValor:
            item.modo === 'linha_cova'
              ? formatarSementesCovaAtual(laudo, produtos, fatorDe(fatores, item.modo), fatorCondicao, distanciaItem) || '—'
              : null,
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
                      Lote {a.lote ?? '—'} · Val. {a.validade ?? '—'}
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
                    item.modo === 'linha_cova'
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
                      const distancia = distanciaDerivada(laudo, item.corredor, produtos);
                      return (
                        <div className="flex flex-col gap-1.5 border-l border-[var(--color-line)] p-2.5">
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <p className="text-[10px] text-[var(--color-text-soft)]">Distância (cm)</p>
                              <p
                                title="Travada — sempre derivada do Corredor pra manter o Covas/m² no alvo parametrizado"
                                className="border border-transparent px-1.5 py-1 text-xs font-medium text-[var(--color-text)]"
                              >
                                {distancia === null ? '—' : formatarCovas(distancia)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-[var(--color-text-soft)]">Corredor (cm)</p>
                              <input
                                value={item.corredor}
                                onChange={(e) => atualizarCorredor(item, e.target.value)}
                                inputMode="decimal"
                                title="Único campo editável do espaçamento — Distância acompanha sozinha pra manter o Covas/m² travado"
                                className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)]"
                              />
                            </div>
                            <div>
                              <p className="text-[10px] text-[var(--color-text-soft)]">{pesoPorCova ? 'Peso/cova (g)' : 'Sementes/cova'}</p>
                              <p
                                title="Travada — quantidade ideal parametrizada pra Condição/Modo atuais, descontada se a Distância ficou mais apertada que o ideal do produto (1%/cm abaixo do ideal, até 40% de desconto)"
                                className="border border-transparent px-1.5 py-1 text-xs font-medium text-[var(--color-text)]"
                              >
                                {formatarSementesCovaAtual(laudo, produtos, fatorDe(fatores, item.modo), fatorCondicao, distancia) || '—'}
                              </p>
                              {semPmsParaPeso && <p className="mt-0.5 text-[9px] text-bad">Sem PMS cadastrado</p>}
                            </div>
                            <div>
                              <p className="text-[10px] text-[var(--color-text-soft)]">Covas/m²</p>
                              <p title="Travado — sempre o alvo parametrizado" className="border border-transparent px-1.5 py-1 text-xs font-medium text-[var(--color-text)]">
                                {r.covasPorM2 === null ? '—' : formatarCovas(r.covasPorM2)}
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
