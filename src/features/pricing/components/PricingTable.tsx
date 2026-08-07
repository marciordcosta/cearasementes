import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { NumeroSincronizado } from '@/components/ui/NumeroSincronizado';
import type { Transportadora } from '@/features/fretes/types';
import { calcularCanal, gerarCorCanal, margemClasse, montarTituloFrete } from '../calculations';
import type { Canal, Categoria, Fornecedor, Produto, Subcategoria } from '../types';

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

/** As duas primeiras palavras do nome (sem a marcação de negrito/itálico, maiúsculas) — usado pra decidir se a linha divisória entre produtos deve ficar espessa (produto "diferente" do anterior). */
function primeirasDuasPalavras(nome: string): string {
  return nome
    .replace(/[*_]/g, '')
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

/**
 * Nome do produto com marcação estilo WhatsApp, digitada no próprio campo
 * "Produto" do EditProductModal (não afeta o que é salvo, só a exibição
 * aqui na tabela): `*palavra*` sai em negrito, `_palavra_` sai em itálico,
 * o resto do nome em peso 300 (fino).
 */
function NomeComDestaque({ nome }: { nome: string }) {
  const regex = /\*(.+?)\*|_(.+?)_/g;
  const partes: { texto: string; estilo: 'normal' | 'negrito' | 'italico' }[] = [];
  let ultimoIndice = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(nome)) !== null) {
    if (match.index > ultimoIndice) partes.push({ texto: nome.slice(ultimoIndice, match.index), estilo: 'normal' });
    partes.push({ texto: (match[1] ?? match[2])!, estilo: match[1] !== undefined ? 'negrito' : 'italico' });
    ultimoIndice = regex.lastIndex;
  }
  if (ultimoIndice < nome.length) partes.push({ texto: nome.slice(ultimoIndice), estilo: 'normal' });

  return (
    <>
      {partes.map((p, i) => (
        <span key={i} className={p.estilo === 'negrito' ? 'font-bold' : p.estilo === 'italico' ? 'font-light italic' : 'font-light'}>
          {p.texto}
        </span>
      ))}
    </>
  );
}

interface ColunaDef {
  chave: string;
  rotulo: ReactNode;
  larguraPadrao: number;
  /**
   * Chave usada pra guardar/ler a largura arrastável — quando ausente, usa `chave`. As colunas
   * repetidas por canal (Preço/Frete/Encargos/ML%/ML$/Ajuste) compartilham uma chave "col:tipo"
   * (sem o canal.id) pra que redimensionar uma delas ajuste as equivalentes em TODOS os canais,
   * mantendo um padrão único de largura em vez de um ajuste independente por tabela.
   */
  larguraChave?: string;
  /** deslocamento (em px) do position:sticky — undefined = coluna rola normalmente */
  stickyLeft?: number;
  /** matiz de fundo do canal (soft na coluna de Preço, subtle nas demais) — igual ao original */
  corFundo?: string;
  /** cor da borda esquerda que marca o início do bloco de um canal (canal.cor.mid) */
  corBordaEsquerda?: string;
  /** canal dono dessa coluna (Preço/Frete/.../Ajuste) — usado pra destacar a célula quando esse produto está marcado como "precisa ajuste" NESSE canal. */
  canalId?: string;
  render: (produto: Produto, destacada: boolean) => ReactNode;
}

