import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { calcularTotalCustosPersonalizados } from '../custosPersonalizados';
import type { CustoPersonalizado } from '../types';

function fmtP(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

interface MargemResumoModalProps {
  open: boolean;
  onFechar: () => void;
  margemAtualPct: number;
  margemLiquidaPct: number;
  custos: CustoPersonalizado[];
  /** Total de vendas (média das últimas safras, somando todas as Tabelas) — mesma base usada pra margemAtualPct/margemLiquidaPct e pro detalhamento. */
  totalVendas: number;
  /** Custo do produto (Fornecedor) projetado, em R$ — mesma base de vendas acima. */
  totalFornecedor: number;
  /** Frete projetado, em R$ (só o que entra na margem — canais com "Frete Incluso" desligado não somam aqui). */
  totalFrete: number;
  /** Encargos projetado, em R$ — imposto + comissão/cartão + outros encargos (Desconto já vem à parte, ver totalDesconto). */
  totalEncargos: number;
  /** Desconto projetado, em R$ — parcela do Encargos referente só ao campo Desconto (%) de cada canal. */
  totalDesconto: number;
}

/** Um bloco de métrica — número grande + rótulo curto, com a explicação completa só no tooltip (hover). */
function BlocoMetrica({ valorPct, rotulo, titulo, corValor }: { valorPct: number; rotulo: string; titulo: string; corValor?: string }) {
  return (
    <div className="border-t border-[var(--color-line)] pt-4 first:border-t-0 first:pt-0">
      <p className={`text-2xl font-bold ${corValor ?? 'text-[var(--color-text)]'}`}>{fmtP(valorPct)}%</p>
      <p className="text-xs font-semibold text-[var(--color-text-soft)]" title={titulo}>
        {rotulo}
      </p>
    </div>
  );
}

/** Modal discreto com o resumo de margens que antes ficava em selos fixos na barra de ferramentas. */
export function MargemResumoModal({
  open,
  onFechar,
  margemAtualPct,
  margemLiquidaPct,
  custos,
  totalVendas,
  totalFornecedor,
  totalFrete,
  totalEncargos,
  totalDesconto,
}: MargemResumoModalProps) {
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);
  const { pctDasVendas: custosPct } = calcularTotalCustosPersonalizados(custos, totalVendas);
  const margemLiquidaFinalPct = margemLiquidaPct - custosPct;

  // Detalhamento em % do que compõe o Preço — Fornecedor+Encargos+Frete+Descontos+Custos
  // Fixos+Margem Líquida Final soma 100% (mesma relação de custo+impostoReais+freteReais+
  // margemReais = preço, já usada em todo o resto do sistema).
  const pctDoValor = (v: number) => (totalVendas > 0 ? (v / totalVendas) * 100 : 0);
  const linhasDetalhe = [
    { rotulo: 'Fornecedor', valorPct: pctDoValor(totalFornecedor) },
    { rotulo: 'Encargos', valorPct: pctDoValor(totalEncargos) },
    { rotulo: 'Frete', valorPct: pctDoValor(totalFrete) },
    { rotulo: 'Descontos', valorPct: pctDoValor(totalDesconto) },
    { rotulo: 'Despesas Fixas', valorPct: custosPct },
  ];

  return (
    <Modal open={open} onClose={onFechar} title="Margens — visão geral" widthClassName="max-w-sm">
      <div className="space-y-4">
        <BlocoMetrica
          valorPct={margemAtualPct}
          rotulo="MB atual"
          titulo="Margem bruta de hoje (preço e custo atuais) somando TODAS as Tabelas visíveis, ponderada pela média de quantidade vendida nas últimas safras de cada produto — estimativa de volume, já que a safra atual ainda não fechou."
        />
        <BlocoMetrica
          valorPct={margemLiquidaPct}
          rotulo="M.C prevista"
          titulo="Margem líquida (a mesma já informada por produto — ML $, com imposto/encargos/frete) de hoje somando TODAS as Tabelas visíveis, ponderada pela média de quantidade vendida nas últimas safras de cada produto."
        />
        <BlocoMetrica
          valorPct={custosPct}
          rotulo="Despesas fixas (anual)"
          titulo="Soma de todas as Despesas Fixas (aba Custos, em Parametrização — valores anuais), como % do total das vendas."
        />
        <div className="border-t border-[var(--color-line)] pt-4">
          <button type="button" onClick={() => setMostrarDetalhes((v) => !v)} className="block w-full text-left">
            <p className={`text-2xl font-bold ${margemLiquidaFinalPct >= 0 ? 'text-good' : 'text-bad'}`}>{fmtP(margemLiquidaFinalPct)}%</p>
            <p
              className="flex items-center gap-1 text-xs font-semibold text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
              title="M.C prevista menos as Despesas Fixas — o que sobra de fato depois desses custos extras. Clique pra ver o detalhamento."
            >
              Margem líquida final (M.C − Despesas)
              <span className="text-[10px]">{mostrarDetalhes ? '▲' : '▼'}</span>
            </p>
          </button>
          {mostrarDetalhes && (
            <div className="mt-3 space-y-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-page)] p-3">
              {linhasDetalhe.map((l) => (
                <div key={l.rotulo} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--color-text-soft)]">{l.rotulo}</span>
                  <span className="num font-semibold text-[var(--color-text)]">{fmtP(l.valorPct)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
