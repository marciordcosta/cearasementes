import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type ForwardedRef, type ReactElement, type ReactNode, type UIEvent } from 'react';

export interface VirtualListHandle {
  /** Posição de rolagem atual (px) — usado pra guardar antes de aplicar um filtro que encolhe a lista. */
  getScrollTop: () => number;
  /** Restaura a posição de rolagem (px) — usado ao tirar o filtro, pra voltar pra onde estava em vez de ficar no topo. */
  scrollTo: (top: number) => void;
}

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
  /** Notifica o pai sempre que a posição de rolagem ou a altura visível mudar — usado pra decidir se um item selecionado saiu da área visível e precisa ficar fixado (em cima ou embaixo). */
  onViewportChange?: (info: { scrollTop: number; alturaVisivel: number }) => void;
}

/**
 * Só renderiza as linhas realmente visíveis (+ um buffer) em vez da lista
 * inteira — sem isso, uma lista com milhares de linhas (ex.: 6.000+
 * lançamentos da Conciliação) recria dezenas de milhares de nós de DOM a
 * cada tecla digitada na busca ou clique num checkbox, travando a tela.
 */
function VirtualListInner<T>(
  { itens, altura, buffer = 8, renderItem, keyExtractor, vazio, className, style, onViewportChange }: VirtualListProps<T>,
  ref: ForwardedRef<VirtualListHandle>,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tickingRef = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [alturaVisivel, setAlturaVisivel] = useState(600);

  useImperativeHandle(ref, () => ({
    getScrollTop: () => containerRef.current?.scrollTop ?? 0,
    scrollTo: (top: number) => {
      if (containerRef.current) containerRef.current.scrollTop = top;
      setScrollTop(top);
    },
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setAlturaVisivel(el.clientHeight);
    const observer = new ResizeObserver(() => setAlturaVisivel(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    onViewportChange?.({ scrollTop, alturaVisivel });
  }, [scrollTop, alturaVisivel, onViewportChange]);

  // A lista muda de identidade (novo array) toda vez que os dados por trás
  // mudam — inclusive só por causa de uma conciliação (o item que você
  // acabou de conciliar some/muda de posição), não só quando o usuário troca
  // de filtro de verdade. Em vez de sempre voltar pro topo (o que atrapalha
  // justamente o caso mais comum — conciliar um item e continuar na mesma
  // vizinhança), só REAJUSTA (clampa) o scroll se ele ficou fora do
  // intervalo válido pro novo tamanho da lista — o único caso em que o
  // scrollTop antigo realmente apontaria pra um índice que não existe mais.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, itens.length * altura - el.clientHeight);
    if (el.scrollTop > maxScroll) {
      el.scrollTop = maxScroll;
      setScrollTop(maxScroll);
    }
  }, [itens, altura]);

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

export const VirtualList = forwardRef(VirtualListInner) as <T>(
  props: VirtualListProps<T> & { ref?: ForwardedRef<VirtualListHandle> },
) => ReactElement;
