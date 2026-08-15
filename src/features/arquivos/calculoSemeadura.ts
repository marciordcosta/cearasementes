import { derivarCultivar } from './etiqueta';
import { calcularVCNumero, paraNumero } from './metricas';
import {
  laudoCasaComNomePreco,
  normalizarNome,
  resolverDensidadeBase,
  resolverFatorCondicao,
  resolverIndiceSobrevivencia,
  resolverMargemTolerancia,
  resolverMaxPlantulasCova,
  resolverPmsBase,
  resolverPmsDoLaudo,
} from './parametrizacaoProdutos';
import { resultadoTesteNumero } from './testeGerminacao';
import type { ArquivoLaudo, FatorPlantio, ProdutoParametrizacao } from './types';

type LaudoParaSemeadura = Pick<
  ArquivoLaudo,
  'nomeProduto' | 'pms' | 'testeForma' | 'testePlantadas' | 'testeGerminadas' | 'testePesoPlantado' | 'pureza' | 'germinacao'
>;

/**
 * % "de germinação usada" na conta de semeadura — na prática, a taxa geral
 * de sucesso (sementes que viram planta estabelecida):
 *
 * - Teste de campo (o nosso, feito com frequência): já é medido na terra de
 *   verdade, então já reflete a sobrevivência real — usa direto, sem
 *   multiplicar mais nada por cima.
 * - Sem teste de campo: cai pro VC do laudo (Pureza × Germinação, medidos em
 *   laboratório) corrigido pelo Índice de Sobrevivência do produto — o
 *   laboratório não capta perdas de campo (seca, praga, forma de plantio),
 *   por isso a correção só entra aqui, nunca em cima do teste de campo.
 *   Sempre o LAUDO de verdade (o último lote) — nunca um valor genérico
 *   cadastrado por cima; sem Pureza/Germinação nesse laudo, fica sem
 *   calcular (mesma regra tanto no Guia interno quanto no Catálogo Online,
 *   é a mesma função).
 */
export function germinacaoParaSemeadura(a: LaudoParaSemeadura, produtos: ProdutoParametrizacao[]): number | null {
  const doTeste = resultadoTesteNumero(a, resolverPmsDoLaudo(a, produtos));
  if (doTeste !== null) return doTeste;
  const vc = calcularVCNumero(a);
  if (vc === null) return null;
  const sobrevivencia = resolverIndiceSobrevivencia(a.nomeProduto, produtos);
  return sobrevivencia === null ? vc : vc * sobrevivencia;
}

/**
 * Germinação final, em pontos percentuais — germinacaoParaSemeadura já
 * multiplicada pelos Fatores globais de Modo/Condição do Guia de Plantio.
 * Esses fatores vêm do Guia (escolhidos na hora, não são por produto) e
 * SEMPRE entram, mesmo quando há teste de campo: o teste mede a germinação
 * real, mas não sabe qual vai ser a forma de plantio da PRÓXIMA semeadura.
 */
export function germinacaoFinalSemeadura(a: LaudoParaSemeadura, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicao: number): number | null {
  const base = germinacaoParaSemeadura(a, produtos);
  if (base === null) return null;
  const final = base * fatorModo * fatorCondicao;
  return final > 0 ? final : null;
}

/**
 * Sementes por m² = Densidade desejada ÷ (Germinação final / 100) — a
 * REFERÊNCIA de todo o cálculo de semeadura é a Densidade (plântulas
 * estabelecidas por m² que o produtor quer no final); a Germinação final
 * (VC% do laudo OU teste de campo, × Índice de Sobrevivência, × Fatores de
 * Modo/Condição do Guia) diz que fração das sementes lançadas vira planta —
 * então pra chegar na Densidade alvo, lança-se Densidade/germinação
 * sementes por m². Não depende de PMS nem de área — é uma taxa pura.
 */
export function calcularSementesPorM2(a: LaudoParaSemeadura, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicao: number): number | null {
  const densidade = resolverDensidadeBase(a.nomeProduto, produtos);
  const germinacao = germinacaoFinalSemeadura(a, produtos, fatorModo, fatorCondicao);
  if (densidade === null || germinacao === null) return null;
  return (densidade * 100) / germinacao;
}

