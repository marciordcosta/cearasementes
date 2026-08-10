import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { Badge } from '@/components/ui/Badge';
import { NomeComDestaque } from '@/components/ui/NomeComDestaque';
import { NumeroSincronizado } from '@/components/ui/NumeroSincronizado';
import type { Transportadora } from '@/features/fretes/types';
import { calcularCanal, gerarCorCanal, margemClasse, montarTituloEncargos, montarTituloFrete, primeirasDuasPalavras } from '../calculations';
import type { ClasseABC, HistoricoSafra, MargemBrutaAgregada, Representatividade } from '../historicoBi';
import type { Canal, Categoria, Fornecedor, Produto, Subcategoria } from '../types';

const MARGEM_CLASSE_CLASSNAME: Record<string, string> = {
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-[#8A5B10]',
  bad: 'bg-bad-soft text-[#8F2E2E]',
};

/** Mesmo mapeamento de cor da Curva ABC já usado no módulo BI (CORES_CLASSE em AnaliseProdutosSection.tsx). */
const CORES_CLASSE_ABC: Record<ClasseABC, 'bom' | 'neutro' | 'ruim'> = { A: 'bom', B: 'neutro', C: 'ruim' };

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
  /** true = sem alça de arrastar no cabeçalho (colunas puramente decorativas, ex.: o espaçador antes do bloco de Safras). */
  semRedimensionar?: boolean;
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
  /** TODOS os canais (não só os visíveis) — usado só pra resolver "Sugestão de Margem por referência" quando aponta pra um canal oculto. */
  todosCanais: Canal[];
  transportadoras: Transportadora[];
  /**
   * "Mais detalhes" na barra de ferramentas — liga/desliga Classe, ID e Representação Geral,
   * e também Frete/Encargos/ML ($)/Repres. (por canal)/Ajuste em cada Tabela de Preço (por
   * padrão, ou seja com essa flag desligada, cada Tabela mostra só Preço e ML (%)).
   */
  mostrarMaisDetalhes: boolean;
  onUpdatePreco: (produtoId: string, canalId: string, preco: number) => void;
  onResetPreco: (produtoId: string, canalId: string) => void;
  /** Restaura o preço sugerido de TODOS os produtos dessa tabela de uma vez (ícone ↺ ao lado do rótulo "Preço"). */
  onResetTodosPrecos: (canalId: string) => void;
  onTogglePrecisaAjuste: (produtoId: string, canalId: string, valor: boolean) => void;
  onEditarProduto?: (produtoId: string) => void;
  onRemoverProduto?: (produtoId: string) => void;
  onAbrirCanalTelaCheia?: (canal: Canal) => void;
  /** Colunas extras (uma por Safra) com o histórico de vendas do BI — só passadas pelo modal de tela cheia por canal (ver ChannelFullscreenModal.tsx). */
  historicoSafras?: { key: string; label: string }[];
  /** codInterno (= Produto.codigo) -> safraKey -> dados agregados daquela safra, pra essa Tabela de Preço. */
  historicoPorCodigo?: Map<string, Map<string, HistoricoSafra>>;
  /** safraKey -> Margem Bruta agregada de TODA a Tabela naquela safra — mostrada como selo no cabeçalho da coluna. */
  margemAgregadaPorSafra?: Map<string, MargemBrutaAgregada>;
  /** produtoId -> % da soma dos valores vendidos médios entre os produtos com Código cadastrado nessa Tabela (soma sempre 100%) — alimenta a coluna "Repres. (%)". */
  representatividadePorProduto?: Map<string, Representatividade>;
  /** Igual acima, só que somando a média de cada produto em TODAS as Tabelas — alimenta a coluna "Repres. Geral (%)", logo depois de Custo. */
  representatividadeGeralPorProduto?: Map<string, Representatividade>;
  /** Clicar no cabeçalho "Repres." (qualquer uma das duas colunas) abre o gráfico em colunas — ver GraficoRepresentacaoModal.tsx. */
  onAbrirGraficoRepresentacao?: () => void;
  /** Clicar no VALOR (não no cabeçalho) de "Repres." abre a curva mensal daquele produto — ver GraficoCurvaMensalModal.tsx. */
  onAbrirGraficoProduto?: (produto: Produto) => void;
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
  todosCanais,
  transportadoras,
  mostrarMaisDetalhes,
  onUpdatePreco,
  onResetPreco,
  onResetTodosPrecos,
  onTogglePrecisaAjuste,
  onEditarProduto,
  onRemoverProduto,
  onAbrirCanalTelaCheia,
  historicoSafras,
  historicoPorCodigo,
  margemAgregadaPorSafra,
  representatividadePorProduto,
  representatividadeGeralPorProduto,
  onAbrirGraficoRepresentacao,
  onAbrirGraficoProduto,
  somenteCanal = false,
}: PricingTableProps) {
  // Modo compacto (só Preço + ML (%) em cada Tabela) é o padrão — "Mais detalhes" ligado mostra tudo.
  const modoResumo = !mostrarMaisDetalhes;
  const getCategoria = (id: string) => categorias.find((c) => c.id === id) ?? categorias[0];
  const getSubcategoria = (id: string | null) => (id ? subcategorias.find((s) => s.id === id) : undefined);
  const getFornecedor = (id: string | null) => (id ? fornecedores.find((f) => f.id === id) : undefined);
  const transportadoraPorId = useMemo(() => new Map(transportadoras.map((t) => [t.id, t])), [transportadoras]);
  const canaisPorId = useMemo(() => new Map(todosCanais.map((c) => [c.id, c])), [todosCanais]);
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
    'col:representacao': 112,
    'col:ajuste': 52,
    'safra:espacador': 10,
    representacaoGeral: 112,
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
    ...(mostrarMaisDetalhes
      ? [
          {
            chave: 'classe',
            rotulo: 'Classe',
            larguraPadrao: defaults.classe,
            // Cola logo depois de "Excluir"+"Editar" (que só existem fora do modo tela cheia por canal).
            stickyLeft: larguraExcluirEditar,
            render: (p: Produto) => getCategoria(p.categoriaId).nome,
          } satisfies ColunaDef,
          { chave: 'id', rotulo: 'ID', larguraPadrao: defaults.id, render: (p: Produto) => <span className="num">{p.codigo}</span> } satisfies ColunaDef,
        ]
      : []),
    {
      chave: 'produto',
      rotulo: 'Produto',
      larguraPadrao: defaults.produto,
      // Fica colado logo depois de "Classe" ao rolar (quando "Mais detalhes" está ligado — senão,
      // colado direto depois de "Excluir"+"Editar") — o deslocamento acompanha a largura ATUAL
      // de "Excluir"+"Editar"+"Classe" (que agora podem ser redimensionadas), não um valor fixo.
      stickyLeft: larguraExcluirEditar + (mostrarMaisDetalhes ? largura('classe') : 0),
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
    { chave: 'peso', rotulo: 'Peso (Kg)', larguraPadrao: defaults.peso, render: (p) => <span className="num">{Math.round(p.peso)}kg</span> },
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
    ...(mostrarMaisDetalhes && representatividadeGeralPorProduto
      ? [
          {
            chave: 'representacaoGeral',
            rotulo: onAbrirGraficoRepresentacao ? (
              <button type="button" onClick={onAbrirGraficoRepresentacao} title="Ver gráfico" className="hover:underline">
                Repres%
              </button>
            ) : (
              'Repres%'
            ),
            larguraPadrao: defaults.representacaoGeral,
            render: (p: Produto) => {
              const repr = representatividadeGeralPorProduto.get(p.id);
              if (repr === undefined) return <span className="text-[var(--color-text-soft)]">—</span>;
              const titulo = `Média de ${Math.round(repr.qtdMedia)} unidades, somando todas as Tabelas${onAbrirGraficoProduto ? ' — clique pra ver a curva mensal' : ''}`;
              return (
                <span className="inline-flex items-center gap-1" title={titulo}>
                  {onAbrirGraficoProduto ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAbrirGraficoProduto(p);
                      }}
                      className="num inline-block min-w-[44px] rounded bg-blue-50 px-1.5 py-0.5 text-right text-blue-700 hover:brightness-95"
                    >
                      {fmtP(repr.pct)}%
                    </button>
                  ) : (
                    <span className="num inline-block min-w-[44px] rounded bg-blue-50 px-1.5 py-0.5 text-right text-blue-700">{fmtP(repr.pct)}%</span>
                  )}
                  <Badge tom={CORES_CLASSE_ABC[repr.classe]}>{repr.classe}</Badge>
                </span>
              );
            },
          } satisfies ColunaDef,
        ]
      : []),
    ...canaisVisiveis.flatMap((canal): ColunaDef[] => {
      const cor = gerarCorCanal(canal.corIndice);
      return [
      {
        chave: `${canal.id}:preco`,
        rotulo: (
          <span className="inline-flex items-center gap-1">
            Preço
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Restaurar o preço sugerido de TODOS os produtos da tabela "${canal.nome}"? Os preços editados manualmente aqui serão perdidos.`)) {
                  onResetTodosPrecos(canal.id);
                }
              }}
              title="Restaurar todos os preços sugeridos desta tabela"
              className="text-white/70 hover:text-white"
            >
              ↺
            </button>
          </span>
        ),
        larguraPadrao: defaults['col:preco'],
        larguraChave: 'col:preco',
        corBordaEsquerda: cor.mid,
        corFundo: cor.soft,
        canalId: canal.id,
        render: (p, destacada) => {
          const precisaAjuste = p.precos[canal.id]?.precisaAjuste ?? false;
          if (precisaAjuste) return null;
          const categoria = getCategoria(p.categoriaId);
          const subcategoria = getSubcategoria(p.subcategoriaId);
          const r = calcularCanal(p, canal, categoria, subcategoria, transportadoraPorId, canaisPorId);
          const manual = p.precos[canal.id]?.manual ?? false;
          return (
            <div className="flex items-center gap-1" title={manual ? `Sugestão: R$ ${fmtR(r.precoSugerido)}` : undefined}>
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
                className={`num min-w-0 flex-1 rounded border px-1.5 py-0.5 text-right font-semibold ${manual ? 'price-input-manual border-warn bg-warn-soft text-[var(--color-navy)]' : 'border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-text)]'} ${destacada ? 'shadow-[inset_0_0_0_999px_var(--color-highlight-row-subtle)]' : ''}`}
              />
              <button
                type="button"
                onClick={() => onResetPreco(p.id, canal.id)}
                title="Voltar ao preço sugerido"
                tabIndex={-1}
                className={`shrink-0 text-[var(--color-text-soft)] hover:text-[var(--color-text)] ${manual ? 'visible' : 'invisible'}`}
              >
                ↺
              </button>
            </div>
          );
        },
      },
      ...(modoResumo
        ? []
        : [
            {
              chave: `${canal.id}:frete`,
              rotulo: 'Frete (R$)',
              larguraPadrao: defaults['col:frete'],
              larguraChave: 'col:frete',
              canalId: canal.id,
              render: (p: Produto) => {
                if (p.precos[canal.id]?.precisaAjuste ?? false) return null;
                const categoria = getCategoria(p.categoriaId);
                const r = calcularCanal(p, canal, categoria, getSubcategoria(p.subcategoriaId), transportadoraPorId, canaisPorId);
                const freteIncluso = canal.freteIncluso !== false;
                return (
                  <span className={`num ${freteIncluso ? '' : 'text-[var(--color-text-soft)] line-through opacity-80'}`} title={montarTituloFrete(r, freteIncluso)}>
                    R$ {fmtR(r.freteReais)}
                  </span>
                );
              },
            } satisfies ColunaDef,
            {
              chave: `${canal.id}:encargos`,
              rotulo: 'Encargos (R$)',
              larguraPadrao: defaults['col:encargos'],
              larguraChave: 'col:encargos',
              canalId: canal.id,
              render: (p: Produto) => {
                if (p.precos[canal.id]?.precisaAjuste ?? false) return null;
                const categoria = getCategoria(p.categoriaId);
                const r = calcularCanal(p, canal, categoria, getSubcategoria(p.subcategoriaId), transportadoraPorId, canaisPorId);
                return (
                  <span className="num" title={montarTituloEncargos(canal, r)}>
                    R$ {fmtR(r.impostoReais)}
                  </span>
                );
              },
            } satisfies ColunaDef,
          ]),
      {
        chave: `${canal.id}:mlpct`,
        rotulo: 'ML (%)',
        larguraPadrao: defaults['col:mlpct'],
        larguraChave: 'col:mlpct',
        canalId: canal.id,
        render: (p) => {
          const precisaAjuste = p.precos[canal.id]?.precisaAjuste ?? false;
          if (precisaAjuste) return null;
          const categoria = getCategoria(p.categoriaId);
          const r = calcularCanal(p, canal, categoria, getSubcategoria(p.subcategoriaId), transportadoraPorId, canaisPorId);
          const classe = margemClasse(r.margemPct, r.margemAlvo);
          const margemBrutaPct = r.preco > 0 ? ((r.preco - p.custo) / r.preco) * 100 : 0;
          // No modo Resumo a coluna ML ($) some — o tooltip passa a mostrar esse valor em R$ em vez do % bruto.
          const titulo = modoResumo ? `ML: R$ ${fmtR(r.margemReais)}` : `(${fmtP(margemBrutaPct)}%)`;
          return (
            <span className={`num inline-block min-w-[52px] rounded px-1.5 py-0.5 text-right ${MARGEM_CLASSE_CLASSNAME[classe]}`} title={titulo}>
              {fmtP(r.margemPct)}%
            </span>
          );
        },
      },
      ...(modoResumo
        ? []
        : [
            {
              chave: `${canal.id}:mlvalor`,
              rotulo: 'ML ($)',
              larguraPadrao: defaults['col:mlvalor'],
              larguraChave: 'col:mlvalor',
              canalId: canal.id,
              render: (p: Produto) => {
                if (p.precos[canal.id]?.precisaAjuste ?? false) return null;
                const categoria = getCategoria(p.categoriaId);
                const subcategoria = getSubcategoria(p.subcategoriaId);
                const r = calcularCanal(p, canal, categoria, subcategoria, transportadoraPorId, canaisPorId);
                return <span className="num">R$ {fmtR(r.margemReais)}</span>;
              },
            } satisfies ColunaDef,
          ]),
      ...(!modoResumo && representatividadePorProduto
        ? [
            {
              chave: `${canal.id}:representacao`,
              rotulo: onAbrirGraficoRepresentacao ? (
                <button type="button" onClick={onAbrirGraficoRepresentacao} title="Ver gráfico" className="hover:underline">
                  Repres. (%)
                </button>
              ) : (
                'Repres. (%)'
              ),
              larguraPadrao: defaults['col:representacao'],
              larguraChave: 'col:representacao',
              canalId: canal.id,
              render: (p: Produto) => {
                const repr = representatividadePorProduto.get(p.id);
                if (repr === undefined) return <span className="text-[var(--color-text-soft)]">—</span>;
                const titulo = `Média de ${Math.round(repr.qtdMedia)} unidades${onAbrirGraficoProduto ? ' — clique pra ver a curva mensal' : ''}`;
                return (
                  <span className="inline-flex items-center gap-1" title={titulo}>
                    {onAbrirGraficoProduto ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAbrirGraficoProduto(p);
                        }}
                        className="num inline-block min-w-[44px] rounded bg-blue-50 px-1.5 py-0.5 text-right text-blue-700 hover:brightness-95"
                      >
                        {fmtP(repr.pct)}%
                      </button>
                    ) : (
                      <span className="num inline-block min-w-[44px] rounded bg-blue-50 px-1.5 py-0.5 text-right text-blue-700">{fmtP(repr.pct)}%</span>
                    )}
                    <Badge tom={CORES_CLASSE_ABC[repr.classe]}>{repr.classe}</Badge>
                  </span>
                );
              },
            } satisfies ColunaDef,
          ]
        : []),
      ...(modoResumo
        ? []
        : [
            {
              chave: `${canal.id}:ajuste`,
              rotulo: '',
              larguraPadrao: defaults['col:ajuste'],
              larguraChave: 'col:ajuste',
              canalId: canal.id,
              render: (p: Produto) => {
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
                    className={`rounded px-1.5 py-0.5 ${precisaAjuste ? 'bg-bad-soft text-bad' : 'text-[var(--color-text-soft)] hover:bg-[var(--color-line)]'}`}
                  >
                    ✕
                  </button>
                );
              },
            } satisfies ColunaDef,
          ]),
    ];
    }),
    ...(historicoSafras && historicoSafras.length > 0 && historicoPorCodigo
      ? [
          // Espaçador vazio — separa fisicamente o bloco de Safras da grade de preços
          // (não é só uma linha divisória: é "outra grade", com respiro de verdade entre as duas).
          {
            chave: 'safra:espacador',
            rotulo: '',
            larguraPadrao: 10,
            semRedimensionar: true,
            corFundo: 'var(--color-page)',
            render: () => null,
          } satisfies ColunaDef,
          ...historicoSafras.map((safra): ColunaDef => {
            const agregada = margemAgregadaPorSafra?.get(safra.key);
            return {
              chave: `safra:${safra.key}`,
              rotulo: (
                <div className="flex flex-col items-center gap-0.5">
                  <span>{safra.label}</span>
                  {agregada && (
                    <span
                      className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-normal"
                      title="Margem Bruta da Tabela inteira nessa Safra, considerando as quantidades vendidas de cada produto."
                    >
                      MB {fmtP(agregada.margemBrutaPct)}%
                    </span>
                  )}
                </div>
              ),
              larguraPadrao: 90,
              // Linha discreta separando CADA coluna de Safra da vizinha (não só a primeira).
              corBordaEsquerda: '#CBD5E1',
              render: (produto) => {
                const hist = produto.codigo ? historicoPorCodigo.get(produto.codigo)?.get(safra.key) : undefined;
                if (!hist) return <span className="text-[var(--color-text-soft)]">—</span>;
                const canal = canaisVisiveis[0];
                const categoria = getCategoria(produto.categoriaId);
                const r = calcularCanal(produto, canal, categoria, getSubcategoria(produto.subcategoriaId), transportadoraPorId, canaisPorId);
                // O Preço de hoje já é o preço de tabela cheio (o desconto entra na conta da própria
                // grade principal, não aqui) — quem precisa de ajuste é o histórico: `hist.valorMedio` já
                // vem líquido do desconto real dado naquela safra (vlr_com_desc), então "regrossa" ele
                // (soma o desconto de volta) antes de calcular a Margem Bruta da safra, pra comparar
                // preço cheio com preço cheio.
                const descontoPct = agregada?.descontoPct ?? 0;
                const valorMedioBruto = descontoPct < 100 ? hist.valorMedio / (1 - descontoPct / 100) : hist.valorMedio;
                const margemBrutaSafraPct = valorMedioBruto > 0 ? ((valorMedioBruto - hist.custoMedio) / valorMedioBruto) * 100 : hist.margemBrutaPct;
                const margemAtual = r.preco - produto.custo;
                const margemAtualPct = r.preco > 0 ? (margemAtual / r.preco) * 100 : 0;
                // Diferença em PONTOS percentuais, safra sobre hoje (35,0% na safra − 36,7% hoje = -1,7,
                // ou seja: safra menor que hoje = negativo, safra maior que hoje = positivo) — não uma
                // razão sobre o R$ da margem histórica, que dispara pra percentuais absurdos quando essa
                // margem é pequena (ex.: R$ 0,30 de diferença sobre R$ 0,30 de base = +100%).
                const diffPontos = margemBrutaSafraPct - margemAtualPct;
                const titulo = [
                  `Custo Médio: R$ ${fmtR(hist.custoMedio)}`,
                  `Valor Médio: R$ ${fmtR(hist.valorMedio)}`,
                  `Qtd. Vendida: ${Math.round(hist.qtd)} un.`,
                  `Margem Bruta: ${fmtP(margemBrutaSafraPct)}%`,
                  `Margem Bruta Atual: ${fmtP(margemAtualPct)}%`,
                ].join('\n');
                return (
                  <span
                    className={`num inline-block min-w-[52px] rounded px-1.5 py-0.5 text-right ${MARGEM_CLASSE_CLASSNAME[diffPontos >= 0 ? 'good' : 'bad']}`}
                    title={titulo}
                  >
                    {diffPontos >= 0 ? '+' : ''}
                    {fmtP(diffPontos)}%
                  </span>
                );
              },
            };
          }),
        ]
      : []),
  ];

  // Ponto exato (em px) onde termina a última coluna fixa (Excluir + Editar + Classe + Produto) — é ali
  // que a faixa de sombra precisa ficar grudada enquanto rola pro lado.
  const finalColunasFixas = larguraExcluirEditar + (mostrarMaisDetalhes ? largura('classe') : 0) + largura('produto');

  // "Produto" só termina de grudar na posição final depois que "ID" (a única
  // coluna entre Classe e Produto que não é fixa) escorrega por baixo — até lá,
  // ela ainda está "andando" junto com o scroll, e mostrar sombra nesse
  // meio-tempo é prematuro (nada foi realmente coberto ainda).
  const limiarComecoCobertura = mostrarMaisDetalhes ? largura('id') : 0;

  // Quantas colunas fixas (fora dos blocos por canal/safra) existem antes do cabeçalho de canal
  // começar — Excluir+Editar+Produto+Peso+Custo sempre, + Classe/ID quando "Mais detalhes" está
  // ligado, + Repres. Geral quando além disso houver dado pra ela.
  const colSpanColunasFixas = 5 + (mostrarMaisDetalhes ? 2 : 0) + (mostrarMaisDetalhes && representatividadeGeralPorProduto ? 1 : 0);
  // Preço+Frete+Encargos+ML%+ML$+Ajuste (6) e mais Repres. quando essa coluna existir — no modo Resumo, só Preço+ML%.
  const colSpanPorCanal = modoResumo ? 2 : 6 + (representatividadePorProduto ? 1 : 0);

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
              <th className="bg-[var(--color-navy)] px-2 py-2" colSpan={colSpanColunasFixas} />
              {canaisVisiveis.map((canal) => (
                <th
                  key={canal.id}
                  colSpan={colSpanPorCanal}
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
                {!coluna.semRedimensionar && <AlcaRedimensionar onMouseDown={iniciarArrasto(coluna.larguraChave ?? coluna.chave)} claro />}
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
                          background: destacada ? 'var(--color-highlight-row)' : precisaAjuste ? 'var(--color-surface)' : (coluna.corFundo ?? (coluna.stickyLeft !== undefined ? 'var(--color-surface)' : undefined)),
                        }}
                        className={`overflow-hidden text-ellipsis whitespace-nowrap px-2.5 py-1 text-[var(--color-text-soft)] ${coluna.stickyLeft !== undefined ? 'sticky z-[1]' : ''}`}
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
