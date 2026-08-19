import { useCallback, useEffect, useRef } from 'react';

/**
 * Debounce por chave: cada `key` tem seu próprio timer independente, então
 * editar o custo do produto A não cancela um salvamento pendente do produto
 * B. Usado para não disparar uma chamada ao Supabase a cada tecla digitada
 * — a tela atualiza na hora (estado local), o salvamento remoto só dispara
 * um tempinho depois que o usuário para de digitar.
 */
export function useDebouncedCallback<Args extends unknown[]>(fn: (...args: Args) => void, delayMs = 500) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Guarda os args mais recentes de cada key pendente — se desmontar antes do timer disparar
  // (ex.: usuário edita um campo e navega pra outra página dentro do delay), o cleanup usa isso
  // pra DISPARAR o salvamento na hora em vez de só cancelar (que perdia a edição em silêncio).
  const argsPendentes = useRef(new Map<string, Args>());

  useEffect(() => {
    const timersAtUnmount = timers.current;
    const argsAtUnmount = argsPendentes.current;
    return () => {
      timersAtUnmount.forEach((timer, key) => {
        clearTimeout(timer);
        const args = argsAtUnmount.get(key);
        if (args) fnRef.current(...args);
      });
    };
  }, []);

  return useCallback(
    (key: string, ...args: Args) => {
      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing);
      argsPendentes.current.set(key, args);
      const timer = setTimeout(() => {
        timers.current.delete(key);
        argsPendentes.current.delete(key);
        fnRef.current(...args);
      }, delayMs);
      timers.current.set(key, timer);
    },
    [delayMs],
  );
}
