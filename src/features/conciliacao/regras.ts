import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

/**
 * 3 cards (não mais 5): GENERICA cobre PIX/Cheque/Rendimento/Outro — todos
 * com o mesmo mecanismo (valor + data, tolerância de dias corridos, nome
 * parecido), sem diferença real que justificasse cards separados. Cartão
 * Débito/Crédito viraram 1 card só (a distinção entre os dois só importa
 * pra saber QUEM é candidato de quem, não pros limiares). Boleto continua
 * sozinho "por via das dúvidas", mesmo podendo em tese compartilhar com Cartão.
 */
export type FormaRegra = 'GENERICA' | 'CARTAO' | 'BOLETO';

export interface RegraConciliacao {
  formaPagamento: FormaRegra;
  toleranciaValor: number;
  /** Só GENERICA: dias CORRIDOS de diferença ainda considerados dentro da janela de sugestão ("mesma data" é sempre exata; isso decide até quando "outra data" ainda aparece) — e também a janela da rede de segurança "recebimento diferente" (usada por todas as formas). */
  toleranciaDias: number;
  /** Só CARTÃO/BOLETO: dias ÚTEIS entre a venda e o recebimento — sem mínimo (aceita do dia 0 até esse máximo). Boleto antes exigia um mínimo também; removido por simplicidade (Stone hoje só foge 0/1 dia — mais que isso é erro de lançamento, cai pro manual mesmo). */
  diasUteisMax: number | null;
  /** Só GENERICA: comparação de nome parecido (usada de verdade no PIX, que não tem outro jeito de casar; Cheque/Rendimento/Outro reaproveitam o mesmo mecanismo). */
  nomeMinContido: number | null;
  nomeMinSobrenome: number | null;
}

export const NOMES_FORMA_REGRA: Record<FormaRegra, string> = {
  GENERICA: 'PIX, Cheque e Outros',
  CARTAO: 'Cartão',
  BOLETO: 'Boleto',
};

/**
 * Espelha os valores que hoje viviam fixos em matching.ts — usado como
 * fallback caso a tabela ainda não tenha sido migrada/semeada no Supabase,
 * pra a conciliação nunca ficar sem regra nenhuma.
 */
export const REGRAS_PADRAO: Record<FormaRegra, RegraConciliacao> = {
  GENERICA: { formaPagamento: 'GENERICA', toleranciaValor: 0.01, toleranciaDias: 30, diasUteisMax: null, nomeMinContido: 8, nomeMinSobrenome: 5 },
  CARTAO: { formaPagamento: 'CARTAO', toleranciaValor: 0.01, toleranciaDias: 0, diasUteisMax: 1, nomeMinContido: null, nomeMinSobrenome: null },
  BOLETO: { formaPagamento: 'BOLETO', toleranciaValor: 0.01, toleranciaDias: 0, diasUteisMax: 3, nomeMinContido: null, nomeMinSobrenome: null },
};

type RegraRow = Database['public']['Tables']['conciliacao_regras']['Row'];

function regraFromRow(row: RegraRow): RegraConciliacao {
  return {
    formaPagamento: row.forma_pagamento,
    toleranciaValor: row.tolerancia_valor,
    toleranciaDias: row.dias_tolerancia,
    diasUteisMax: row.dias_uteis_max,
    nomeMinContido: row.nome_min_contido,
    nomeMinSobrenome: row.nome_min_sobrenome,
  };
}

/** Busca as 3 regras — completa com REGRAS_PADRAO qualquer forma que ainda não tenha linha na tabela (migração não rodada, ou linha apagada). */
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
        dias_tolerancia: regra.toleranciaDias,
        dias_uteis_max: regra.diasUteisMax,
        nome_min_contido: regra.nomeMinContido,
        nome_min_sobrenome: regra.nomeMinSobrenome,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'forma_pagamento' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return regraFromRow(data);
}
