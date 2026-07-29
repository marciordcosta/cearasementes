import { calcularVCNumero, paraNumero } from './metricas';
import { resolverDensidadeBase, resolverIndiceSobrevivencia, resolverPmsBase } from './parametrizacaoProdutos';
import { resultadoTesteNumero } from './testeGerminacao';
import type { ArquivoLaudo, ProdutoParametrizacao } from './types';

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
export function germinacaoParaSemeadura(
  a: Pick<ArquivoLaudo, 'testeForma' | 'testePlantadas' | 'testeGerminadas' | 'pureza' | 'germinacao' | 'nomeProduto'>,
  produtos: ProdutoParametrizacao[],
): number | null {
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
export function germinacaoFinalSemeadura(
  a: Pick<ArquivoLaudo, 'testeForma' | 'testePlantadas' | 'testeGerminadas' | 'pureza' | 'germinacao' | 'nomeProduto'>,
  produtos: ProdutoParametrizacao[],
  fatorModo: number,
  fatorCondicao: number,
): number | null {
  const base = germinacaoParaSemeadura(a, produtos);
  if (base === null) return null;
  const final = base * fatorModo * fatorCondicao;
  return final > 0 ? final : null;
}

/**
 * kg/ha (número cru) = (Densidade × PMS) / (100 × Pureza × Germinação ×
 * Sobrevivência × Fator Modo × Fator Condição)
 *
 * Densidade é a população ALVO de plântulas estabelecidas (plantas/m²), não
 * a quantidade de semente lançada — é um cálculo inverso: quanto pior a taxa
 * de sucesso, mais semente precisa lançar pra chegar na mesma densidade
 * final. PMS converte sementes↔peso (sempre entra, não é uma fonte
 * alternativa de germinação). O "100" é só conversão de unidade (m²→ha,
 * g→kg) — não muda com o produto.
 *
 * Densidade vem sempre da Parametrização de Produtos (busca pelo nome do
 * produto) — não é editável por lote. PMS: se o lote tiver um valor
 * digitado (`a.pms`), ele manda (corrige aquele lote); em branco, cai pro
 * PMS base da Parametrização.
 */
export function calcularKgPorHectareNumero(a: ArquivoLaudo, produtos: ProdutoParametrizacao[], fatorModo: number, fatorCondicao: number): number | null {
  const densidade = resolverDensidadeBase(a.nomeProduto, produtos);
  const pms = paraNumero(a.pms) ?? resolverPmsBase(a.nomeProduto, produtos);
  const germinacao = germinacaoFinalSemeadura(a, produtos, fatorModo, fatorCondicao);
  if (densidade === null || pms === null || germinacao === null) return null;
  return (densidade * pms) / germinacao;
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
 * espaçamento do corredor entre linhas), os dois em cm — cadastrado por
 * produto/lote no Guia de Plantio (varia de cultura pra cultura).
 */
export function calcularCovasPorM2(covaCm: number | null, corredorCm: number | null): number | null {
  if (covaCm === null || covaCm <= 0 || corredorCm === null || corredorCm <= 0) return null;
  return 10000 / (covaCm * corredorCm);
}

type LaudoParaSemeadura = Pick<ArquivoLaudo, 'nomeProduto' | 'pms' | 'testeForma' | 'testePlantadas' | 'testeGerminadas' | 'pureza' | 'germinacao'>;

/**
 * Sementes por m² — de preferência puxa o PMS de verdade e passa pelo peso
 * REAL que vai ser usado (já arredondado pra cima — o que realmente se
 * compra/leva a campo) pra chegar na quantidade de sementes, dividida pela
 * área:
 *
 * total de sementes = peso real (kg) × 1.000.000 / PMS (PMS em gramas por
 * 1.000 sementes — peso_kg×1000 = gramas; gramas/PMS×1000 = sementes)
 *
 * SEM PMS cadastrado (nem no lote, nem base), não tem como converter peso
 * em sementes — mas a CONTAGEM ainda dá pra calcular direto por Densidade e
 * Germinação (VC% ou teste), sem precisar de peso nenhum: Densidade × 100 ÷
 * Germinação final. Esse atalho só não informa o peso/kg — por isso
 * Taxa de semeadura, Peso total, Sacos e Valor continuam pendentes sem PMS.
 */
export function calcularSementesPorM2(
  a: LaudoParaSemeadura,
  produtos: ProdutoParametrizacao[],
  pesoRealKg: number | null,
  areaHa: number | null,
  fatorModo: number,
  fatorCondicao: number,
): number | null {
  const pms = paraNumero(a.pms) ?? resolverPmsBase(a.nomeProduto, produtos);
  if (pms !== null && pms > 0 && pesoRealKg !== null && areaHa !== null && areaHa > 0) {
    const totalSementes = (pesoRealKg * 1_000_000) / pms;
    return totalSementes / (areaHa * 10000);
  }
  const densidade = resolverDensidadeBase(a.nomeProduto, produtos);
  const germinacao = germinacaoFinalSemeadura(a, produtos, fatorModo, fatorCondicao);
  if (densidade === null || germinacao === null) return null;
  return (densidade * 100) / germinacao;
}

/**
 * Sementes por cova = Sementes por m² ÷ Covas por m² — o mesmo total de
 * sementes lançadas em 1 m² (ver calcularSementesPorM2, com ou sem PMS), mas
 * em vez de espalhado a lanço, concentrado nas covas daquele m². `covasPorM2`
 * vem do Espaçamento (cm × cm) escolhido no Guia de Plantio: covas/m² =
 * 10.000 ÷ (espaçamento X × espaçamento Y, em cm) — não depende da
 * Densidade cadastrada (essa aqui é a distância real entre covas no campo).
 */
export function calcularSementesPorCova(
  a: LaudoParaSemeadura,
  produtos: ProdutoParametrizacao[],
  pesoRealKg: number | null,
  areaHa: number | null,
  covasPorM2: number | null,
  fatorModo: number,
  fatorCondicao: number,
): number | null {
  const sementesPorM2 = calcularSementesPorM2(a, produtos, pesoRealKg, areaHa, fatorModo, fatorCondicao);
  if (sementesPorM2 === null || covasPorM2 === null || covasPorM2 <= 0) return null;
  return sementesPorM2 / covasPorM2;
}
