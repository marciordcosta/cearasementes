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

/** % de germinação do teste de campo, sem formatação — só o modo "sementes" tem fórmula pronta hoje; "peso" ainda não (null). Usado tanto pra exibir quanto pra entrar na conta de kg/ha (ver calculoSemeadura.ts). */
export function resultadoTesteNumero(a: Pick<ArquivoLaudo, 'testeForma' | 'testePlantadas' | 'testeGerminadas'>): number | null {
  if (a.testeForma !== 'sementes' || !a.testePlantadas) return null;
  return ((a.testeGerminadas ?? 0) / a.testePlantadas) * 100;
}

/** Resultado do Teste de Germinação de Campo — % pronto (sementes) ou "Aguardando fórmula" (peso, ainda sem regra definida). */
export function resultadoTeste(a: Pick<ArquivoLaudo, 'testeForma' | 'testePlantadas' | 'testeGerminadas'>): string {
  const numero = resultadoTesteNumero(a);
  if (numero !== null) return `${Math.round(numero)}%`;
  if (a.testeForma === 'peso') return 'Aguardando fórmula';
  return '—';
}
