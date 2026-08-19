import type { PostgrestError } from '@supabase/supabase-js';

/**
 * O Supabase (PostgREST) limita cada resposta a 1000 linhas por padrão —
 * um `select()` direto em tabelas grandes fica silenciosamente incompleto,
 * sem erro nenhum. Isso busca em blocos de `pageSize` via `.range()` até
 * não sobrar mais nada, então sempre traz a tabela inteira.
 *
 * Busca `CONCORRENCIA` páginas em paralelo por leva, em vez de uma de cada vez — antes, uma
 * tabela com 10 mil linhas fazia 10 idas-e-voltas SEQUENCIAIS ao banco (cada uma esperando a
 * anterior terminar); agora vira ~3 levas em paralelo. Não precisa saber o total de linhas de
 * antemão: dispara a leva inteira e para assim que alguma página da leva voltar mais curta que
 * `pageSize` (fim da tabela) — páginas depois dela na mesma leva são ignoradas (nunca têm dado,
 * já que o `.range()` é contíguo). Só lê, então disparar página "de sobra" além do fim é inofensivo.
 */
export async function fetchAllRows<T>(
  queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const CONCORRENCIA = 4;
  const resultado: T[] = [];
  let from = 0;
  for (;;) {
    const inicios = Array.from({ length: CONCORRENCIA }, (_, i) => from + i * pageSize);
    const respostas = await Promise.all(inicios.map((inicio) => queryFactory(inicio, inicio + pageSize - 1)));
    let acabou = false;
    for (const { data, error } of respostas) {
      if (error) throw error;
      if (!data || data.length === 0) {
        acabou = true;
        break;
      }
      resultado.push(...data);
      if (data.length < pageSize) {
        acabou = true;
        break;
      }
    }
    if (acabou) break;
    from += CONCORRENCIA * pageSize;
  }
  return resultado;
}
