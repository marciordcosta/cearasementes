import type { PostgrestError } from '@supabase/supabase-js';

/**
 * O Supabase (PostgREST) limita cada resposta a 1000 linhas por padrão —
 * um `select()` direto em tabelas grandes fica silenciosamente incompleto,
 * sem erro nenhum. Isso busca em blocos de `pageSize` via `.range()` até
 * não sobrar mais nada, então sempre traz a tabela inteira.
 */
export async function fetchAllRows<T>(
  queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const resultado: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await queryFactory(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    resultado.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return resultado;
}
