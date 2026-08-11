import type { ArquivoLaudo } from './types';

/** Dias corridos desde `dataIso` até hoje — recalculado sempre, nunca gravado (só a data do teste é persistida). */
export function diasDesdeTeste(dataIso: string): number {
  const ms = Date.now() - new Date(dataIso).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

/** Acima de 30 dias, quebra em meses (blocos de 30 dias) pra não mostrar um número de dias muito grande — ex.: "2m e 15 dias". */
export function formatarDiasTeste(dias: number): string {
  if (dias <= 30) return `${dias} dia${dias === 1 ? '' : 's'}`;
  const meses = Math.floor(dias / 30);
  const resto = dias % 30;
  return `${meses}m e ${resto} dia${resto === 1 ? '' : 's'}`;
}

/**
 * Etapa em que o Teste de Campo está — 2 etapas, cada uma seu card no
 * TesteModal: "Plantio" (testeForma/testeData/testePlantadas ou
 * testePesoPlantado) e, semanas depois, "Resultado" (testeGerminadas
 * preenchido). Sem nenhum campo preenchido ainda, `sem_teste`; Plantio feito
 * mas Resultado pendente, `em_analise`; germinadas já contadas, `resultado`.
 */
export type StatusTeste = 'sem_teste' | 'em_analise' | 'resultado';

export function statusTeste(a: Pick<ArquivoLaudo, 'testeForma' | 'testeGerminadas'>): StatusTeste {
  if (a.testeForma == null) return 'sem_teste';
  if (a.testeGerminadas == null) return 'em_analise';
  return 'resultado';
}

/**
 * % de germinação do teste de campo, sem formatação — germinadas ainda não
 * contadas (Em análise) é null, não 0. Usado tanto pra exibir quanto pra
 * entrar na conta de kg/ha (ver calculoSemeadura.ts).
 *
 * Modo "sementes": Germinadas ÷ Plantadas direto.
 * Modo "peso": não dá pra contar as sementes plantadas, só pesá-las — por
 * isso precisa do PMS (Peso de Mil Sementes, em g) do lote pra converter
 * Peso plantado (g) em nº de sementes (Peso ÷ PMS × 1000), e só então dividir
 * pelas Germinadas. Sem PMS resolvido (nem por lote, nem base da
 * Parametrização — ver resolverPmsDoLaudo em parametrizacaoProdutos.ts),
 * fica pendente (null), igual ao kg/ha do Guia de Plantio nesse mesmo caso.
 */
export function resultadoTesteNumero(
  a: Pick<ArquivoLaudo, 'testeForma' | 'testePlantadas' | 'testeGerminadas' | 'testePesoPlantado'>,
  pms: number | null = null,
): number | null {
  if (a.testeGerminadas == null) return null;
  if (a.testeForma === 'sementes') {
    if (!a.testePlantadas) return null;
    return (a.testeGerminadas / a.testePlantadas) * 100;
  }
  if (a.testeForma === 'peso') {
    if (!a.testePesoPlantado || pms === null || pms <= 0) return null;
    const sementesPlantadas = (a.testePesoPlantado * 1000) / pms;
    return sementesPlantadas > 0 ? (a.testeGerminadas / sementesPlantadas) * 100 : null;
  }
  return null;
}

/** Resultado do Teste de Germinação de Campo — "Em análise" (Plantio feito, Resultado pendente), % pronto ou "—"/"Sem PMS cadastrado" (sem teste, ou modo peso sem PMS pra converter). */
export function resultadoTeste(
  a: Pick<ArquivoLaudo, 'testeForma' | 'testePlantadas' | 'testeGerminadas' | 'testePesoPlantado'>,
  pms: number | null = null,
): string {
  const status = statusTeste(a);
  if (status === 'sem_teste') return '—';
  if (status === 'em_analise') return 'Em análise';
  const numero = resultadoTesteNumero(a, pms);
  if (numero !== null) return `${Math.round(numero)}%`;
  if (a.testeForma === 'peso') return 'Sem PMS cadastrado';
  return '—';
}
