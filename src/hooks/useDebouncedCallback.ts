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

  useEffect(() => {
    const timersAtUnmount = timers.current;
    return () => {
      timersAtUnmount.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return useCallback(
    (key: string, ...args: Args) => {
      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        timers.current.delete(key);
        fnRef.current(...args);
      }, delayMs);
      timers.current.set(key, timer);
    },
    [delayMs],
  );
}