/**
 * kg/ha = Sementes por m² × PMS ÷ 100 — o PMS só entra AQUI, como conversor
 * sementes→peso (PMS = peso de 1.000 sementes, em gramas). Sem PMS
 * cadastrado (nem no lote, nem base), não tem como saber o peso — mas
 * Sementes por m²/cova continuam calculáveis normalmente, só o kg/ha (e
 * tudo que depende dele: Peso total, Sacos, Valor) fica pendente.
 */
export function calcularKgPorHectareNumero(a: ArquivoLaudo, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicao: number): number | null {
  const sementesPorM2 = calcularSementesPorM2(a, produtos, fatorModo, fatorCondicao);
  const pms = paraNumero(a.pms) ?? resolverPmsBase(a.nomeProduto, produtos);
  if (sementesPorM2 === null || pms === null) return null;
  return (sementesPorM2 * pms) / 100;
}

/** Igual calcularKgPorHectareNumero, mas já formatado (arredondado pra cima, número fechado) pra exibir. */
export function calcularKgPorHectare(a: ArquivoLaudo, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicao: number): string {
  const kgHa = calcularKgPorHectareNumero(a, produtos, fatorModo, fatorCondicao);
  // Arredonda sempre pra cima (nunca pra baixo) e pro inteiro fechado — é uma
  // recomendação de dosagem, então erra pra margem maior (mais semente, não
  // menos) e vira um número redondo, fácil de medir/comunicar no campo.
  return kgHa === null ? '—' : `${Math.ceil(kgHa)} kg/ha`;
}

/**
 * Covas por m² = 10.000 cm² (1 m²) ÷ (espaçamento entre covas na linha ×
 * espaçamento do corredor entre linhas), os dois em cm.
 */
export function calcularCovasPorM2(covaCm: number | null, corredorCm: number | null): number | null {
  if (covaCm === null || covaCm <= 0 || corredorCm === null || corredorCm <= 0) return null;
  return 10000 / (covaCm * corredorCm);
}

/**
 * Sementes por cova (alvo teórico) = Sementes por m² ÷ Covas por m² — o mesmo
 * total de sementes lançadas em 1 m² (ver calcularSementesPorM2), mas em vez
 * de espalhado a lanço, concentrado nas covas daquele m². Só usado como
 * referência de exibição — no modo Linha/Cova a Sementes/cova de verdade é
 * sempre digitada manualmente (nunca calculada), e é ela quem fixa o produto
 * Cova × Corredor; ver derivarEspacamento em GuiaPlantioModal.tsx.
 */
export function calcularSementesPorCova(sementesPorM2: number | null, covasPorM2: number | null): number | null {
  if (sementesPorM2 === null || covasPorM2 === null || covasPorM2 <= 0) return null;
  return sementesPorM2 / covasPorM2;
}

/**
 * Arredonda o total de embalagens/sacos por MARGEM de tolerância (cadastrada por grupo em
 * Parametrização, ver resolverMargemTolerancia — 25% se não cadastrado) em vez do arredondamento
 * padrão (0,5): até essa % de embalagem faltando ainda arredonda pra baixo (compra menos), acima
 * arredonda pra cima. Sempre no mínimo 1 quando há alguma demanda de verdade (senão "faltar pouco"
 * pra completar a PRIMEIRA embalagem resultaria em 0, o que não faz sentido).
 */
export function arredondarSacos(quociente: number, margemFracao: number): number {
  const inteiros = Math.floor(quociente);
  const fracao = quociente - inteiros;
  const sacos = fracao > margemFracao ? inteiros + 1 : inteiros;
  return quociente > 0 ? Math.max(sacos, 1) : 0;
}

/** Valor de um Fator (Modo ou Condição) cadastrado em `arquivos_fatores_plantio`, pela `chave` — 1 se não cadastrado (sem efeito na conta). */
export function fatorDe(fatores: FatorPlantio[], chave: string): number {
  return paraNumero(fatores.find((f) => f.chave === chave)?.fator ?? null) ?? 1;
}

/** Validade no formato "MM/AAAA" (texto livre, digitado pelo operador) — convertida num número comparável (ano×12+mês). Sem validade cadastrada vai pro fim da lista (usado pra ordenar laudos do mais recente pro mais antigo). */
export function validadeParaOrdenacao(validade: string | null): number {
  const partes = (validade ?? '').split('/');
  if (partes.length !== 2) return -Infinity;
  const mes = Number(partes[0]);
  const ano = Number(partes[1]);
  if (!Number.isFinite(mes) || !Number.isFinite(ano)) return -Infinity;
  return ano * 12 + mes;
}

