import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type FormaRegra = 'PIX' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'BOLETO' | 'CHEQUE';

export interface RegraConciliacao {
  formaPagamento: FormaRegra;
  /** Tolerância de diferença de valor (R$). PIX/Cheque/Boleto sempre usam; Cartão só quando o valor bruto exato é conhecido (Stone) — nesse caso é essa tolerância que decide o match exato, não a faixa de taxa (que fica de fallback pra quando o bruto não é conhecido). */
  toleranciaValor: number;
  /** Janela de dias úteis entre a data do sistema e a do OFX. Boleto usa os dois; Cartão só o máximo. */
  diasUteisMin: number | null;
  diasUteisMax: number | null;
  /** Faixa de taxa aceitável da maquininha, em percentual (1.9 = 1,9%) — só Cartão Débito/Crédito. */
  taxaMinPercentual: number | null;
  taxaMaxPercentual: number | null;
  /** Comparação de nome (só PIX). */
  nomeMinContido: number | null;
  nomeMinSobrenome: number | null;
  /** Se false, a Conciliação Automática não exige NF preenchida nessa forma pra fechar sozinha. */
  exigirNfAutomatica: boolean;
  /** Só PIX usa hoje: dias corridos de diferença ainda considerados "mesma data" na busca de sugestões, e janela da rede de segurança "Mesmo valor, recebimento diferente" (todas as formas). */
  toleranciaDias: number;
}

export const NOMES_FORMA_REGRA: Record<FormaRegra, string> = {
  PIX: 'PIX',
  CARTAO_DEBITO: 'Cartão Débito',
  CARTAO_CREDITO: 'Cartão Crédito',
  BOLETO: 'Boleto',
  CHEQUE: 'Cheque',
};

/**
 * Espelha os valores que hoje viviam fixos em matching.ts — usado como
 * fallback caso a tabela ainda não tenha sido migrada/semeada no Supabase,
 * pra a conciliação nunca ficar sem regra nenhuma.
 */
export const REGRAS_PADRAO: Record<FormaRegra, RegraConciliacao> = {
  PIX: { formaPagamento: 'PIX', toleranciaValor: 0.01, diasUteisMin: null, diasUteisMax: null, taxaMinPercentual: null, taxaMaxPercentual: null, nomeMinContido: 8, nomeMinSobrenome: 5, exigirNfAutomatica: true, toleranciaDias: 30 },
  CARTAO_DEBITO: { formaPagamento: 'CARTAO_DEBITO', toleranciaValor: 0.01, diasUteisMin: null, diasUteisMax: 2, taxaMinPercentual: 0.9, taxaMaxPercentual: 3, nomeMinContido: null, nomeMinSobrenome: null, exigirNfAutomatica: true, toleranciaDias: 0 },
  CARTAO_CREDITO: { formaPagamento: 'CARTAO_CREDITO', toleranciaValor: 0.01, diasUteisMin: null, diasUteisMax: 2, taxaMinPercentual: 1.9, taxaMaxPercentual: 5, nomeMinContido: null, nomeMinSobrenome: null, exigirNfAutomatica: true, toleranciaDias: 0 },
  BOLETO: { formaPagamento: 'BOLETO', toleranciaValor: 0.01, diasUteisMin: 2, diasUteisMax: 3, taxaMinPercentual: null, taxaMaxPercentual: null, nomeMinContido: null, nomeMinSobrenome: null, exigirNfAutomatica: true, toleranciaDias: 0 },
  CHEQUE: { formaPagamento: 'CHEQUE', toleranciaValor: 0.01, diasUteisMin: null, diasUteisMax: null, taxaMinPercentual: null, taxaMaxPercentual: null, nomeMinContido: null, nomeMinSobrenome: null, exigirNfAutomatica: true, toleranciaDias: 0 },
};

type RegraRow = Database['public']['Tables']['conciliacao_regras']['Row'];

function regraFromRow(row: RegraRow): RegraConciliacao {
  return {
    formaPagamento: row.forma_pagamento,
    toleranciaValor: row.tolerancia_valor,
    diasUteisMin: row.dias_uteis_min,
    diasUteisMax: row.dias_uteis_max,
    taxaMinPercentual: row.taxa_min_percentual,
    taxaMaxPercentual: row.taxa_max_percentual,
    nomeMinContido: row.nome_min_contido,
    nomeMinSobrenome: row.nome_min_sobrenome,
    exigirNfAutomatica: row.exigir_nf_automatica,
    toleranciaDias: row.dias_tolerancia,
  };
}

/** Busca as 5 regras — completa com REGRAS_PADRAO qualquer forma que ainda não tenha linha na tabela (migração não rodada, ou linha apagada). */
export async function fetchRegras(): Promise<Record<FormaRegra, RegraConciliacao>> {
  const { data, error } = await supabase.from('conciliacao_regras').select('*');
  if (error) throw error;

  const porForma = { ...REGRAS_PADRAO };
  for (const row of data) {
    porForma[row.forma_pagamento] = regraFromRow(row);
  }
  return porForma;
}

export async function salvarRegra(regra: RegraConciliacao): Promise<RegraConciliacao> {
  const { data, error } = await supabase
    .from('conciliacao_regras')
    .upsert(
      {
        forma_pagamento: regra.formaPagamento,
        tolerancia_valor: regra.toleranciaValor,
        dias_uteis_min: regra.diasUteisMin,
        dias_uteis_max: regra.diasUteisMax,
        taxa_min_percentual: regra.taxaMinPercentual,
        taxa_max_percentual: regra.taxaMaxPercentual,
        nome_min_contido: regra.nomeMinContido,
        nome_min_sobrenome: regra.nomeMinSobrenome,
        exigir_nf_automatica: regra.exigirNfAutomatica,
        dias_tolerancia: regra.toleranciaDias,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'forma_pagamento' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return regraFromRow(data);
}
