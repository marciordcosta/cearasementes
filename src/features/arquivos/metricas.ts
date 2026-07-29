import type { ArquivoLaudo } from './types';

/** Os campos do laudo (Pureza, Germinação, PMS, Densidade...) são texto livre editável — aceita vírgula ou ponto decimal e um "%" opcional no fim. */
export function paraNumero(texto: string | null): number | null {
  if (!texto) return null;
  const numero = Number(texto.replace('%', '').replace(',', '.').trim());
  return Number.isFinite(numero) ? numero : null;
}

/** Valor Cultural = (Pureza × Germinação) / 100 — só calcula quando os dois vieram do laudo. */
export function calcularVCNumero(a: Pick<ArquivoLaudo, 'pureza' | 'germinacao'>): number | null {
  const p = paraNumero(a.pureza);
  const g = paraNumero(a.germinacao);
  if (p === null || g === null) return null;
  return (p * g) / 100;
}

export function calcularVC(a: Pick<ArquivoLaudo, 'pureza' | 'germinacao'>): string {
  const vc = calcularVCNumero(a);
  return vc === null ? '—' : `${Math.round(vc)}%`;
}