/**
 * Covas por m² TRAVADO — regra GERAL do modo Covas (Milho/Sorgo usa a regra própria em
 * GuiaPlantioModal.tsx, ver covasM2AlvoMilhoSorgo). PADRONIZADO em 4 (equivalente ao 50×50 de
 * sempre) — não é campo por produto. Não é editável de jeito nenhum; o único grau de liberdade é o
 * Corredor (Distância é sempre derivada dele pra manter esse valor fixo, ver distanciaDeCovasM2).
 */
export function covasM2Alvo(): number {
  return 4;
}

/** Distância (cm) no espaçamento padrão (grade quadrada no Covas/m² alvo, ver covasM2Alvo) — referência de "0% de desconto" pra sementesComAjustePorDistancia (regra geral). Valor EXATO (sem arredondar pro centímetro fechado), pra a curva ficar contínua. */
export function distanciaIdealProduto(): number {
  return Math.sqrt(10000 / covasM2Alvo());
}

/** Distância (cm) a partir de um Covas/m² alvo já resolvido e do Corredor digitado — Distância = 10000 ÷ (Corredor × Covas/m² alvo). Null com Corredor ou Covas/m² inválido. */
export function distanciaDeCovasM2(covasM2: number | null, corredorTexto: string): number | null {
  const corredor = paraNumero(corredorTexto);
  if (corredor === null || corredor <= 0 || covasM2 === null || covasM2 <= 0) return null;
  return 10000 / (corredor * covasM2);
}

/** O menor entre Distância e Corredor atuais — quem estiver mais apertado é quem realmente limita a competição entre plantas, então é esse valor que entra no desconto por espaçamento mínimo (ver sementesComAjustePorDistancia). Null com Corredor inválido. */
export function espacamentoDeDistancia(distancia: number | null, corredorTexto: string): number | null {
  const corredor = paraNumero(corredorTexto);
  return distancia === null || corredor === null ? null : Math.min(distancia, corredor);
}

// % de desconto na Sementes/cova por cm que o espaçamento efetivo (o menor entre Distância e
// Corredor atuais) fica mais apertado que a distância ideal — evita superdimensionar a cova quando
// o espaçamento aperta. Sem teto — a conta continua linear (nada empírico travando antes da hora).
const TAXA_AJUSTE_SEMENTES_POR_CM = 1;

/** Desconta a Sementes/cova padrão quando o espaçamento efetivo fica mais apertado que a distância ideal — 1%/cm de diferença, sem teto. Mais aberto que o ideal não faz nada (mantém o padrão, sem "prêmio" por sobrar espaço). */
export function sementesComAjustePorDistancia(sementesPadrao: number, espacamentoAtual: number, distanciaIdeal: number): number {
  const diferenca = distanciaIdeal - espacamentoAtual; // > 0: mais apertado (desconto); <= 0: sem ajuste
  if (diferenca <= 0) return sementesPadrao;
  const percentual = diferenca * TAXA_AJUSTE_SEMENTES_POR_CM;
  return sementesPadrao * (1 - percentual / 100);
}

/**
 * Sementes/cova (equivalente, sempre em SEMENTES) que bate EXATAMENTE o Máx. de plântulas/cova
 * cadastrado (Parametrização), numa dada Germinação final — regra GERAL pro modo Covas (Milho/Sorgo
 * usa a regra própria em GuiaPlantioModal.tsx), onde a Densidade não serve de referência (ela
 * funciona bem só pra "A Lanço"). Null sem Máx. cadastrado ou sem Germinação.
 */
export function sementesPorCovaAlvo(laudo: ArquivoLaudo, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicaoValor: number): number | null {
  const maxPlantulasCova = resolverMaxPlantulasCova(laudo.nomeProduto, produtos);
  if (maxPlantulasCova === null || maxPlantulasCova <= 0) return null;
  const germinacaoFinal = germinacaoFinalSemeadura(laudo, produtos, fatorModo, fatorCondicaoValor);
  return germinacaoFinal !== null && germinacaoFinal > 0 ? (maxPlantulasCova * 100) / germinacaoFinal : null;
}

