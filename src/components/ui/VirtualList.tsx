import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type UIEvent } from 'react';

interface VirtualListProps<T> {
  itens: T[];
  /** Altura de cada linha em px — todas as linhas precisam ter a mesma altura pra virtualização funcionar. */
  altura: number;
  /** Linhas extras renderizadas acima/abaixo da área visível, pra rolar sem "piscar". */
  buffer?: number;
  renderItem: (item: T) => ReactNode;
  keyExtractor: (item: T) => string;
  vazio?: ReactNode;
  className?: string;
  /** Ex.: paddingTop pra reservar espaço quando algo flutua por cima da lista (item fixado) — sem isso, o início da lista fica escondido atrás. */
  style?: CSSProperties;
}

/**
 * Só renderiza as linhas realmente visíveis (+ um buffer) em vez da lista
 * inteira — sem isso, uma lista com milhares de linhas (ex.: 6.000+
 * lançamentos da Conciliação) recria dezenas de milhares de nós de DOM a
 * cada tecla digitada na busca ou clique num checkbox, travando a tela.
 */
export function VirtualList<T>({ itens, altura, buffer = 8, renderItem, keyExtractor, vazio, className, style }: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tickingRef = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [alturaVisivel, setAlturaVisivel] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setAlturaVisivel(el.clientHeight);
    const observer = new ResizeObserver(() => setAlturaVisivel(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Zera a rolagem quando a lista muda de identidade (ex.: trocou o filtro) —
  // senão o scrollTop antigo aponta pra um índice que pode nem existir mais.
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [itens]);

  function onScroll(e: UIEvent<HTMLDivElement>) {
    const top = e.currentTarget.scrollTop;
    if (tickingRef.current) return;
    tickingRef.current = true;
    requestAnimationFrame(() => {
      setScrollTop(top);
      tickingRef.current = false;
    });
  }

  if (itens.length === 0) {
    return (
      <div ref={containerRef} className={className} style={style}>
        {vazio}
      </div>
    );
  }

  const primeiroIndice = Math.max(0, Math.floor(scrollTop / altura) - buffer);
  const quantidadeVisivel = Math.ceil(alturaVisivel / altura) + buffer * 2;
  const ultimoIndice = Math.min(itens.length, primeiroIndice + quantidadeVisivel);
  const visiveis = itens.slice(primeiroIndice, ultimoIndice);

  return (
    <div ref={containerRef} className={className} style={style} onScroll={onScroll}>
      <div style={{ height: itens.length * altura, position: 'relative' }}>
        <div style={{ position: 'absolute', top: primeiroIndice * altura, left: 0, right: 0 }}>
          {visiveis.map((item) => (
            <div key={keyExtractor(item)} style={{ height: altura }}>
              {renderItem(item)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
