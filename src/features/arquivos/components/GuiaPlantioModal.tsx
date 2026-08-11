import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Produto } from '@/features/pricing/types';
import { calcularCovasPorM2, calcularKgPorHectareNumero, calcularSementesPorCova, calcularSementesPorM2 } from '../calculoSemeadura';
import { gerarGuiaPlantioPdf } from '../guiaPlantioPdf';
import { calcularVC, paraNumero } from '../metricas';
import { encontrarProdutoPreco, normalizarNome, resolverMargemTolerancia, resolverModoPlantio, resolverPmsBaseTexto } from '../parametrizacaoProdutos';
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
/** Qual dos 2 espaçamentos (Cova, Corredor) NÃO foi editado por último — esse é recalculado a cada edição. */
type CampoEspacamento = 'cova' | 'corredor';

interface ItemGuia {
  laudoId: string;
  area: string;
  /** Modo de plantio — individual por item (produtos diferentes na mesma pilha podem ter modos diferentes). */
  modo: Modo;
  /** Só usados quando modo === 'linha_cova'. Cova (cm) e Corredor (cm) são ligados: fixados o alvo de
   * sementes/m² e a Sementes/cova (digitada manualmente, nunca automática), sobra 1 grau de liberdade —
   * editar um dos 2 espaçamentos recalcula o outro sozinho. */
  cova: string;
  corredor: string;
  /** Sempre manual — nunca recalculado sozinho. Só aceita número inteiro ≥ 1; enquanto inválido, os espaçamentos ficam bloqueados. */
  sementesCova: string;
  /** Qual dos 2 espaçamentos foi editado por último — o outro é recalculado. */
  ultimoCampoEspacamento: CampoEspacamento;
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

/** Sementes/cova é sempre digitada manualmente — só é válida como número inteiro ≥ 1 (sem casas decimais). Enquanto inválida, os espaçamentos ficam bloqueados. */
function sementesCovaValida(valorTexto: string): number | null {
  const n = paraNumero(valorTexto);
  return n !== null && n >= 1 && Number.isInteger(n) ? n : null;
}

/**
 * Recalcula o espaçamento (Cova ou Corredor) que NÃO foi editado por último,
 * a partir do alvo de Sementes/m² e da Sementes/cova (digitada manualmente,
 * fixa) — editar um dos 2 espaçamentos recalcula o outro sozinho, mantendo
 * Cova × Corredor constante. Usado tanto ao editar Cova/Corredor quanto
 * quando o alvo muda sozinho (condição, modo ou a própria Sementes/cova).
 * Os espaçamentos automáticos sempre saem em número inteiro (cm).
 */
function derivarEspacamento(sementesPorM2: number, sementesCova: number, item: Pick<ItemGuia, 'cova' | 'corredor' | 'ultimoCampoEspacamento'>): Partial<ItemGuia> | null {
  const produtoAlvo = (10000 * sementesCova) / sementesPorM2; // Cova × Corredor (cm²), fixo enquanto Sementes/cova e o alvo não mudarem
  if (item.ultimoCampoEspacamento === 'cova') {
    const cova = paraNumero(item.cova);
    if (cova === null || cova <= 0) return null;
    return { corredor: String(Math.round(produtoAlvo / cova)) };
  }
  const corredor = paraNumero(item.corredor);
  if (corredor === null || corredor <= 0) return null;
  return { cova: String(Math.round(produtoAlvo / corredor)) };
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

/**
 * Guia de Plantio — busca ancorada direto nos laudos (não mais na Tabela de
 * Preço): o operador digita uma palavra-chave, o sistema filtra os laudos
 * cujo nome bate e agrupa por nome de produto. Escolher um lote empilha um
 * resultado, cada um com sua própria área — dá pra montar o plano de plantio
 * de vários produtos diferentes na mesma sessão, um "x" no canto tira um
 * resultado da pilha sem mexer nos outros.
 *
 * Referência do cálculo é sempre a Densidade (Parametrização de Produtos):
 * Sementes/m² = Densidade ÷ Germinação final (VC%/teste × Sobrevivência% ×
 * Fatores de Modo/Condição) — não depende de PMS nem de área. PMS só entra
 * DEPOIS, pra converter Sementes/m² em kg/ha (peso). Sem PMS, kg/ha, Peso e
 * Sacos ficam pendentes, mas Sementes/m²/cova continuam saindo.
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
      const fatorModo = fatorDe(fatores, modoPadrao);
      const sementesPorM2Inicial = calcularSementesPorM2(a, produtos, fatorModo, fatorCondicao);
      const covasPorM2Inicial = calcularCovasPorM2(50, 50);
      const sementesCovaInicial = calcularSementesPorCova(sementesPorM2Inicial, covasPorM2Inicial);
      return [
        ...prev,
        {
          laudoId: a.id,
          // Começa em 1 ha (não zerado) — só pra já sair mostrando os
          // totais calculados; o operador ajusta a área de verdade em
          // seguida.
          area: '1',
          modo: modoPadrao,
          cova: '50',
          corredor: '50',
          sementesCova: sementesCovaInicial === null ? '' : String(Math.round(sementesCovaInicial)),
          ultimoCampoEspacamento: 'corredor',
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
   * Cova (cm) e Corredor (cm) são ligados: fixados o alvo de Sementes/m² e a
   * Sementes/cova (sempre digitada manualmente), sobra 1 grau de liberdade —
   * editar um dos 2 espaçamentos recalcula o outro sozinho.
   */
  function atualizarEspacamento(laudo: ArquivoLaudo, item: ItemGuia, campo: CampoEspacamento, valorTexto: string) {
    const patch: Partial<ItemGuia> = { [campo]: valorTexto, ultimoCampoEspacamento: campo };
    const sementesCova = sementesCovaValida(item.sementesCova);
    if (sementesCova !== null) {
      const fatorModo = fatorDe(fatores, item.modo);
      const fatorCondicaoItem = fatorCondicao;
      const sementesPorM2 = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicaoItem);
      if (sementesPorM2 !== null && sementesPorM2 > 0) {
        const itemAtualizado = { ...item, [campo]: valorTexto, ultimoCampoEspacamento: campo };
        const derivadoPatch = derivarEspacamento(sementesPorM2, sementesCova, itemAtualizado);
        if (derivadoPatch) Object.assign(patch, derivadoPatch);
      }
    }
    atualizarItem(item.laudoId, patch);
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

  /** Sementes/cova é sempre manual — nunca recalculada sozinha; só dispara o recálculo do espaçamento que já estava "de fora". Só aceita dígitos (número inteiro). */
  function atualizarSementesCova(laudo: ArquivoLaudo, item: ItemGuia, valorTexto: string) {
    const valorLimpo = valorTexto.replace(/\D/g, '');
    const patch: Partial<ItemGuia> = { sementesCova: valorLimpo };
    const sementesCova = sementesCovaValida(valorLimpo);
    if (sementesCova !== null) {
      const fatorModo = fatorDe(fatores, item.modo);
      const fatorCondicaoItem = fatorCondicao;
      const sementesPorM2 = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicaoItem);
      if (sementesPorM2 !== null && sementesPorM2 > 0) {
        const derivadoPatch = derivarEspacamento(sementesPorM2, sementesCova, item);
        if (derivadoPatch) Object.assign(patch, derivadoPatch);
      }
    }
    atualizarItem(item.laudoId, patch);
  }