/**
 * Sementes/cova (equivalente, sempre em sementes) da regra GERAL do modo Covas — mira o Máx.
 * cadastrado (ver sementesPorCovaAlvo, ou o modelo por Densidade sem esse cadastro), descontada
 * conforme o espaçamento efetivo fica mais apertado que o ideal do produto (ver
 * sementesComAjustePorDistancia). `espacamentoAtual = null` devolve o valor SEM esse desconto (a
 * base "no espaçamento padrão"). Null quando falta algum dado (Germinação, Máx./Densidade).
 */
export function sementesCovaAtual(
  laudo: ArquivoLaudo,
  produtos: ProdutoParametrizacao[],
  fatorModo: number,
  fatorCondicaoValor: number,
  espacamentoAtual: number | null,
): number | null {
  let sementesCova = sementesPorCovaAlvo(laudo, produtos, fatorModo, fatorCondicaoValor);
  if (sementesCova === null) {
    const sementesPorM2 = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicaoValor);
    sementesCova = calcularSementesPorCova(sementesPorM2, covasM2Alvo());
  }
  if (sementesCova === null || espacamentoAtual === null) return sementesCova;
  return sementesComAjustePorDistancia(sementesCova, espacamentoAtual, distanciaIdealProduto());
}

/**
 * kg/ha a partir de Covas/m² × Sementes/cova (equivalente) × PMS — a conta "de verdade" em modo
 * Covas, nunca só da Densidade (que em Covas só serve de estimativa de fallback).
 */
export function kgPorHaDeSementesCova(covasPorM2: number | null, sementesCova: number | null, pms: number | null): number | null {
  return covasPorM2 !== null && sementesCova !== null && pms !== null && pms > 0 ? (covasPorM2 * sementesCova * pms) / 100 : null;
}

