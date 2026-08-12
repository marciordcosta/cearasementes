import { RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Produto } from '@/features/pricing/types';
import { calcularCovasPorM2, calcularKgPorHectareNumero, calcularSementesPorCova, calcularSementesPorM2, germinacaoFinalSemeadura } from '../calculoSemeadura';
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
type CampoEspacamento = 'cova' | 'corredor';

interface ItemGuia {
  laudoId: string;
  area: string;
  /** Modo de plantio — individual por item (produtos diferentes na mesma pilha podem ter modos diferentes). */
  modo: Modo;
  /**
   * Só usados quando modo === 'linha_cova'. Cova (cm) e Corredor (cm) são 2 campos INDEPENDENTES —
   * editar um NÃO recalcula o outro; o único limite automático é o Covas/m² máximo cadastrado
   * (Parametrização), se houver — nunca deixa passar dele, ver limitarCovasM2.
   */
  cova: string;
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

/**
 * Sementes/cova (equivalente, sempre em sementes) que o card usa AGORA, no espaçamento atual do item —
 * TRAVADA, nunca digitada manualmente: o sistema sempre traz a quantidade ideal parametrizada, o
 * operador só ajusta o espaçamento (Distância/Corredor). Prioriza o Máx. de plântulas/cova cadastrado
 * (ver sementesPorCovaAlvo — não depende do espaçamento); sem esse cadastro, cai no modelo antigo
 * (deriva de Densidade, no espaçamento atual). Fica null quando falta algum dado (Máx./Densidade,
 * Germinação).
 */
function sementesCovaAtual(laudo: ArquivoLaudo, item: Pick<ItemGuia, 'cova' | 'corredor'>, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicaoValor: number): number | null {
  const sementesCova = sementesPorCovaAlvo(laudo, produtos, fatorModo, fatorCondicaoValor);
  if (sementesCova !== null) return sementesCova;
  const sementesPorM2 = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicaoValor);
  const covasPorM2 = calcularCovasPorM2(paraNumero(item.cova), paraNumero(item.corredor));
  return calcularSementesPorCova(sementesPorM2, covasPorM2);
}

