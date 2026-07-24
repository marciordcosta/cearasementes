import { Card } from '@/components/ui/Card';
import { fmtBRL, fmtInt } from '@/lib/format';
import type { LancamentoBanco, LancamentoSistema } from '../types';

interface TotaisRodapeProps {
  banco: LancamentoBanco[];
  sistema: LancamentoSistema[];
}

function calcularTotais(valores: number[]): { registros: number; entradas: number; saidas: number; saldo: number } {
  const entradas = valores.filter((v) => v >= 0).reduce((s, v) => s + v, 0);
  const saidas = valores.filter((v) => v < 0).reduce((s, v) => s + v, 0);
  return { registros: valores.length, entradas, saidas, saldo: entradas + saidas };
}

export function TotaisRodape({ banco, sistema }: TotaisRodapeProps) {
  const tBanco = calcularTotais(banco.filter((b) => !b.desativado).map((b) => b.valor));
  const tSistema = calcularTotais(sistema.filter((s) => !s.desativado).map((s) => s.valor));

  return (
    <Card className="flex flex-wrap items-center gap-x-8 gap-y-2 p-4 text-sm">
      <div>
        <strong className="text-[var(--color-text)]">Banco:</strong>{' '}
        <span className="text-[var(--color-text-soft)]">
          {fmtInt.format(tBanco.registros)} registros · Entradas {fmtBRL.format(tBanco.entradas)} · Saídas {fmtBRL.format(Math.abs(tBanco.saidas))} ·{' '}
        </span>
        <strong className={tBanco.saldo >= 0 ? 'text-good' : 'text-bad'}>Saldo {fmtBRL.format(tBanco.saldo)}</strong>
      </div>
      <div>
        <strong className="text-[var(--color-text)]">Sistema:</strong>{' '}
        <span className="text-[var(--color-text-soft)]">
          {fmtInt.format(tSistema.registros)} registros · Entradas {fmtBRL.format(tSistema.entradas)} · Saídas {fmtBRL.format(Math.abs(tSistema.saidas))} ·{' '}
        </span>
        <strong className={tSistema.saldo >= 0 ? 'text-good' : 'text-bad'}>Saldo {fmtBRL.format(tSistema.saldo)}</strong>
      </div>
    </Card>
  );
}