/** Fornecedor do laudo "bate" com o Fornecedor cadastrado no produto da Tabela de Preço — comparação frouxa (normalizada, uma string contida na outra) pra tolerar variações de escrita ("Barenbrug" x "Barenbrug Sementes"). Null de qualquer lado nunca bate. */
function fornecedorCasaComProduto(fornecedorLaudo: string | null, fornecedorProduto: string | null): boolean {
  if (!fornecedorLaudo || !fornecedorProduto) return false;
  const a = normalizarNome(fornecedorLaudo);
  const b = normalizarNome(fornecedorProduto);
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Cultivar (ver derivarCultivar em etiqueta.ts — já usada pro Selo, isola o Cultivar descartando as
 * palavras da Espécie) + Processo (campo próprio do laudo, não texto solto) — a "identidade" do
 * laudo pra casar com a Tabela de Preço, DE PROPÓSITO sem o Gênero/Espécie: laudo e Tabela às vezes
 * escrevem o Gênero de formas totalmente diferentes pra mesma planta (ex.: "U.Brizantha" no laudo x
 * "Brach" na Tabela — Urochloa/Brachiaria é sinônimo taxonômico, reclassificação, não é só
 * abreviação, não tem prefixo em comum) — exigir o Gênero bater fazia esses laudos nunca casarem
 * com produto nenhum. Sem Cultivar isolável (raro — nomeProduto só tem a Espécie, nada sobra),
 * cai pro nomeProduto inteiro mesmo, mais seguro que restar só o Processo sozinho (uma palavra só,
 * genérica demais — casaria com qualquer produto que tenha esse Processo).
 */
function identidadeDoLaudo(laudo: Pick<ArquivoLaudo, 'nomeProduto' | 'especie' | 'processo'>): string {
  const cultivar = derivarCultivar(laudo.nomeProduto, laudo.especie).trim();
  if (!cultivar) return laudo.nomeProduto;
  return laudo.processo ? `${cultivar} ${laudo.processo}` : cultivar;
}

/**
 * Laudo de maior Validade entre os que casam a identidade (Cultivar + Processo, ver
 * identidadeDoLaudo) desse produto da Tabela de Preço — igual à ordenação já usada no Guia de
 * Plantio. Quando o produto tem Fornecedor cadastrado, PREFERE os laudos cujo Fornecedor também
 * bate (mais preciso, desambigua 2 fornecedores da mesma variedade) — sem nenhum casando por
 * Fornecedor (laudo antigo sem esse campo ainda, ou produto sem Fornecedor cadastrado), cai pro
 * conjunto por nome mesmo. Null sem nenhum laudo batendo.
 */
export function encontrarLaudoParaProduto(nomeProdutoPreco: string, arquivos: ArquivoLaudo[], fornecedorProduto: string | null = null): ArquivoLaudo | null {
  const candidatos = arquivos.filter((a) => laudoCasaComNomePreco(identidadeDoLaudo(a), nomeProdutoPreco));
  if (candidatos.length === 0) return null;
  const porFornecedor = fornecedorProduto ? candidatos.filter((a) => fornecedorCasaComProduto(a.fornecedor, fornecedorProduto)) : [];
  const finalistas = porFornecedor.length > 0 ? porFornecedor : candidatos;
  return [...finalistas].sort((a, b) => validadeParaOrdenacao(b.validade) - validadeParaOrdenacao(a.validade))[0];
}

export interface PlantioPublicoResultado {
  kgHaLanco: number | null;
  /** Sementes/cova ANTES do ajuste por espaçamento (Corredor no padrão, 50cm) — a página pública do Catálogo Online recalcula ao vivo a partir daqui conforme o Corredor que o cliente digitar (ver sementesComAjustePorDistancia). */
  sementesCovaBase: number | null;
  pms: number | null;
  /** VC% (Pureza × Germinação) do laudo escolhido — null sem essas duas preenchidas nesse laudo. Só pra EXIBIÇÃO no card do Catálogo Online. */
  vc: number | null;
  /** PMS como veio digitado NESSE laudo (texto cru, ex.: "3,794") — diferente de `pms` (usado no cálculo, que cai pro PMS base da Parametrização quando o laudo não tem); aqui NUNCA cai pro base, só pra exibição — null quando esse lote não tem PMS próprio informado. */
  pmsManual: string | null;
  /** Validade do laudo escolhido, como veio cadastrada (ex.: "07/2027") — só pra exibição. */
  validade: string | null;
  /** Margem de tolerância (%) do grupo pra arredondar embalagens (ver resolverMargemTolerancia/arredondarSacos) — 25 se não cadastrado, nunca null (a calculadora pública sempre tem algum valor pra arredondar). */
  margemTolerancia: number;
}

/**
 * Snapshot de plantio pro Catálogo Online (calculadora + informação discreta no card, ver
 * CatalogoPublicoPage.tsx) — condição sempre "Média" (sem seletor lá), regra GERAL de Covas pra
 * qualquer produto (mesmo Milho/Sorgo, que no Guia interno tem Sementes/cova editável —
 * simplificação combinada com o usuário pra essa calculadora pública). Calculado no momento de
 * "Publicar" (autenticado, com os laudos/Parametrização em mãos); a página pública só lê o
 * resultado, nunca o laudo em si.
 */
export function resolverPlantioParaProduto(
  nomeProdutoPreco: string,
  arquivos: ArquivoLaudo[],
  produtos: ProdutoParametrizacao[],
  fatores: FatorPlantio[],
  fornecedorProduto: string | null = null,
): PlantioPublicoResultado {
  const laudo = encontrarLaudoParaProduto(nomeProdutoPreco, arquivos, fornecedorProduto);
  if (!laudo) return { kgHaLanco: null, sementesCovaBase: null, pms: null, vc: null, pmsManual: null, validade: null, margemTolerancia: 25 };
  const fatorCondicaoMedia = resolverFatorCondicao(laudo.nomeProduto, 'media', produtos, fatores);
  const kgHaLanco = calcularKgPorHectareNumero(laudo, produtos, fatorDe(fatores, 'lanco'), fatorCondicaoMedia);
  const sementesCovaBase = sementesCovaAtual(laudo, produtos, fatorDe(fatores, 'linha_cova'), fatorCondicaoMedia, null);
  const pms = resolverPmsDoLaudo(laudo, produtos);
  const vc = calcularVCNumero(laudo);
  const margemTolerancia = resolverMargemTolerancia(laudo.nomeProduto, produtos);
  return { kgHaLanco, sementesCovaBase, pms, vc, pmsManual: laudo.pms, validade: laudo.validade, margemTolerancia };
}