  /** Trocar o modo (A Lanço ⇄ Covas) também muda o alvo de Sementes/m² (fator de perda diferente) — recalcula o espaçamento derivado na hora, junto com a troca. */
  function mudarModo(laudo: ArquivoLaudo, item: ItemGuia, modo: Modo) {
    const patch: Partial<ItemGuia> = { modo };
    const sementesCova = sementesCovaValida(item.sementesCova);
    if (modo === 'linha_cova' && sementesCova !== null) {
      const fatorModo = fatorDe(fatores, modo);
      const fatorCondicaoItem = fatorCondicao;
      const sementesPorM2 = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicaoItem);
      if (sementesPorM2 !== null && sementesPorM2 > 0) {
        const derivadoPatch = derivarEspacamento(sementesPorM2, sementesCova, item);
        if (derivadoPatch) Object.assign(patch, derivadoPatch);
      }
    }
    atualizarItem(item.laudoId, patch);
  }

  // A condição de plantio (agora só global, no cabeçalho) muda o fator de
  // perda e, com ele, o alvo de Sementes/m² — sem isso, o espaçamento
  // derivado ficaria com o valor antigo até o operador tocar nele de novo.
  useEffect(() => {
    setItens((prev) => {
      let mudou = false;
      const proximos = prev.map((item) => {
        if (item.modo !== 'linha_cova') return item;
        const sementesCova = sementesCovaValida(item.sementesCova);
        if (sementesCova === null) return item;
        const laudo = arquivos.find((a) => a.id === item.laudoId);
        if (!laudo) return item;
        const fatorModo = fatorDe(fatores, item.modo);
        const sementesPorM2 = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicao);
        if (sementesPorM2 === null || sementesPorM2 <= 0) return item;
        const patch = derivarEspacamento(sementesPorM2, sementesCova, item);
        if (!patch) return item;
        const chave = Object.keys(patch)[0] as keyof ItemGuia;
        if (patch[chave] === item[chave]) return item;
        mudou = true;
        return { ...item, ...patch };
      });
      return mudou ? proximos : prev;
    });
  }, [fatorCondicao, fatores, produtos, arquivos]);

  function fecharTudo() {
    setBusca('');
    setItens([]);
    onFechar();
  }

  function calcularResultado(laudo: ArquivoLaudo, item: ItemGuia) {
    const fatorModo = fatorDe(fatores, item.modo);
    const fatorCondicaoItem = fatorCondicao;
    const kgPorHa = calcularKgPorHectareNumero(laudo, produtos, fatorModo, fatorCondicaoItem);
    const sementesPorM2 = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicaoItem);
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
    const covasPorM2 = item.modo === 'linha_cova' ? calcularCovasPorM2(paraNumero(item.cova), paraNumero(item.corredor)) : null;
    const sementesPorCova = calcularSementesPorCova(sementesPorM2, covasPorM2);
    return { kgPorHa, pesoTotal, pesoTotalReal, pesoSaco, sacos, sementesPorCova, sementesPorM2, covasPorM2 };
  }

  /** Taxa de Semeadura (kg/ha) nas outras 2 condições (não a selecionada agora) — só informativo, pra comparar sem precisar trocar a condição global. */
  function kgPorHaOutrasCondicoes(laudo: ArquivoLaudo, item: ItemGuia): { rotulo: string; kgPorHa: number | null }[] {
    const fatorModo = fatorDe(fatores, item.modo);
    return OPCOES_CONDICAO.filter((o) => o.valor !== condicao).map((o) => ({
      rotulo: o.rotulo,
      kgPorHa: calcularKgPorHectareNumero(laudo, produtos, fatorModo, fatorDe(fatores, o.valor)),
    }));
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
          sementesPorCova: item.modo === 'linha_cova' ? (r.sementesPorCova === null ? '—' : String(Math.round(r.sementesPorCova))) : null,
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
                      onClick={() => mudarModo(laudo, item, o.valor)}
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
                      const espacamentoBloqueado = sementesCovaValida(item.sementesCova) === null;
                      return (
                        <div className="flex flex-col gap-1.5 border-l border-[var(--color-line)] p-2.5">
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <p className="text-[10px] text-[var(--color-text-soft)]">Distância (cm)</p>
                              <input
                                value={item.cova}
                                onChange={(e) => atualizarEspacamento(laudo, item, 'cova', e.target.value)}
                                disabled={espacamentoBloqueado}
                                inputMode="decimal"
                                title={espacamentoBloqueado ? 'Informe a quantidade de sementes por cova (número inteiro ≥ 1) pra liberar o espaçamento' : 'Ligado com Corredor — editar um recalcula o outro'}
                                className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                              />
                            </div>
                            <div>
                              <p className="text-[10px] text-[var(--color-text-soft)]">Corredor (cm)</p>
                              <input
                                value={item.corredor}
                                onChange={(e) => atualizarEspacamento(laudo, item, 'corredor', e.target.value)}
                                disabled={espacamentoBloqueado}
                                inputMode="decimal"
                                title={espacamentoBloqueado ? 'Informe a quantidade de sementes por cova (número inteiro ≥ 1) pra liberar o espaçamento' : 'Ligado com Cova — editar um recalcula o outro'}
                                className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                              />
                            </div>
                            <div>
                              <p className="text-[10px] text-[var(--color-text-soft)]">Sementes/cova</p>
                              <input
                                value={item.sementesCova}
                                onChange={(e) => atualizarSementesCova(laudo, item, e.target.value)}
                                inputMode="numeric"
                                title="Quantidade de sementes por cova (número inteiro ≥ 1) — sempre digitada manualmente; os espaçamentos se ajustam sozinhos"
                                className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)]"
                              />
                            </div>
                            <div>
                              <p className="text-[10px] text-[var(--color-text-soft)]">Covas/m²</p>
                              <p className="border border-transparent px-1.5 py-1 text-xs font-medium text-[var(--color-text)]">
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
                              Sem PMS cadastrado — Taxa e Total ficam pendentes; sementes seguem calculadas por Densidade e Germinação.
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
