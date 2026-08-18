import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { fetchVendaItens, fetchVendas } from '@/features/bi/api';
import { agregarItens } from '@/features/bi/aggregate';
import type { Transportadora } from '@/features/fretes/types';
import { fetchPrecosCatalogoPublicoPorCanal } from '../api';
import { calcularCanal } from '../calculations';
import {
  calcularMargemAtualProjetada,
  calcularRepresentatividade,
  construirHistoricoPorCodigo,
  construirMargemBrutaAgregadaPorSafra,
  listarSafrasDisponiveis,
  listarTodasSafras,
  resolverDescontoUltimaSafra,
  type CriterioRepresentacao,
  type HistoricoSafra,
  type MargemBrutaAgregada,
} from '../historicoBi';
import type { Canal, Categoria, Fornecedor, Produto, Subcategoria } from '../types';
import { GraficoCurvaMensalModal } from './GraficoCurvaMensalModal';
import { GraficoRepresentacaoModal } from './GraficoRepresentacaoModal';
import { PricingTable } from './PricingTable';
import { SeletorCriterioRepresentacao } from './SeletorCriterioRepresentacao';

function fmtP(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

interface ChannelFullscreenModalProps {
  canal: Canal | null;
  produtos: Produto[];
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  fornecedores: Fornecedor[];
  /** TODOS os canais (não só os visíveis) — usado só pra resolver "Sugestão de Margem por referência". */
  todosCanais: Canal[];
  transportadoras: Transportadora[];
  /** Rótulo do "Filtrar:" (Categoria/Subcategoria/Fornecedor) já aplicado na grade principal, se algum —
   * `produtos` já vem recortado por ele; isso só avisa o gráfico de Representação daqui pra também
   * virar pizza (mesma regra da grade: qualquer filtro ativo, de fora ou a busca local, vira pizza). */
  filtroExternoRotulo?: string | null;
  /** Mesma regra da grade principal — true quando o filtro de fora é a Categoria mãe (geral): o
   * gráfico de Representação daqui também junta por nome base + Classe entre fornecedores. */
  agruparPorNomeEClasse?: boolean;
  onFechar: () => void;
  onUpdatePreco: (produtoId: string, canalId: string, preco: number) => void;
  onResetPreco: (produtoId: string, canalId: string) => void;
  onResetTodosPrecos: (canalId: string) => void;
  onTogglePrecisaAjuste: (produtoId: string, canalId: string, valor: boolean) => void;
  onAtualizarValorKg?: (produtoId: string, valorKg: number) => void;
  /** Ícone 🌐 por produto (só aqui, na tela cheia por canal) — atualiza só ESSE item no Catálogo Online já publicado, sem republicar a Tabela inteira. Devolve se deu certo. */
  onAtualizarItemCatalogo?: (produtoId: string, canal: Canal) => Promise<boolean>;
}

export function ChannelFullscreenModal({
  canal,
  produtos,
  categorias,
  subcategorias,
  fornecedores,
  todosCanais,
  transportadoras,
  filtroExternoRotulo,
  agruparPorNomeEClasse,
  onFechar,
  onUpdatePreco,
  onResetPreco,
  onResetTodosPrecos,
  onTogglePrecisaAjuste,
  onAtualizarValorKg,
  onAtualizarItemCatalogo,
}: ChannelFullscreenModalProps) {
  const [busca, setBusca] = useState('');
  // Desligado (padrão) = bloco fixo de identificação (Classe/ID) some, só Nome/Fornecedor/Peso —
  // as colunas por canal (Frete/Encargos/ML($)/Repres.%/Ajuste) ficam completas, "como já funciona
  // hoje". Ligado = o bloco fixo abre tudo (Classe/ID de volta), e as colunas por canal encolhem
  // pro resumido (só Preço+ML%) pra não empilhar as duas coisas ao mesmo tempo — ver PricingTable.tsx.
  const [custoEstendido, setCustoEstendido] = useState(false);
  const [ordenarPorRepresentacao, setOrdenarPorRepresentacao] = useState(false);
  const [criterioRepresentacao, setCriterioRepresentacao] = useState<CriterioRepresentacao>('valor');
  const [graficoAberto, setGraficoAberto] = useState(false);
  const [produtoGraficoLinha, setProdutoGraficoLinha] = useState<Produto | null>(null);
  // null = média das últimas safras (padrão) — só afeta o gráfico de Representação, não a grade.
  const [safraSelecionadaGrafico, setSafraSelecionadaGrafico] = useState<string | null>(null);

  // Cada abertura do modal (canal diferente, ou reabrir o mesmo) começa sem
  // busca nem ordenação — não faz sentido herdar isso de uma sessão anterior do modal.
  useEffect(() => {
    if (canal) {
      setBusca('');
      setOrdenarPorRepresentacao(false);
      setGraficoAberto(false);
      setProdutoGraficoLinha(null);
      setSafraSelecionadaGrafico(null);
      setCustoEstendido(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canal?.id]);

  // Só busca o histórico de vendas (BI) enquanto o modal estiver aberto — nunca na carga normal
  // da página de Precificação. Mesma queryKey que o Dashboard usa, então se ele já foi aberto
  // nesta sessão os dados vêm do cache na hora; senão, busca uma vez só.
  const { data: vendasBi = [], isLoading: carregandoVendasBi } = useQuery({ queryKey: ['bi', 'vendas'], queryFn: fetchVendas, enabled: canal !== null });
  const { data: itensBi = [], isLoading: carregandoItensBi } = useQuery({ queryKey: ['bi', 'itens'], queryFn: fetchVendaItens, enabled: canal !== null });
  const carregandoHistorico = carregandoVendasBi || carregandoItensBi;
  const itemsAgregados = useMemo(() => agregarItens(vendasBi, itensBi), [vendasBi, itensBi]);
  const historicoPorCodigo = useMemo((): Map<string, Map<string, HistoricoSafra>> => {
    if (!canal) return new Map();
    return construirHistoricoPorCodigo(itemsAgregados, canal.nome);
  }, [itemsAgregados, canal]);
  // Escopado a ESSE canal só — se `canal` (self/referência dentro de calcularCanal) for outro, não
  // tem histórico carregado aqui pra ele (só busca o BI pro canal em tela cheia), cai pro cadastrado.
  // Opt-in por produto (ver EditProductModal.tsx) — sem "Usar desconto real", sempre cai pro cadastrado.
  const resolverDescontoBi = useMemo(
    () => (canalArg: Canal, produto: Produto) =>
      canal && canalArg.id === canal.id && produto.usarDescontoReal ? resolverDescontoUltimaSafra(historicoPorCodigo, produto.codigo) : null,
    [canal, historicoPorCodigo],
  );
  const safrasDisponiveis = useMemo(() => listarSafrasDisponiveis(historicoPorCodigo), [historicoPorCodigo]);
  // Sem o limite de MAX_SAFRAS_EXIBIDAS de safrasDisponiveis (essa é só pro seletor "ver uma safra específica" do gráfico).
  const todasSafrasDisponiveis = useMemo(() => listarTodasSafras(historicoPorCodigo), [historicoPorCodigo]);
  const margemAgregadaPorSafra = useMemo((): Map<string, MargemBrutaAgregada> => {
    if (!canal) return new Map();
    return construirMargemBrutaAgregadaPorSafra(itemsAgregados, canal.nome);
  }, [itemsAgregados, canal]);
  const canaisPorId = useMemo(() => new Map(todosCanais.map((c) => [c.id, c])), [todosCanais]);
  const transportadoraPorId = useMemo(() => new Map(transportadoras.map((t) => [t.id, t])), [transportadoras]);
  const margemAtualProjetada = useMemo(() => {
    if (!canal) return null;
    return calcularMargemAtualProjetada(produtos, canal, categorias, subcategorias, transportadoraPorId, canaisPorId, historicoPorCodigo);
  }, [produtos, canal, categorias, subcategorias, transportadoraPorId, canaisPorId, historicoPorCodigo]);
  const representatividadePorProduto = useMemo(
    () => calcularRepresentatividade(produtos, historicoPorCodigo, criterioRepresentacao),
    [produtos, historicoPorCodigo, criterioRepresentacao],
  );
  // Só pro gráfico de Representação (colunas/pizza) — a grade principal sempre usa a média
  // (representatividadePorProduto acima), sem a opção de ver uma safra específica.
  const representatividadeGraficoPorProduto = useMemo(
    () => calcularRepresentatividade(produtos, historicoPorCodigo, criterioRepresentacao, safraSelecionadaGrafico ?? undefined),
    [produtos, historicoPorCodigo, criterioRepresentacao, safraSelecionadaGrafico],
  );

  const fornecedorPorId = useMemo(() => new Map(fornecedores.map((f) => [f.id, f])), [fornecedores]);

  // Preço já publicado de cada produto desse canal (ver fetchPrecosCatalogoPublicoPorCanal) — só
  // pra comparar com o preço calculado agora e destacar o 🌐 quando há algo pendente (ver
  // publicacaoPendentePorProduto abaixo). Refaz sempre que abre um canal diferente.
  const { data: precosPublicados = new Map<string, number>() } = useQuery({
    queryKey: ['pricing', 'catalogoPublicoPrecos', canal?.id],
    queryFn: () => fetchPrecosCatalogoPublicoPorCanal(canal!.id),
    enabled: canal !== null,
  });

  /**
   * produtoId -> tipo de mudança pendente desde a última publicação (ver PricingTable.tsx, que
   * destaca o 🌐 com isso) — 'novo' (elegível agora, nunca publicado), 'preco' (elegível, publicado,
   * mas o preço calculado agora é diferente do salvo) ou 'remover' (publicado, mas não elegível mais
   * — Imprimir desligado ou "precisa ajuste" nesse canal). Tolerância de 1 centavo na comparação de
   * preço pra não acusar diferença por arredondamento de ponto flutuante.
   */
  const publicacaoPendentePorProduto = useMemo(() => {
    if (!canal) return new Map<string, 'novo' | 'preco' | 'remover'>();
    const mapa = new Map<string, 'novo' | 'preco' | 'remover'>();
    produtos.forEach((p) => {
      const elegivel = p.imprimir && p.codigo && !(p.precos[canal.id]?.precisaAjuste ?? false) && (fornecedorPorId.get(p.fornecedorId ?? '')?.visivelPdf ?? true);
      const precoPublicado = precosPublicados.get(p.id);
      if (!elegivel) {
        if (precoPublicado !== undefined) mapa.set(p.id, 'remover');
        return;
      }
      if (precoPublicado === undefined) {
        mapa.set(p.id, 'novo');
        return;
      }
      const categoria = categorias.find((c) => c.id === p.categoriaId) ?? categorias[0];
      const subcategoria = p.subcategoriaId ? subcategorias.find((s) => s.id === p.subcategoriaId) : undefined;
      const precoAtual = calcularCanal(p, canal, categoria, subcategoria, transportadoraPorId, canaisPorId, true, resolverDescontoBi).preco;
      if (Math.abs(precoAtual - precoPublicado) > 0.005) mapa.set(p.id, 'preco');
    });
    return mapa;
  }, [produtos, canal, categorias, subcategorias, transportadoraPorId, canaisPorId, resolverDescontoBi, fornecedorPorId, precosPublicados]);

  const [publicandoPendentes, setPublicandoPendentes] = useState(false);
  const queryClient = useQueryClient();

  /** Envolve o 🌐 (individual e em lote) pra invalidar precosPublicados depois de publicar/remover — senão o destaque de pendência ficava desatualizado até fechar e reabrir o modal. */
  async function atualizarItemEinvalidar(produtoId: string, canalArg: Canal): Promise<boolean> {
    if (!onAtualizarItemCatalogo) return false;
    const ok = await onAtualizarItemCatalogo(produtoId, canalArg);
    if (ok) queryClient.invalidateQueries({ queryKey: ['pricing', 'catalogoPublicoPrecos', canalArg.id] });
    return ok;
  }

  /** Botão "global" — publica (ou remove) de uma vez todos os itens com pendência (ver publicacaoPendentePorProduto), reaproveitando o MESMO onAtualizarItemCatalogo do 🌐 por item, um de cada vez. */
  async function publicarTodosPendentes() {
    if (!canal || !onAtualizarItemCatalogo || publicacaoPendentePorProduto.size === 0) return;
    setPublicandoPendentes(true);
    try {
      for (const produtoId of publicacaoPendentePorProduto.keys()) {
        await atualizarItemEinvalidar(produtoId, canal);
      }
    } finally {
      setPublicandoPendentes(false);
    }
  }

  const produtosFiltrados = useMemo(() => {
    const palavras = busca.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtrados =
      palavras.length === 0
        ? produtos
        : produtos.filter((p) => {
            const fornecedor = p.fornecedorId ? fornecedorPorId.get(p.fornecedorId) : undefined;
            const descricao = `${p.nome} ${fornecedor?.nome ?? ''}`.toLowerCase();
            return palavras.every((palavra) => descricao.includes(palavra));
          });
    if (!ordenarPorRepresentacao) return filtrados;
    // Maior Representação primeiro — produto sem dado (Código não batendo) vai pro final.
    return [...filtrados].sort((a, b) => (representatividadePorProduto.get(b.id)?.pct ?? -1) - (representatividadePorProduto.get(a.id)?.pct ?? -1));
  }, [produtos, busca, fornecedorPorId, ordenarPorRepresentacao, representatividadePorProduto]);

  // Mesma regra da grade principal (PricingPage.tsx): filtro ativo (de fora, via "Filtrar:" na
  // grade — `produtos` já vem recortado por ele — E/OU a busca local aqui) vira o gráfico de
  // Representação em pizza; sem nenhum dos dois, fica em colunas (todo o sortimento visível).
  const filtroAtivoGrafico = useMemo(() => {
    const buscaAtiva = busca.trim().length > 0;
    if (!filtroExternoRotulo && !buscaAtiva) return null;
    const partesRotulo = [filtroExternoRotulo, buscaAtiva ? `"${busca.trim()}"` : null].filter((parte): parte is string => !!parte);
    return { rotulo: partesRotulo.join(' + '), produtoIds: new Set(produtosFiltrados.map((p) => p.id)) };
  }, [busca, filtroExternoRotulo, produtosFiltrados]);

  return (
    <Modal
      open={canal !== null}
      title={
        <>
          <span className="shrink-0">{canal?.nome ?? ''}</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto pelo nome ou fornecedor…"
            className="w-full max-w-xs rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-normal text-white placeholder:text-white/55 focus:border-[var(--color-accent)] focus:bg-white/20 focus:outline-none"
          />
          {margemAtualProjetada && margemAtualProjetada.valorProjetado > 0 && (
            <span
              className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-normal whitespace-nowrap text-white"
              title="Margem bruta de hoje (preço e custo atuais) pra tabela inteira, ponderada pela média de quantidade vendida nas últimas safras — estimativa de volume, já que a safra atual ainda não fechou."
            >
              MB atual: {fmtP(margemAtualProjetada.margemBrutaPct)}%
            </span>
          )}
          {margemAtualProjetada && margemAtualProjetada.valorProjetado > 0 && (
            <span
              className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-normal whitespace-nowrap text-white"
              title="Margem líquida (a mesma já informada por produto — ML $, com imposto/encargos/frete) de hoje pra tabela inteira, ponderada pela média de quantidade vendida nas últimas safras."
            >
              M.C prevista: {fmtP(margemAtualProjetada.margemLiquidaPct)}%
            </span>
          )}
          <button
            type="button"
            onClick={() => setCustoEstendido((v) => !v)}
            title={
              custoEstendido
                ? 'Mostrando Classe/ID — Frete/Encargos/ML($)/Repres.%/Ajuste ficam resumidos (só Preço+ML%) enquanto isso'
                : 'Estender pra ver Classe/ID — Frete/Encargos/ML($)/Repres.%/Ajuste ficam resumidos (só Preço+ML%) enquanto isso'
            }
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-normal whitespace-nowrap ${custoEstendido ? 'bg-[var(--color-accent)] text-[#04241A]' : 'bg-white/15 text-white hover:bg-white/25'}`}
          >
            {custoEstendido ? 'Recolher' : 'Estender'}
          </button>
          {onAtualizarItemCatalogo && publicacaoPendentePorProduto.size > 0 && (
            <button
              type="button"
              onClick={publicarTodosPendentes}
              disabled={publicandoPendentes}
              title="Publica (ou remove) de uma vez só os produtos com preço/ativação pendente desde a última publicação, sem mexer no resto"
              className="shrink-0 rounded-full bg-warn px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-[#4A2E00] hover:brightness-95 disabled:cursor-wait disabled:opacity-70"
            >
              {publicandoPendentes ? 'Publicando…' : `🌐 Publicar ${publicacaoPendentePorProduto.size} pendente${publicacaoPendentePorProduto.size > 1 ? 's' : ''}`}
            </button>
          )}
          <span className="ml-auto">
            <SeletorCriterioRepresentacao
              criterio={criterioRepresentacao}
              ordenarAtivo={ordenarPorRepresentacao}
              onEscolher={(c) => {
                setCriterioRepresentacao(c);
                setOrdenarPorRepresentacao(true);
              }}
              onDesativarOrdenacao={() => setOrdenarPorRepresentacao(false)}
              sobreFundoEscuro
            />
          </span>
        </>
      }
      onClose={onFechar}
      widthClassName="max-w-[95vw]"
    >
      <div className="max-h-[75vh]">
        {canal && carregandoHistorico && (
          <p className="mb-2 text-xs text-[var(--color-text-soft)]">Carregando histórico de safras…</p>
        )}
        {canal && (
          <PricingTable
            produtos={produtosFiltrados}
            categorias={categorias}
            subcategorias={subcategorias}
            fornecedores={fornecedores}
            canaisVisiveis={[canal]}
            todosCanais={todosCanais}
            transportadoras={transportadoras}
            // Ver o toggle "Estender" (setCustoEstendido) no cabeçalho — as duas nunca ficam
            // detalhadas ao mesmo tempo, senão a grade fica larga demais mesmo em tela cheia.
            mostrarDetalhesFixos={custoEstendido}
            mostrarDetalhesTabelas={!custoEstendido}
            onUpdatePreco={onUpdatePreco}
            onResetPreco={onResetPreco}
            onResetTodosPrecos={onResetTodosPrecos}
            onTogglePrecisaAjuste={onTogglePrecisaAjuste}
            onAtualizarValorKg={onAtualizarValorKg}
            onAtualizarItemCatalogo={onAtualizarItemCatalogo ? atualizarItemEinvalidar : undefined}
            publicacaoPendentePorProduto={publicacaoPendentePorProduto}
            historicoSafras={safrasDisponiveis}
            historicoPorCodigo={historicoPorCodigo}
            margemAgregadaPorSafra={margemAgregadaPorSafra}
            representatividadePorProduto={representatividadePorProduto}
            resolverDescontoBi={resolverDescontoBi}
            ordenadoPorRepresentacao={ordenarPorRepresentacao}
            onAbrirGraficoRepresentacao={() => setGraficoAberto(true)}
            onAbrirGraficoProduto={setProdutoGraficoLinha}
            somenteCanal
          />
        )}
      </div>
      <GraficoRepresentacaoModal
        open={graficoAberto}
        onFechar={() => setGraficoAberto(false)}
        titulo={`Representação — ${canal?.nome ?? ''}`}
        criterio={criterioRepresentacao}
        onEscolherCriterio={setCriterioRepresentacao}
        produtos={produtos}
        representatividadePorProduto={representatividadeGraficoPorProduto}
        filtroAtivo={filtroAtivoGrafico}
        agruparPorNomeEClasse={agruparPorNomeEClasse}
        historicoSafras={todasSafrasDisponiveis}
        safraSelecionada={safraSelecionadaGrafico}
        onEscolherSafra={setSafraSelecionadaGrafico}
      />
      <GraficoCurvaMensalModal
        produto={produtoGraficoLinha}
        onFechar={() => setProdutoGraficoLinha(null)}
        criterio={criterioRepresentacao}
        onEscolherCriterio={setCriterioRepresentacao}
        items={itemsAgregados}
        produtos={produtos}
      />
    </Modal>
  );
}
