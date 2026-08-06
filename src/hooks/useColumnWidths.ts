import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'pricing-table-column-widths';
const LARGURA_MINIMA = 24;

function carregarLarguras(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Larguras de coluna arrastáveis, persistidas no localStorage (chave
 * compartilhada por nome de coluna/canal, então o ajuste feito na tabela
 * principal também vale dentro do modal de tela cheia daquele canal).
 */
export function useColumnWidths(defaults: Record<string, number>) {
  const [larguras, setLarguras] = useState<Record<string, number>>(() => ({ ...defaults, ...carregarLarguras() }));
  const arrastando = useRef<{ chave: string; inicioX: number; larguraInicial: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(larguras));
  }, [larguras]);

  const largura = useCallback((chave: string) => larguras[chave] ?? defaults[chave] ?? 100, [larguras, defaults]);

  const iniciarArrasto = useCallback(
    (chave: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      arrastando.current = { chave, inicioX: e.clientX, larguraInicial: largura(chave) };

      function mover(ev: MouseEvent) {
        if (!arrastando.current) return;
        const delta = ev.clientX - arrastando.current.inicioX;
        const nova = Math.max(LARGURA_MINIMA, arrastando.current.larguraInicial + delta);
        setLarguras((prev) => ({ ...prev, [arrastando.current!.chave]: nova }));
      }
      function soltar() {
        arrastando.current = null;
        document.removeEventListener('mousemove', mover);
        document.removeEventListener('mouseup', soltar);
      }
      document.addEventListener('mousemove', mover);
      document.addEventListener('mouseup', soltar);
    },
    [largura],
  );

  return { largura, iniciarArrasto };
}
