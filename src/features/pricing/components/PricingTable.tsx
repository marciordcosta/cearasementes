import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { calcularCanal, gerarCorCanal, margemClasse, montarTituloFrete } from '../calculations';
import type { Canal, Categoria, Produto } from '../types';

const MARGEM_CLASSE_CLASSNAME: Record<string, string> = {
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-[#8A5B10]',
  bad: 'bg-bad-soft text-[#8F2E2E]',
};

function fmtR(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtP(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

interface ColunaDef {
  chave: string;
  rotulo: ReactNode;
  larguraPadrao: number;
  /** deslocamento (em px) do position:sticky — undefined = coluna rola normalmente */
  stickyLeft?: number;
  /** matiz de fundo do canal (soft na coluna de Preço, subtle nas demais) — igual ao original */
  corFundo?: string;
  /** cor da borda esquerda que marca o início do bloco de um canal (canal.cor.mid) */
  corBordaEsquerda?: string;
  render: (produto: Produto) => ReactNode;
}

interface PricingTableProps {
  produtos: Produto[];
  categorias: Categoria[];
  canaisVisiveis: Canal[];
  mostrarColunaId: boolean;
  onUpdateCusto: (produtoId: string, custo: number) => void;
  onUpdatePreco: (produtoId: string, canalId: string, preco: number) => void;
  onResetPreco: (produtoId: string, canalId: string) => void;
  onEditarProduto?: (produtoId: string) => void;
  onRemoverProduto?: (produtoId: string) => void;
  onAbrirCanalTelaCheia?: (canal: Canal) => void;
  /**
   * Modo do modal de tela cheia por canal: sem a faixa de cabeçalho com o
   * nome do canal (redundante — o modal já mostra o nome no título) e sem as
   * colunas de editar/remover produto, igual ao original.
   */
  somenteCanal?: boolean;
}

/**
 * Input numérico não-controlado que só empurra um novo valor pro DOM quando
 * o campo NÃO está com foco — assim uma mudança externa (recálculo de
 * custo/margem, botão de reset) atualiza o texto mostrado, mas o próprio
 * valor digitado pelo usuário nunca é sobrescrito no meio da digitação.
 * Antes disso, o campo usava um `key` derivado do valor pra forçar remonte,
 * o que desmontava o input a cada tecla e derrubava o foco (usuário só
 * conseguia digitar 1-2 dígitos antes de precisar clicar de novo).
 */
function NumeroSincronizado({
  valor,
  onCommit,
  onFocus,
  className,
  step = '1',
  min,
}: {
  valor: number;
  onCommit: (valor: number) => void;
  onFocus?: () => void;
  className?: string;
  step?: string;
  min?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) {
      ref.current.value = valor.toFixed(2);
    }
  }, [valor]);

  return (
    <input
      ref={ref}
      type="number"
      step={step}
      min={min}
      defaultValue={valor.toFixed(2)}
      onFocus={onFocus}
      onChange={(e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) onCommit(val);
      }}
      className={className}
    />
  );
}

function AlcaRedimensionar({ onMouseDown, claro }: { onMouseDown: (e: React.MouseEvent) => void; claro?: boolean }) {
  return (
    <span
      onMouseDown={onMouseDown}
      title="Arraste para redimensionar"
      className="group absolute right-0 top-0 z-[2] flex h-full w-2.5 -mr-1.5 cursor-col-resize select-none items-center justify-center"
    >
      {/* linha fina e sempre visível marcando a divisória — realça ao passar o mouse, pra indicar onde arrastar */}
      <span
        className={`h-full w-px transition-colors group-hover:w-[3px] group-hover:bg-[var(--color-accent)] ${claro ? 'bg-white/25' : 'bg-[var(--color-line)]'}`}
      />
    </span>
  );
}

