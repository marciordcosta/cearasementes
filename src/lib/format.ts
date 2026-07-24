export const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtInt = new Intl.NumberFormat('pt-BR');

export function fmtPct(part: number, total: number): string {
  if (!total) return '—';
  return ((part / total) * 100).toFixed(1).replace('.', ',') + '%';
}

export function fmtCompactBRL(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return 'R$ ' + (v / 1e6).toFixed(1).replace('.', ',') + 'M';
  if (abs >= 1e3) return 'R$ ' + (v / 1e3).toFixed(1).replace('.', ',') + 'K';
  return fmtBRL.format(v);
}

export const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** "2025-02-01" -> "01/02/2025" */
export function fmtDataBR(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}
