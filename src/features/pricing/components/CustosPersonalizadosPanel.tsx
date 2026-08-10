import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { calcularTotalCustosPersonalizados, valorReaisCustoPersonalizado } from '../custosPersonalizados';
import type { CustoPersonalizado, TipoCustoPersonalizado } from '../types';

interface CustosPersonalizadosPanelProps {
  custos: CustoPersonalizado[];
  /** Total de vendas (média das últimas safras, somando todas as Tabelas) — mesma conta do selo "MB atual". Base do "% das vendas". */
  totalVendas: number;
  onAdicionarCusto: (input: { descricao: string; tipo: TipoCustoPersonalizado; valor: number }) => void;
  onAtualizarCusto: (id: string, patch: Partial<Pick<CustoPersonalizado, 'descricao' | 'tipo' | 'valor'>>) => void;
  onRemoverCusto: (id: string) => void;
}

function fmtR(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtP(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

interface LinhaCusto {
  custo: CustoPersonalizado;
  valorReais: number;
  pctDoTotalCustos: number;
  pctDasVendas: number;
}

/**
 * Custos Personalizados (Parametrização de Custos > aba "Custos") — lista global e
 * puramente informativa: NÃO entra no cálculo do preço sugerido. Cada item pode ser
 * um valor fixo em R$ (ex.: aluguel) ou já um % das vendas (ex.: taxa de plataforma);
 * o sistema converte um no outro pra mostrar, lado a lado, quanto cada custo pesa no
 * total dos custos cadastrados e no total das vendas (média das últimas safras,
 * mesma conta do selo "MB atual" da barra de ferramentas).
 */
export function CustosPersonalizadosPanel({ custos, totalVendas, onAdicionarCusto, onAtualizarCusto, onRemoverCusto }: CustosPersonalizadosPanelProps) {
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState<TipoCustoPersonalizado>('reais');
  const [valor, setValor] = useState('');

  const { totalReais: totalCustosReais, pctDasVendas: totalPctDasVendas } = calcularTotalCustosPersonalizados(custos, totalVendas);

  const linhas = useMemo((): LinhaCusto[] => {
    return custos.map((custo) => {
      const valorReais = valorReaisCustoPersonalizado(custo, totalVendas);
      return {
        custo,
        valorReais,
        pctDoTotalCustos: totalCustosReais > 0 ? (valorReais / totalCustosReais) * 100 : 0,
        pctDasVendas: custo.tipo === 'percentual' ? custo.valor : totalVendas > 0 ? (valorReais / totalVendas) * 100 : 0,
      };
    });
  }, [custos, totalVendas, totalCustosReais]);

  function submeter() {
    if (!descricao.trim()) return;
    onAdicionarCusto({ descricao: descricao.trim(), tipo, valor: parseFloat(valor) || 0 });
    setDescricao('');
    setTipo('reais');
    setValor('');
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-[var(--color-text)]">Custos Personalizados</p>
      <p className="text-xs text-[var(--color-text-soft)]">
        Só informativo — não entra no cálculo do preço sugerido. "% das vendas" usa a média de venda das últimas safras, somando todas as Tabelas
        (mesma conta do selo "MB atual").
      </p>
      <Card className="overflow-hidden">
        {custos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="border-b border-[var(--color-line)] bg-[var(--color-page)] text-left text-[var(--color-text-soft)]">
                  <th className="px-3 py-2 font-semibold">Descrição</th>
                  <th className="px-3 py-2 font-semibold">Valor</th>
                  <th className="px-3 py-2 text-right font-semibold">% do total dos custos</th>
                  <th className="px-3 py-2 text-right font-semibold">% das vendas</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {linhas.map(({ custo, pctDoTotalCustos, pctDasVendas }) => (
                  <tr key={custo.id}>
                    <td className="px-3 py-1.5">
                      <input
                        type="text"
                        defaultValue={custo.descricao}
                        onBlur={(e) => {
                          const novo = e.target.value.trim();
                          if (novo && novo !== custo.descricao) onAtualizarCusto(custo.id, { descricao: novo });
                          else e.target.value = custo.descricao;
                        }}
                        className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-[var(--color-text)]"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="flex gap-1.5">
                        <select
                          defaultValue={custo.tipo}
                          onChange={(e) => onAtualizarCusto(custo.id, { tipo: e.target.value as TipoCustoPersonalizado })}
                          className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-[var(--color-text)]"
                        >
                          <option value="reais">R$</option>
                          <option value="percentual">%</option>
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={custo.valor}
                          onBlur={(e) => onAtualizarCusto(custo.id, { valor: parseFloat(e.target.value) || 0 })}
                          className="num w-24 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-right text-[var(--color-text)]"
                        />
                      </span>
                    </td>
                    <td className="num px-3 py-1.5 text-right text-[var(--color-text)]">{fmtP(pctDoTotalCustos)}%</td>
                    <td
                      className="num px-3 py-1.5 text-right text-[var(--color-text)]"
                      title="Sobre a média de venda das últimas safras, somando todas as Tabelas."
                    >
                      {fmtP(pctDasVendas)}%
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => onRemoverCusto(custo.id)}
                        title="Deletar custo"
                        className="text-[var(--color-text-soft)] hover:text-bad"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {linhas.length > 1 && (
                <tfoot>
                  <tr className="border-t border-[var(--color-line)] bg-[var(--color-page)] font-semibold text-[var(--color-text)]">
                    <td className="px-3 py-2">Total</td>
                    <td className="num px-3 py-2">R$ {fmtR(totalCustosReais)}</td>
                    <td className="num px-3 py-2 text-right">100,0%</td>
                    <td className="num px-3 py-2 text-right">{fmtP(totalPctDasVendas)}%</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] bg-[var(--color-page)] px-4 py-3">
          <span className="text-xs font-semibold text-[var(--color-text-soft)]">Novo custo:</span>
          <input
            type="text"
            placeholder="Descrição (ex.: Aluguel do galpão)"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submeter()}
            className="w-56 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)]"
          />
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoCustoPersonalizado)}
            className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1.5 text-xs text-[var(--color-text)]"
          >
            <option value="reais">R$</option>
            <option value="percentual">%</option>
          </select>
          <input
            type="number"
            step="0.01"
            placeholder="Valor"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submeter()}
            className="num w-24 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-right text-xs text-[var(--color-text)]"
          />
          <Button variant="primary" onClick={submeter}>
            + Adicionar custo
          </Button>
        </div>
      </Card>
    </div>
  );
}