export function PricingTable({
  produtos,
  categorias,
  canaisVisiveis,
  mostrarColunaId,
  onUpdateCusto,
  onUpdatePreco,
  onResetPreco,
  onEditarProduto,
  onRemoverProduto,
  onAbrirCanalTelaCheia,
  somenteCanal = false,
}: PricingTableProps) {
  const getCategoria = (id: string) => categorias.find((c) => c.id === id) ?? categorias[0];
  // Focar num campo de custo/preço destaca a linha inteira — igual ao original.
  const [linhaDestacada, setLinhaDestacada] = useState<string | null>(null);

  // A linha de rótulos (Preço, Frete...) precisa "empilhar" logo abaixo da
  // linha de grupo (nome do canal) pra ficarem fixas juntas ao rolar — sem
  // medir a altura real, as duas ficariam sobrepostas no mesmo topo:0.
  const linhaGrupoRef = useRef<HTMLTableRowElement>(null);
  const [alturaGrupo, setAlturaGrupo] = useState(0);

  useLayoutEffect(() => {
    const el = linhaGrupoRef.current;
    if (!el) {
      setAlturaGrupo(0);
      return;
    }
    const medir = () => setAlturaGrupo(el.getBoundingClientRect().height);
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(el);
    return () => observer.disconnect();
  }, [somenteCanal]);

  const defaults: Record<string, number> = {
    classe: 110,
    id: 70,
    produto: 190,
    peso: 90,
    custo: 110,
    editar: 44,
    remover: 44,
  };
  canaisVisiveis.forEach((canal) => {
    defaults[`${canal.id}:preco`] = 110;
    defaults[`${canal.id}:frete`] = 100;
    defaults[`${canal.id}:encargos`] = 110;
    defaults[`${canal.id}:mlpct`] = 90;
    defaults[`${canal.id}:mlvalor`] = 100;
  });
  const { largura, iniciarArrasto } = useColumnWidths(defaults);

  const colunas: ColunaDef[] = [
    ...(somenteCanal
      ? []
      : [
          {
            chave: 'editar',
            rotulo: '',
            larguraPadrao: defaults.editar,
            render: (p: Produto) => (
              <button type="button" onClick={() => onEditarProduto?.(p.id)} title="Editar produto" className="rounded bg-[var(--color-page)] px-1.5 py-1 text-[var(--color-navy)] hover:bg-[var(--color-line)]">
                ✎
              </button>
            ),
          } satisfies ColunaDef,
        ]),
    { chave: 'classe', rotulo: 'Classe', larguraPadrao: defaults.classe, stickyLeft: 0, render: (p) => getCategoria(p.categoriaId).nome },
    ...(mostrarColunaId ? [{ chave: 'id', rotulo: 'ID', larguraPadrao: defaults.id, render: (p: Produto) => <span className="num">{p.codigo}</span> } satisfies ColunaDef] : []),
    {
      chave: 'produto',
      rotulo: 'Produto',
      larguraPadrao: defaults.produto,
      // Fica colado logo depois de "Classe" ao rolar, igual ao original —
      // o deslocamento acompanha a largura ATUAL de "Classe" (que agora pode
      // ser redimensionada), não um valor fixo.
      stickyLeft: largura('classe'),
      render: (p) => <span className="font-semibold text-[var(--color-navy)]">{p.nome}</span>,
    },
    { chave: 'peso', rotulo: 'Peso (Kg)', larguraPadrao: defaults.peso, render: (p) => <span className="num">{p.peso.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg</span> },
    {
      chave: 'custo',
      rotulo: 'Custo (R$)',
      larguraPadrao: defaults.custo,
      render: (p) => (
        <NumeroSincronizado
          step="0.1"
          min="0"
          valor={p.custo}
          onFocus={() => setLinhaDestacada(p.id)}
          onCommit={(val) => onUpdateCusto(p.id, val)}
          className="num w-full rounded border border-[var(--color-line)] px-1.5 py-1 text-right"
        />
      ),
    },
    ...canaisVisiveis.flatMap((canal): ColunaDef[] => {
      const cor = gerarCorCanal(canal.corIndice);
      return [
      {
        chave: `${canal.id}:preco`,
        rotulo: 'Preço',
        larguraPadrao: defaults[`${canal.id}:preco`],
        corBordaEsquerda: cor.mid,
        corFundo: cor.soft,
        render: (p) => {
          const categoria = getCategoria(p.categoriaId);
          const r = calcularCanal(p, canal, categoria);
          const manual = p.precos[canal.id]?.manual ?? false;
          return (
            <div className="flex items-center gap-1">
              <NumeroSincronizado
                valor={r.preco}
                onFocus={() => setLinhaDestacada(p.id)}
                onCommit={(val) => onUpdatePreco(p.id, canal.id, val)}
                className={`num min-w-0 flex-1 rounded border px-1.5 py-1 text-right font-semibold text-[var(--color-navy)] ${manual ? 'price-input-manual border-warn bg-warn-soft' : 'border-[var(--color-line)]'}`}
              />
              <button
                type="button"
                onClick={() => onResetPreco(p.id, canal.id)}
                title="Voltar ao preço sugerido"
                tabIndex={manual ? 0 : -1}
                className={`shrink-0 text-[var(--color-text-soft)] hover:text-[var(--color-navy)] ${manual ? 'visible' : 'invisible'}`}
              >
                ↺
              </button>
            </div>
          );
        },
      },
      {
        chave: `${canal.id}:frete`,
        rotulo: 'Frete (R$)',
        larguraPadrao: defaults[`${canal.id}:frete`],
        corFundo: cor.subtle,
        render: (p) => {
          const categoria = getCategoria(p.categoriaId);
          const r = calcularCanal(p, canal, categoria);
          const freteIncluso = canal.freteIncluso !== false;
          return (
            <span className={`num ${freteIncluso ? '' : 'text-[var(--color-text-soft)] line-through opacity-80'}`} title={montarTituloFrete(r, freteIncluso)}>
              R$ {fmtR(r.freteReais)}
            </span>
          );
        },
      },
      {
        chave: `${canal.id}:encargos`,
        rotulo: 'Encargos (R$)',
        larguraPadrao: defaults[`${canal.id}:encargos`],
        corFundo: cor.subtle,
        render: (p) => {
          const categoria = getCategoria(p.categoriaId);
          const r = calcularCanal(p, canal, categoria);
          return (
            <span className="num" title={`Imposto ${fmtP(r.impostoPct)}% + Encargos ${fmtP(r.encargosPct)}%${r.outrosEncargos ? ' + Outros Encargos R$ ' + fmtR(r.outrosEncargos) : ''}`}>
              R$ {fmtR(r.impostoReais)}
            </span>
          );
        },
      },
      {
        chave: `${canal.id}:mlpct`,
        rotulo: 'ML (%)',
        larguraPadrao: defaults[`${canal.id}:mlpct`],
        corFundo: cor.subtle,
        render: (p) => {
          const categoria = getCategoria(p.categoriaId);
          const r = calcularCanal(p, canal, categoria);
          const classe = margemClasse(r.margemPct, r.margemAlvo);
          return <span className={`num inline-block min-w-[52px] rounded px-1.5 py-0.5 text-right ${MARGEM_CLASSE_CLASSNAME[classe]}`}>{fmtP(r.margemPct)}%</span>;
        },
      },
      {
        chave: `${canal.id}:mlvalor`,
        rotulo: 'ML ($)',
        larguraPadrao: defaults[`${canal.id}:mlvalor`],
        corFundo: cor.subtle,
        render: (p) => {
          const categoria = getCategoria(p.categoriaId);
          const r = calcularCanal(p, canal, categoria);
          return <span className="num">R$ {fmtR(r.margemReais)}</span>;
        },
      },
    ];
    }),
    ...(somenteCanal
      ? []
      : [
          {
            chave: 'remover',
            rotulo: '',
            larguraPadrao: defaults.remover,
            render: (p: Produto) => (
              <button type="button" onClick={() => onRemoverProduto?.(p.id)} title="Remover produto" className="text-[var(--color-text-soft)] hover:text-bad">
                ✕
              </button>
            ),
          } satisfies ColunaDef,
        ]),
  ];

  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className="table-fixed text-xs" style={{ width: colunas.reduce((s, c) => s + largura(c.chave), 0) }}>
        <colgroup>
          {colunas.map((c) => (
            <col key={c.chave} style={{ width: largura(c.chave) }} />
          ))}
        </colgroup>
        <thead>
          {!somenteCanal && (
            <tr ref={linhaGrupoRef} className="sticky top-0 z-[2]">
              <th className="bg-[var(--color-navy)] px-2 py-2" colSpan={mostrarColunaId ? 6 : 5} />
              {canaisVisiveis.map((canal) => (
                <th
                  key={canal.id}
                  colSpan={5}
                  onClick={() => onAbrirCanalTelaCheia?.(canal)}
                  title="Clique para abrir esta tabela em tela cheia"
                  className="cursor-pointer px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-white hover:brightness-125"
                  style={{ background: gerarCorCanal(canal.corIndice).dark, borderLeft: '2px solid rgba(255,255,255,.3)' }}
                >
                  {canal.nome} <span className="opacity-75">⤢</span>
                </th>
              ))}
              <th className="bg-[var(--color-navy)]" />
            </tr>
          )}
          <tr className="sticky z-[2] bg-[var(--color-navy)] text-left text-white" style={{ top: alturaGrupo }}>
            {colunas.map((coluna) => (
              <th
                key={coluna.chave}
                style={{
                  ...(coluna.stickyLeft !== undefined ? { left: coluna.stickyLeft } : undefined),
                  ...(coluna.corBordaEsquerda ? { borderLeft: `2px solid ${coluna.corBordaEsquerda}` } : undefined),
                }}
                className={`relative overflow-hidden text-ellipsis whitespace-nowrap px-2.5 py-2 font-semibold ${coluna.stickyLeft !== undefined ? 'sticky z-[3] bg-[var(--color-navy)]' : ''}`}
              >
                {coluna.rotulo}
                <AlcaRedimensionar onMouseDown={iniciarArrasto(coluna.chave)} claro />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {produtos.length === 0 ? (
            <tr>
              <td colSpan={colunas.length} className="px-4 py-6 text-center text-[var(--color-text-soft)]">
                Nenhum produto cadastrado para este filtro.
              </td>
            </tr>
          ) : (
            produtos.map((produto, indice) => {
              const novoGrupo = indice > 0 && produto.categoriaId !== produtos[indice - 1].categoriaId;
              const destacada = produto.id === linhaDestacada;
              return (
                <tr key={produto.id} className={`border-b border-[var(--color-line)] ${novoGrupo ? 'border-t-2 border-t-[var(--color-line)]' : ''}`}>
                  {colunas.map((coluna) => (
                    <td
                      key={coluna.chave}
                      style={{
                        ...(coluna.stickyLeft !== undefined ? { left: coluna.stickyLeft } : undefined),
                        ...(coluna.corBordaEsquerda ? { borderLeft: `2px solid ${coluna.corBordaEsquerda}` } : undefined),
                        background: destacada ? '#FFF6CC' : (coluna.corFundo ?? (coluna.stickyLeft !== undefined ? 'var(--color-surface)' : undefined)),
                      }}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap px-2.5 py-2 text-[var(--color-text-soft)] ${coluna.stickyLeft !== undefined ? 'sticky z-[1]' : ''}`}
                    >
                      {coluna.render(produto)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