/** Igual sementesCovaAtual, já formatado pra exibir — "Sementes/cova" (inteiro) ou "Peso/cova (g)" (Tradicional, via PMS), conforme o Processo do laudo (ver precisaPesoPorCova). '' quando falta algum dado. */
function formatarSementesCovaAtual(laudo: ArquivoLaudo, item: Pick<ItemGuia, 'cova' | 'corredor'>, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicaoValor: number): string {
  const sementesCova = sementesCovaAtual(laudo, item, produtos, fatorModo, fatorCondicaoValor);
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
 * Espaçamento padrão (Cova × Corredor, em grade quadrada) ao adicionar um produto em modo Covas —
 * prioriza o Covas/m² MÁXIMO cadastrado (Parametrização) direto: gêneros diferentes toleram uma
 * densidade de covas bem diferente (competição entre covas vizinhas), então esse número já é o
 * espaçamento certo, sem depender da Densidade. Sem isso cadastrado, cai no cálculo antigo (Densidade ÷
 * Máx. de plântulas/cova); sem nenhum dos dois, cai no 50×50 de sempre. Lado arredondado sempre pra
 * CIMA (nunca pra baixo) — garante que o Covas/m² real nunca ultrapassa o máximo, mesmo com a perda de
 * precisão do arredondamento pro centímetro fechado (arredondar pra baixo poderia deixar passar do
 * limite). Só o PONTO DE PARTIDA muda — o operador segue livre pra ajustar Cova/Corredor manualmente
 * depois (sem nunca poder passar do Covas/m² máximo, ver atualizarEspacamento); Sementes/cova é travada
 * e sempre recalculada ao vivo pro espaçamento atual (ver sementesCovaAtual), nunca guardada.
 */
function calcularEspacamentoPadrao(laudo: Pick<ArquivoLaudo, 'nomeProduto'>, produtos: ProdutoParametrizacao[]): { cova: string; corredor: string } {
  const padrao = { cova: '50', corredor: '50' };
  const maxCovasM2 = resolverMaxCovasM2(laudo.nomeProduto, produtos);
  if (maxCovasM2 !== null && maxCovasM2 > 0) {
    const ladoCm = Math.ceil(Math.sqrt(10000 / maxCovasM2));
    if (ladoCm > 0) return { cova: String(ladoCm), corredor: String(ladoCm) };
  }
  const densidade = resolverDensidadeBase(laudo.nomeProduto, produtos);
  const maxPlantulasCova = resolverMaxPlantulasCova(laudo.nomeProduto, produtos);
  if (densidade === null || densidade <= 0 || maxPlantulasCova === null || maxPlantulasCova <= 0) return padrao;
  const covasPorM2 = densidade / maxPlantulasCova;
  if (covasPorM2 <= 0) return padrao;
  const ladoCm = Math.ceil(Math.sqrt(10000 / covasPorM2));
  return ladoCm > 0 ? { cova: String(ladoCm), corredor: String(ladoCm) } : padrao;
}

/**
 * Trava o Covas/m² no Máx. cadastrado (Parametrização) — nunca deixa passar do limite (competição entre
 * covas vizinhas), pode só ficar menor. É o ÚNICO ajuste automático que existe em Cova/Corredor (ver
 * atualizarEspacamento) — vale sempre que o produto tiver Covas/m² máximo cadastrado, independente de
 * ter ou não Máx. de plântulas/cova (são 2 cadastros independentes). Ajusta `campoAjustavel` (o campo
 * que não acabou de ser digitado) pra trazer o produto Cova×Corredor de volta ao mínimo permitido —
 * nunca mexe no valor que o operador acabou de digitar.
 */
function limitarCovasM2(
  laudo: ArquivoLaudo,
  produtos: ProdutoParametrizacao[],
  item: Pick<ItemGuia, 'cova' | 'corredor'>,
  patch: Partial<ItemGuia>,
  campoAjustavel: CampoEspacamento,
): void {
  const maxCovasM2 = resolverMaxCovasM2(laudo.nomeProduto, produtos);
  if (maxCovasM2 === null || maxCovasM2 <= 0) return;
  const cova = paraNumero(patch.cova ?? item.cova);
  const corredor = paraNumero(patch.corredor ?? item.corredor);
  if (cova === null || cova <= 0 || corredor === null || corredor <= 0) return;
  if (10000 / (cova * corredor) <= maxCovasM2) return;
  const fixo = campoAjustavel === 'corredor' ? cova : corredor;
  // Arredonda pra CIMA — garante que o produto final não fica menor que o mínimo permitido (arredondar
  // pra baixo poderia, por causa do centímetro fechado, deixar passar do limite de novo).
  patch[campoAjustavel] = String(Math.ceil(10000 / (maxCovasM2 * fixo)));
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
 * e o espaçamento vem do Covas/m² (ver calcularEspacamentoPadrao); a
 * densidade final (Covas/m² × Máx./cova) é uma CONSEQUÊNCIA, pode ficar
 * abaixo da Densidade cadastrada de propósito. Sem esses 2 campos
 * cadastrados, Covas cai no cálculo antigo (via Densidade, igual A Lanço).
 * Em qualquer caso, PMS só entra DEPOIS, pra converter Sementes/m² em kg/ha
 * (peso); sem PMS, kg/ha, Peso e Sacos ficam pendentes, mas Sementes/m²/cova
 * continuam saindo.
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
      // Espaçamento de partida: 50×50 (4 covas/m²), ou o que o Covas/m² máximo cadastrado exigir (ver
      // calcularEspacamentoPadrao) — Sementes/cova (ou Peso/cova) não é guardado, é sempre recalculado ao
      // vivo pro espaçamento atual (ver sementesCovaAtual).
      const { cova, corredor } = calcularEspacamentoPadrao(a, produtos);
      return [
        ...prev,
        {
          laudoId: a.id,
          // Começa em 1 ha (não zerado) — só pra já sair mostrando os
          // totais calculados; o operador ajusta a área de verdade em
          // seguida.
          area: '1',
          modo: modoPadrao,
          cova,
          corredor,
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

  /**
   * Cova e Corredor são 2 campos totalmente INDEPENDENTES entre si e de Sementes/cova — editar um nunca
   * recalcula o outro nem mexe na quantidade de sementes. O ÚNICO ajuste automático é o teto: se o
   * produto tiver Covas/m² máximo cadastrado (Parametrização) e o valor digitado ultrapassar esse
   * limite, o campo NÃO editado agora sobe sozinho o suficiente pra voltar exatamente a ele (ver
   * limitarCovasM2) — nunca mexe no valor que acabou de ser digitado, e nunca aperta mais que o
   * necessário (pode ficar mais espaçado que o teto à vontade, só não mais apertado).
   */
  function atualizarEspacamento(laudo: ArquivoLaudo, item: ItemGuia, campo: CampoEspacamento, valorTexto: string) {
    const patch: Partial<ItemGuia> = { [campo]: valorTexto };
    const outroCampo: CampoEspacamento = campo === 'cova' ? 'corredor' : 'cova';
    limitarCovasM2(laudo, produtos, item, patch, outroCampo);
    atualizarItem(item.laudoId, patch);
  }

  /**
   * Volta Cova e Corredor pro ponto de partida — o mesmo cálculo de quando o produto foi adicionado (ver
   * calcularEspacamentoPadrao) — descartando qualquer ajuste manual (Sementes/cova acompanha sozinha,
   * já que é sempre recalculada ao vivo, nunca guardada). Escape hatch pra quando o espaçamento ficou
   * numa combinação confusa e o operador só quer recomeçar daquele item.
   */
  function restaurarEspacamento(laudo: ArquivoLaudo, item: ItemGuia) {
    atualizarItem(item.laudoId, calcularEspacamentoPadrao(laudo, produtos));
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
    const covasPorM2 = item.modo === 'linha_cova' ? calcularCovasPorM2(paraNumero(item.cova), paraNumero(item.corredor)) : null;
    let kgPorHa: number | null;
    let sementesPorM2: number | null;
    if (item.modo === 'linha_cova') {
      // Em Covas, kg/ha vem do espaçamento atual e da Sementes/cova travada (Covas/m² × Sementes/cova ×
      // PMS) — nunca só da Densidade (que funciona bem pra "A Lanço", mas em Covas o espaçamento pode
      // não bater a Densidade cadastrada de propósito, ver Máx./cova e Covas/m² na Parametrização).
      const sementesCova = sementesCovaAtual(laudo, item, produtos, fatorModo, fatorCondicaoItem);
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
   * comparar sem precisar trocar a condição global. Em Covas, usa o espaçamento ATUAL do card (fixo,
   * não muda com a condição — ver useEffect acima) com a Sementes/cova ALVO de cada condição (ver
   * sementesPorCovaAlvo), consistente com o que calcularResultado mostra pra condição selecionada.
   */
  function kgPorHaOutrasCondicoes(laudo: ArquivoLaudo, item: ItemGuia): { rotulo: string; kgPorHa: number | null }[] {
    const fatorModo = fatorDe(fatores, item.modo);
    if (item.modo !== 'linha_cova') {
      return OPCOES_CONDICAO.filter((o) => o.valor !== condicao).map((o) => ({
        rotulo: o.rotulo,
        kgPorHa: calcularKgPorHectareNumero(laudo, produtos, fatorModo, fatorDe(fatores, o.valor)),
      }));
    }
    const covasPorM2 = calcularCovasPorM2(paraNumero(item.cova), paraNumero(item.corredor));
    const pms = pmsNumericoDoLaudo(laudo, produtos);
    return OPCOES_CONDICAO.filter((o) => o.valor !== condicao).map((o) => {
      const fatorCondicaoAlt = fatorDe(fatores, o.valor);
      let sementesCova = sementesPorCovaAlvo(laudo, produtos, fatorModo, fatorCondicaoAlt);
      if (sementesCova === null) {
        const sementesPorM2Densidade = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicaoAlt);
        sementesCova = calcularSementesPorCova(sementesPorM2Densidade, covasPorM2);
      }
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
          espacamento: item.modo === 'linha_cova' ? `${item.cova || '—'}×${item.corredor || '—'} cm` : null,
          sementesPorCovaLabel: item.modo === 'linha_cova' ? (precisaPesoPorCova(laudo) ? 'Peso/cova (g)' : 'Sementes/cova') : null,
          sementesPorCovaValor:
            item.modo === 'linha_cova' ? formatarSementesCovaAtual(laudo, item, produtos, fatorDe(fatores, item.modo), fatorCondicao) || '—' : null,
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
                      // Covas/m² "ideal alcançável" — o mesmo valor que o espaçamento padrão (50×50 ou
                      // calcularEspacamentoPadrao) já entrega de cara, arredondado pro centímetro fechado
                      // (nunca dá pra bater o Máx./cova em cheio, só chegar perto). Abaixo disso é
                      // espaçamento mais aberto que o recomendado — às vezes de propósito (ponta de
                      // consorciação), mas o operador precisa notar que a densidade caiu.
                      const maxCovasM2 = resolverMaxCovasM2(laudo.nomeProduto, produtos);
                      const idealCovasM2 =
                        maxCovasM2 !== null && maxCovasM2 > 0
                          ? (() => {
                              const lado = Math.ceil(Math.sqrt(10000 / maxCovasM2));
                              return 10000 / (lado * lado);
                            })()
                          : null;
                      const abaixoDoIdeal = idealCovasM2 !== null && r.covasPorM2 !== null && r.covasPorM2 < idealCovasM2 - 1e-9;
                      return (
                        <div className="flex flex-col gap-1.5 border-l border-[var(--color-line)] p-2.5">
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <p className="text-[10px] text-[var(--color-text-soft)]">Distância (cm)</p>
                              <input
                                value={item.cova}
                                onChange={(e) => atualizarEspacamento(laudo, item, 'cova', e.target.value)}
                                inputMode="decimal"
                                title="Independente do Corredor — só ajusta sozinho se ultrapassar o Covas/m² máximo cadastrado"
                                className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)]"
                              />
                            </div>
                            <div>
                              <p className="text-[10px] text-[var(--color-text-soft)]">Corredor (cm)</p>
                              <input
                                value={item.corredor}
                                onChange={(e) => atualizarEspacamento(laudo, item, 'corredor', e.target.value)}
                                inputMode="decimal"
                                title="Independente da Distância — só ajusta sozinho se ultrapassar o Covas/m² máximo cadastrado"
                                className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)]"
                              />
                            </div>
                            <div>
                              <p className="text-[10px] text-[var(--color-text-soft)]">{pesoPorCova ? 'Peso/cova (g)' : 'Sementes/cova'}</p>
                              <p
                                title="Travada — sempre a quantidade ideal parametrizada pra Condição/Modo atuais; só o espaçamento é ajustável"
                                className="border border-transparent px-1.5 py-1 text-xs font-medium text-[var(--color-text)]"
                              >
                                {formatarSementesCovaAtual(laudo, item, produtos, fatorDe(fatores, item.modo), fatorCondicao) || '—'}
                              </p>
                              {semPmsParaPeso && <p className="mt-0.5 text-[9px] text-bad">Sem PMS cadastrado</p>}
                            </div>
                            <div>
                              <div className="flex items-center gap-1">
                                <p className="text-[10px] text-[var(--color-text-soft)]">Covas/m²</p>
                                <button
                                  type="button"
                                  onClick={() => restaurarEspacamento(laudo, item)}
                                  title="Restaurar espaçamento e Sementes/cova pra configuração inicial"
                                  className="text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
                                >
                                  <RotateCcw size={10} />
                                </button>
                              </div>
                              <p
                                title={abaixoDoIdeal ? `Espaçamento mais aberto que o recomendado — adensamento ideal seria ~${formatarCovas(idealCovasM2 as number)} covas/m²` : undefined}
                                className={`border border-transparent px-1.5 py-1 text-xs font-medium ${abaixoDoIdeal ? 'text-bad' : 'text-[var(--color-text)]'}`}
                              >
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
