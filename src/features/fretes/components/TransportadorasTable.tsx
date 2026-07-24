import { Card } from '@/components/ui/Card';
import { fmtBRL } from '@/lib/format';
import type { Transportadora } from '../types';

interface TransportadorasTableProps {
  transportadoras: Transportadora[];
  onToggleAtiva: (id: string, ativa: boolean) => void;
  onVerCidades: (transportadora: Transportadora) => void;
  onEditar: (transportadora: Transportadora) => void;
  onApagar: (transportadora: Transportadora) => void;
}

function formatarValorNf(t: Transportadora): string {
  return t.valorPorNfTipo === 'percentual' ? `${(t.valorPorNf * 100).toFixed(2)}%` : fmtBRL.format(t.valorPorNf);
}

function formatarTaxaColeta(t: Transportadora): string {
  if (t.taxaColeta === 0) return '—';
  return t.taxaColetaTipo === 'percentual' ? `${(t.taxaColeta * 100).toFixed(2)}%` : fmtBRL.format(t.taxaColeta);
}

export function TransportadorasTable({ transportadoras, onToggleAtiva, onVerCidades, onEditar, onApagar }: TransportadorasTableProps) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-line)] bg-[var(--color-page)] text-left text-[var(--color-text-soft)]">
            <th className="px-4 py-2.5 font-medium">Transportadora</th>
            <th className="px-4 py-2.5 font-medium">Região</th>
            <th className="px-4 py-2.5 text-right font-medium">Valor/Kg</th>
            <th className="px-4 py-2.5 text-right font-medium">Custo NF</th>
            <th className="px-4 py-2.5 text-right font-medium">Taxa Coleta</th>
            <th className="px-4 py-2.5 text-right font-medium">Frete Mínimo</th>
            <th className="px-4 py-2.5 font-medium">Prazo Padrão</th>
            <th className="px-4 py-2.5 text-center font-medium">Cidades</th>
            <th className="px-4 py-2.5 text-center font-medium">Ativa</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {transportadoras.map((t) => (
            <tr key={t.id} className="border-b border-[var(--color-line)] last:border-b-0">
              <td className="px-4 py-2 font-semibold text-[var(--color-text)]">{t.nome}</td>
              <td className="px-4 py-2 text-[var(--color-text-soft)]">{t.uf}</td>
              <td className="num px-4 py-2 text-right">{fmtBRL.format(t.valorPorKg)}</td>
              <td className="num px-4 py-2 text-right">{formatarValorNf(t)}</td>
              <td className="num px-4 py-2 text-right">{formatarTaxaColeta(t)}</td>
              <td className="num px-4 py-2 text-right">{fmtBRL.format(t.freteMinimo)}</td>
              <td className="px-4 py-2 text-[var(--color-text-soft)]">
                {t.prazoPadraoHoras !== null ? `${t.prazoPadraoHoras}h úteis` : (t.prazoPadraoTexto ?? '—')}
              </td>
              <td className="px-4 py-2 text-center">
                <button type="button" onClick={() => onVerCidades(t)} className="text-xs font-semibold text-[var(--color-accent)] hover:underline">
                  {t.prazos.length} cidade{t.prazos.length === 1 ? '' : 's'}
                </button>
              </td>
              <td className="px-4 py-2 text-center">
                <input type="checkbox" checked={t.ativa} onChange={(e) => onToggleAtiva(t.id, e.target.checked)} className="accent-[var(--color-navy)]" />
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right">
                <button type="button" onClick={() => onEditar(t)} title="Editar" className="mr-2 text-[var(--color-text-soft)] hover:text-[var(--color-text)]">
                  ✎
                </button>
                <button type="button" onClick={() => onApagar(t)} title="Excluir" className="text-[var(--color-text-soft)] hover:text-bad">
                  🗑
                </button>
              </td>
            </tr>
          ))}
          {transportadoras.length === 0 && (
            <tr>
              <td colSpan={10} className="px-4 py-6 text-center text-[var(--color-text-soft)]">
                Nenhuma transportadora cadastrada ainda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
