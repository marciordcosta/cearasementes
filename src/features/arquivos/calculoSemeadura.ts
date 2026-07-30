import { calcularVCNumero, paraNumero } from './metricas';
import { resolverDensidadeBase, resolverIndiceSobrevivencia, resolverPmsBase } from './parametrizacaoProdutos';
import { resultadoTesteNumero } from './testeGerminacao';
import type { ArquivoLaudo, ProdutoParametrizacao } from './types';

type LaudoParaSemeadura = Pick<ArquivoLaudo, 'nomeProduto' | 'pms' | 'testeForma' | 'testePlantadas' | 'testeGerminadas' | 'pureza' | 'germinacao'>;

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
 */
export function germinacaoParaSemeadura(a: LaudoParaSemeadura, produtos: ProdutoParametrizacao[]): number | null {
  const doTeste = resultadoTesteNumero(a);
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