interface PricingTableProps {
  produtos: Produto[];
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  fornecedores: Fornecedor[];
  canaisVisiveis: Canal[];
  /**
   * Canal usado como referência nos tooltips de comparação (Preço/Margem) —
   * sempre a primeira tabela GERAL (não a primeira das colunas exibidas
   * aqui), pra continuar valendo também dentro do modal de tela cheia por
   * canal (que só mostra 1 canal em `canaisVisiveis`, sem outro pra comparar).
   */
  canalReferencia?: Canal;
  transportadoras: Transportadora[];
  mostrarColunaId: boolean;
  onUpdatePreco: (produtoId: string, canalId: string, preco: number) => void;
  onResetPreco: (produtoId: string, canalId: string) => void;
  onTogglePrecisaAjuste: (produtoId: string, canalId: string, valor: boolean) => void;
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
  subcategorias,
  fornecedores,
  canaisVisiveis,
  canalReferencia,
  transportadoras,
  mostrarColunaId,
  onUpdatePreco,
  onResetPreco,
  onTogglePrecisaAjuste,
  onEditarProduto,
  onRemoverProduto,
  onAbrirCanalTelaCheia,
  somenteCanal = false,
}: PricingTableProps) {
  const getCategoria = (id: string) => categorias.find((c) => c.id === id) ?? categorias[0];
  const getSubcategoria = (id: string | null) => (id ? subcategorias.find((s) => s.id === id) : undefined);
  const getFornecedor = (id: string | null) => (id ? fornecedores.find((f) => f.id === id) : undefined);
  const transportadoraPorId = useMemo(() => new Map(transportadoras.map((t) => [t.id, t])), [transportadoras]);
  const referencia = canalReferencia ?? canaisVisiveis[0];
  // Focar num campo de custo/preço (ou clicar na linha) destaca a linha inteira — igual ao original.
  const [linhaDestacada, setLinhaDestacada] = useState<string | null>(null);
  // Clicar fora da tabela inteira limpa o destaque — ouve o documento (não só onBlur) porque
  // clicar numa <tr> sem focar nenhum input não dispara blur nenhum.
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setLinhaDestacada(null);
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, []);

  // Sombra que "descola" a coluna Produto (última fixa) do restante da
  // tabela ao rolar horizontalmente — só aparece quando há algo escondido
  // atrás dela (scrollLeft > 0), senão fica uma sombra parada sem sentido.
  const [roladoLateral, setRoladoLateral] = useState(false);

  // Navegação por teclado restrita aos campos de Preço (valor de venda):
  // Tab natural do navegador já pula só entre eles porque todo o resto
  // (Custo, botões ✎/↺/✕) tem tabIndex=-1; falta só o Enter, que não tem
  // comportamento nativo de "pular pra próxima linha" num <input type=number>.
  const precoRefs = useRef(new Map<string, HTMLInputElement>());
  function focarPreco(linha: number, coluna: number) {
    if (linha < 0 || linha >= produtos.length || coluna < 0 || coluna >= canaisVisiveis.length) return;
    const el = precoRefs.current.get(`${produtos[linha].id}:${canaisVisiveis[coluna].id}`);
    if (el) {
      el.focus();
      el.select();
    }
  }
  function onEnterPreco(e: React.KeyboardEvent<HTMLInputElement>, produtoId: string, canalId: string) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const linha = produtos.findIndex((p) => p.id === produtoId);
    const coluna = canaisVisiveis.findIndex((c) => c.id === canalId);
    if (linha === -1 || coluna === -1) return;
    focarPreco(linha + 1, coluna);
  }

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

  // Preço/Frete/Encargos/ML%/ML$/Ajuste usam uma largura ÚNICA ("col:tipo"), compartilhada por
  // todos os canais — arrastar qualquer uma delas ajusta o padrão pra todas as tabelas de uma vez.
  const defaults: Record<string, number> = {
    classe: 110,
    id: 70,
    produto: 190,
    peso: 90,
    custo: 110,
    editar: 44,
    remover: 32,
    'col:preco': 110,
    'col:frete': 100,
    'col:encargos': 110,
    'col:mlpct': 90,
    'col:mlvalor': 100,
    'col:ajuste': 52,
  };
  const { largura, iniciarArrasto } = useColumnWidths(defaults);

  // "Excluir" + "Editar" só existem fora do modo tela cheia por canal — juntas formam o
  // início fixo da tabela; as demais colunas fixas (Classe/Produto) acompanham essa largura.
  const larguraExcluirEditar = somenteCanal ? 0 : largura('remover') + largura('editar');

  const colunas: ColunaDef[] = [
    ...(somenteCanal
      ? []
      : [
          {
            chave: 'remover',
            rotulo: '',
            larguraPadrao: defaults.remover,
            stickyLeft: 0,
            render: (p: Produto) => (
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  if (window.confirm(`Excluir o produto "${p.nome}"? Essa ação não pode ser desfeita.`)) onRemoverProduto?.(p.id);
                }}
                title="Remover produto"
                className="text-[var(--color-text-soft)] hover:text-bad"
              >
                ✕
              </button>
            ),
          } satisfies ColunaDef,
          {
            chave: 'editar',
            rotulo: '',
            larguraPadrao: defaults.editar,
            stickyLeft: largura('remover'),
            render: (p: Produto) => (
              <button
                type="button"
                tabIndex={-1}
                onClick={() => onEditarProduto?.(p.id)}
                title={p.imprimir ? 'Editar produto (ativo para impressão)' : 'Editar produto (inativo para impressão)'}
                className="rounded px-1.5 py-0.5 hover:brightness-95"
                style={p.imprimir ? { background: 'var(--color-page)', color: 'var(--color-text)' } : { background: '#C24444', color: '#FFFFFF' }}
              >
                ✎
              </button>
            ),
          } satisfies ColunaDef,
        ]),
    {
      chave: 'classe',
      rotulo: 'Classe',
      larguraPadrao: defaults.classe,
      // Cola logo depois de "Excluir"+"Editar" (que só existem fora do modo tela cheia por canal).
      stickyLeft: larguraExcluirEditar,
      render: (p) => getCategoria(p.categoriaId).nome,
    },
    ...(mostrarColunaId ? [{ chave: 'id', rotulo: 'ID', larguraPadrao: defaults.id, render: (p: Produto) => <span className="num">{p.codigo}</span> } satisfies ColunaDef] : []),
    {
      chave: 'produto',
      rotulo: 'Produto',
      larguraPadrao: defaults.produto,
      // Fica colado logo depois de "Classe" ao rolar, igual ao original —
      // o deslocamento acompanha a largura ATUAL de "Excluir"+"Editar"+"Classe" (que agora podem
      // ser redimensionadas), não um valor fixo.
      stickyLeft: larguraExcluirEditar + largura('classe'),
      render: (p) => {
        const fornecedor = getFornecedor(p.fornecedorId);
        return (
          <span className="flex w-full items-start gap-1.5">
            <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--color-text)]">
              <NomeComDestaque nome={p.nome} />
            </span>
            {fornecedor && (
              <span
                className="shrink-0 rounded-full px-1 py-0 text-[8px] font-medium leading-[1.4] text-white"
                style={{ background: gerarCorCanal(fornecedor.ordem).dark }}
              >
                {fornecedor.nome}
              </span>
            )}
          </span>
        );
      },
    },
    { chave: 'peso', rotulo: 'Peso (Kg)', larguraPadrao: defaults.peso, render: (p) => <span className="num">{p.peso.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg</span> },
    {
      // Não editável: custo = Valor Kg x Peso, calculado e salvo no Editar Produto.
      chave: 'custo',
      rotulo: 'Custo (R$)',
      larguraPadrao: defaults.custo,
      render: (p, destacada) => (
        <div
          className={`num w-full rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-0.5 text-right text-[var(--color-text)] ${destacada ? 'shadow-[inset_0_0_0_999px_var(--color-highlight-row-subtle)]' : ''}`}
        >
          {fmtR(p.custo)}
        </div>
      ),
    },
    ...canaisVisiveis.flatMap((canal): ColunaDef[] => {
      const cor = gerarCorCanal(canal.corIndice);
      return [
      {
        chave: `${canal.id}:preco`,
        rotulo: 'Preço',
        larguraPadrao: defaults['col:preco'],
        larguraChave: 'col:preco',
        corBordaEsquerda: cor.mid,
        corFundo: cor.soft,
        canalId: canal.id,
        render: (p, destacada) => {
          const categoria = getCategoria(p.categoriaId);
          const subcategoria = getSubcategoria(p.subcategoriaId);
          const r = calcularCanal(p, canal, categoria, subcategoria, transportadoraPorId);
          const manual = p.precos[canal.id]?.manual ?? false;
          const precisaAjuste = p.precos[canal.id]?.precisaAjuste ?? false;
          // Não faz sentido comparar a referência com ela mesma.
          const ehReferencia = referencia !== undefined && canal.id === referencia.id;
          const partesTooltip: string[] = [];
          if (manual) partesTooltip.push(`Sugestão: R$ ${fmtR(r.precoSugerido)}`);
          if (referencia !== undefined && !ehReferencia) {
            const rReferencia = calcularCanal(p, referencia, categoria, subcategoria, transportadoraPorId);
            const diffPct = rReferencia.preco > 0 ? ((r.preco - rReferencia.preco) / rReferencia.preco) * 100 : 0;
            partesTooltip.push(`Referência: R$ ${fmtR(rReferencia.preco)}`);
            partesTooltip.push(`Diferença: ${diffPct >= 0 ? '+' : ''}${fmtP(diffPct)}%`);
          }
          return (
            <div className="flex items-center gap-1" title={partesTooltip.length > 0 ? partesTooltip.join('\n') : undefined}>
              <NumeroSincronizado
                valor={r.preco}
                onFocus={() => setLinhaDestacada(p.id)}
                onCommit={(val) => onUpdatePreco(p.id, canal.id, val)}
                onKeyDownExtra={(e) => onEnterPreco(e, p.id, canal.id)}
                registrarInput={(el) => {
                  const chave = `${p.id}:${canal.id}`;
                  if (el) precoRefs.current.set(chave, el);
                  else precoRefs.current.delete(chave);
                }}
                className={`num min-w-0 flex-1 rounded border px-1.5 py-0.5 text-right font-semibold ${precisaAjuste ? 'border-white/40 bg-white/10 text-white' : manual ? 'price-input-manual border-warn bg-warn-soft text-[var(--color-navy)]' : 'border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-text)]'} ${destacada && !precisaAjuste ? 'shadow-[inset_0_0_0_999px_var(--color-highlight-row-subtle)]' : ''}`}
              />
              <button
                type="button"
                onClick={() => onResetPreco(p.id, canal.id)}
                title="Voltar ao preço sugerido"
                tabIndex={-1}
                className={`shrink-0 ${precisaAjuste ? 'text-white/80 hover:text-white' : 'text-[var(--color-text-soft)] hover:text-[var(--color-text)]'} ${manual ? 'visible' : 'invisible'}`}
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
        larguraPadrao: defaults['col:frete'],
        larguraChave: 'col:frete',
        canalId: canal.id,
        render: (p) => {
          const categoria = getCategoria(p.categoriaId);
          const r = calcularCanal(p, canal, categoria, getSubcategoria(p.subcategoriaId), transportadoraPorId);
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
        larguraPadrao: defaults['col:encargos'],
        larguraChave: 'col:encargos',
        canalId: canal.id,
        render: (p) => {
          const categoria = getCategoria(p.categoriaId);
          const r = calcularCanal(p, canal, categoria, getSubcategoria(p.subcategoriaId), transportadoraPorId);
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
        larguraPadrao: defaults['col:mlpct'],
        larguraChave: 'col:mlpct',
        canalId: canal.id,
        render: (p) => {
          const categoria = getCategoria(p.categoriaId);
          const r = calcularCanal(p, canal, categoria, getSubcategoria(p.subcategoriaId), transportadoraPorId);
          const classe = margemClasse(r.margemPct, r.margemAlvo);
          const precisaAjuste = p.precos[canal.id]?.precisaAjuste ?? false;
          const margemBrutaPct = r.preco > 0 ? ((r.preco - p.custo) / r.preco) * 100 : 0;
          return (
            <span
              className={`num inline-block min-w-[52px] rounded px-1.5 py-0.5 text-right ${precisaAjuste ? 'text-white' : MARGEM_CLASSE_CLASSNAME[classe]}`}
              title={`(${fmtP(margemBrutaPct)}%)`}
            >
              {fmtP(r.margemPct)}%
            </span>
          );
        },
      },
      {
        chave: `${canal.id}:mlvalor`,
        rotulo: 'ML ($)',
        larguraPadrao: defaults['col:mlvalor'],
        larguraChave: 'col:mlvalor',
        canalId: canal.id,
        render: (p) => {
          const categoria = getCategoria(p.categoriaId);
          const subcategoria = getSubcategoria(p.subcategoriaId);
          const r = calcularCanal(p, canal, categoria, subcategoria, transportadoraPorId);
          const ehReferencia = referencia !== undefined && canal.id === referencia.id;
          let title: string | undefined;
          if (referencia !== undefined && !ehReferencia) {
            const rReferencia = calcularCanal(p, referencia, categoria, subcategoria, transportadoraPorId);
            const diffReais = r.margemReais - rReferencia.margemReais;
            const diffPct = rReferencia.margemReais !== 0 ? (diffReais / Math.abs(rReferencia.margemReais)) * 100 : 0;
            title = `${diffReais >= 0 ? '+' : ''}R$ ${fmtR(diffReais)}\n(${diffPct >= 0 ? '+' : ''}${fmtP(diffPct)}%)`;
          }
          return (
            <span className="num" title={title}>
              R$ {fmtR(r.margemReais)}
            </span>
          );
        },
      },
      {
        chave: `${canal.id}:ajuste`,
        rotulo: '✕',
        larguraPadrao: defaults['col:ajuste'],
        larguraChave: 'col:ajuste',
        canalId: canal.id,
        render: (p) => {
          const precisaAjuste = p.precos[canal.id]?.precisaAjuste ?? false;
          return (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePrecisaAjuste(p.id, canal.id, !precisaAjuste);
              }}
              title={precisaAjuste ? 'Marcado para ajuste — some do PDF deste canal' : 'Marcar como "precisa de ajuste" (some do PDF deste canal)'}
              className={`rounded px-1.5 py-0.5 ${precisaAjuste ? 'bg-bad text-white' : 'text-[var(--color-text-soft)] hover:bg-[var(--color-line)]'}`}
            >
              ✕
            </button>
          );
        },
      },
    ];
    }),
  ];

  // Ponto exato (em px) onde termina a última coluna fixa (Excluir + Editar + Classe + Produto) — é ali
  // que a faixa de sombra precisa ficar grudada enquanto rola pro lado.
  const finalColunasFixas = larguraExcluirEditar + largura('classe') + largura('produto');

  // "Produto" só termina de grudar na posição final depois que "ID" (a única
  // coluna entre Classe e Produto que não é fixa) escorrega por baixo — até lá,
  // ela ainda está "andando" junto com o scroll, e mostrar sombra nesse
  // meio-tempo é prematuro (nada foi realmente coberto ainda).
  const limiarComecoCobertura = mostrarColunaId ? largura('id') : 0;

  return (
    <div className="relative" ref={containerRef}>
      <div className="max-h-[70vh] overflow-auto" onScroll={(e) => setRoladoLateral(e.currentTarget.scrollLeft > limiarComecoCobertura)}>
      <table className="table-fixed text-xs" style={{ width: colunas.reduce((s, c) => s + largura(c.larguraChave ?? c.chave), 0) }}>
        <colgroup>
          {colunas.map((c) => (
            <col key={c.chave} style={{ width: largura(c.larguraChave ?? c.chave) }} />
          ))}
        </colgroup>
        <thead>
          {!somenteCanal && (
            <tr ref={linhaGrupoRef} className="sticky top-0 z-[2]">
              <th className="bg-[var(--color-navy)] px-2 py-2" colSpan={mostrarColunaId ? 7 : 6} />
              {canaisVisiveis.map((canal) => (
                <th
                  key={canal.id}
                  colSpan={6}
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
                <AlcaRedimensionar onMouseDown={iniciarArrasto(coluna.larguraChave ?? coluna.chave)} claro />
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
              const anterior = indice > 0 ? produtos[indice - 1] : null;
              const categoriaMudou = anterior !== null && produto.categoriaId !== anterior.categoriaId;
              // Produto "diferente" do anterior (mesmo dentro da mesma categoria) — mesma
              // linha divisória espessa usada entre categorias, só que verde quando a
              // categoria TAMBÉM mudou.
              const produtoMudou = anterior !== null && primeirasDuasPalavras(produto.nome) !== primeirasDuasPalavras(anterior.nome);
              const linhaEspessa = categoriaMudou || produtoMudou;
              const destacada = produto.id === linhaDestacada;
              return (
                <tr
                  key={produto.id}
                  onClick={() => setLinhaDestacada(produto.id)}
                  className={`border-b border-[var(--color-line)] ${linhaEspessa ? (categoriaMudou ? 'border-t-2 border-t-good' : 'border-t-2 border-t-[var(--color-line)]') : ''}`}
                >
                  {colunas.map((coluna) => {
                    const precisaAjuste = coluna.canalId !== undefined && (produto.precos[coluna.canalId]?.precisaAjuste ?? false);
                    return (
                      <td
                        key={coluna.chave}
                        style={{
                          ...(coluna.stickyLeft !== undefined ? { left: coluna.stickyLeft } : undefined),
                          ...(coluna.corBordaEsquerda ? { borderLeft: `2px solid ${coluna.corBordaEsquerda}` } : undefined),
                          background: precisaAjuste ? '#C24444' : destacada ? 'var(--color-highlight-row)' : (coluna.corFundo ?? (coluna.stickyLeft !== undefined ? 'var(--color-surface)' : undefined)),
                          ...(precisaAjuste ? { color: '#FFFFFF' } : undefined),
                        }}
                        className={`overflow-hidden text-ellipsis whitespace-nowrap px-2.5 py-1 ${precisaAjuste ? '' : 'text-[var(--color-text-soft)]'} ${coluna.stickyLeft !== undefined ? 'sticky z-[1]' : ''}`}
                      >
                        {coluna.render(produto, destacada)}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      </div>
      {roladoLateral && (
        <div
          className="pointer-events-none absolute bottom-0 z-20 w-2.5"
          style={{ left: finalColunasFixas, top: alturaGrupo, background: 'linear-gradient(to right, rgba(0,0,0,0.32), rgba(0,0,0,0))' }}
        />
      )}
    </div>
  );
}
