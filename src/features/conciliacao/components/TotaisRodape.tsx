import { fmtDataBR, fmtInt } from '@/lib/format';
import type { LancamentoBanco, LancamentoSistema } from '../types';

interface TotaisRodapeProps {
  banco: LancamentoBanco[];
  sistema: LancamentoSistema[];
}

function calcularResumo(itens: Array<{ data: string | null; conciliado: boolean }>): { dataMin: string | null; dataMax: string | null; total: number; conciliados: number } {
  const datas = itens.map((i) => i.data).filter((d): d is string => !!d).sort();
  return {
    dataMin: datas[0] ?? null,
    dataMax: datas[datas.length - 1] ?? null,
    total: itens.length,
    conciliados: itens.filter((i) => i.conciliado).length,
  };
}

/** Fixo no rodapé da tela (não rola com a página) — resumo rápido de cobertura dos dados importados, não totais financeiros (isso já está nas próprias grades). */
export function TotaisRodape({ banco, sistema }: TotaisRodapeProps) {
  const rBanco = calcularResumo(banco);
  const rSistema = calcularResumo(sistema);

  return (
    // left-[68px] = largura fixa do Sidebar (w-[68px]) — sem isso o rodapé
    // (fixed, fora do fluxo) desenha por baixo do menu lateral e tampa o
    // ícone de Uploads, que fica encostado embaixo dele.
    <div className="pointer-events-none fixed bottom-0 left-[68px] right-0 z-[60] px-6 py-2">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="pointer-events-auto truncate rounded-b-md border border-t-0 border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 text-sm shadow-[0_-4px_10px_rgba(0,0,0,0.12)]">
          <strong className="text-[var(--color-text)]">Banco:</strong>{' '}
          <span className="text-[var(--color-text-soft)]">
            {rBanco.dataMin ? fmtDataBR(rBanco.dataMin) : '—'} a {rBanco.dataMax ? fmtDataBR(rBanco.dataMax) : '—'} · {fmtInt.format(rBanco.conciliados)} de {fmtInt.format(rBanco.total)} conciliados
          </span>
        </div>
        <div className="pointer-events-auto truncate rounded-b-md border border-t-0 border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-2 text-sm shadow-[0_-4px_10px_rgba(0,0,0,0.12)]">
          <strong className="text-[var(--color-text)]">Sistema:</strong>{' '}
          <span className="text-[var(--color-text-soft)]">
            {rSistema.dataMin ? fmtDataBR(rSistema.dataMin) : '—'} a {rSistema.dataMax ? fmtDataBR(rSistema.dataMax) : '—'} · {fmtInt.format(rSistema.conciliados)} de {fmtInt.format(rSistema.total)}{' '}
            conciliados
          </span>
        </div>
      </div>
    </div>
  );
}
