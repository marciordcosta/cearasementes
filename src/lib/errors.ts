/**
 * Erros do Supabase/PostgREST são objetos simples ({ message, code, details,
 * hint }), não instâncias de `Error` — `e instanceof Error` dá falso pra
 * eles e esconde a mensagem real atrás de um texto genérico. Usa isso em
 * vez de checar só `instanceof Error` em qualquer catch que mostra erro pro
 * usuário.
 */
export function mensagemDeErro(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return fallback;
}
