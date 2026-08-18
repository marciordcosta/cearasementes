import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { fetchArquivosLaudos, fetchFatoresPlantio, fetchParametrizacaoProdutos } from '@/features/arquivos/api';
import { fetchVendaItens, fetchVendas } from '@/features/bi/api';
import { agregarItens } from '@/features/bi/aggregate';
import type { Transportadora } from '@/features/fretes/types';
import { fetchPrecosCatalogoPublicoPorCanal, type DadosPlantioCatalogo } from '../api';
import { statusPublicacaoPendente } from '../calculations';
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
  /** Já vem recortado pelo filtro/busca da grade principal — só pra exibir/buscar aqui dentro. */
  produtos: Produto[];
  /** SEM filtro/busca (só respeita a desativação de Fornecedor "Grade") — usado só pra calcular
   * publicacaoPendentePorProduto/publicarTodosPendentes, pra "Publicar" nunca deixar pendência de
   * fora por causa de um filtro/busca esquecido na tela (mesma regra de publicarUmCatalogo em
   * PricingPage.tsx). Sem essa prop, cai pra `produtos` (compatível, mas aí volta a respeitar o filtro). */
  produtosParaPublicar?: Produto[];
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
  /** Atalho de "Imprimir" (botão direito na linha) — desativa/reativa o produto em TODAS as Tabelas de uma vez. */
  onToggleImprimir?: (produtoId: string, valor: boolean) => void;
  onAtualizarValorKg?: (produtoId: string, valorKg: number) => void;
  /** Ícone 🌐 por produto (só aqui, na tela cheia por canal) — atualiza só ESSE item no Catálogo Online já publicado, sem republicar a Tabela inteira. Devolve se deu certo. `dadosPlantio` é buscado UMA VEZ (ver publicarTodosPendentes) antes do loop, não a cada item. */
  onAtualizarItemCatalogo?: (produtoId: string, canal: Canal, dadosPlantio: DadosPlantioCatalogo) => Promise<boolean>;
}

export function ChannelFullscreenModal({
  canal,
  produtos,
  produtosParaPublicar,
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
  onToggleImprimir,
  onAtualizarValorKg,
  onAtualizarItemCatalogo,
}: ChannelFullscreenModalProps) {
  const [busca, setBusca] = useState('');
  // Desligado (padrão) = bloco fixo mostra só Produto/Fornecedor/Peso (Classe, ID e Custo somem).
  // Ligado ("Estender") = abre Classe/ID/Custo também — as colunas de cada Tabela (Preço/Frete/
  // Encargos/ML%/ML$/Repres.%/Ajuste) ficam sempre completas aqui, com ou sem isso ligado (só 1
  // Tabela em tela cheia, tem espaço de sobra — ver mostrarDetalhesTabelas fixo abaixo).
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
   * produtoId -> tipo de mudança pendente desde a última publicação (ver statusPublicacaoPendente em
   * calculations.ts) — usado só pra saber QUANTOS/QUAIS itens publicar no botão "🌐 Publicar N
   * pendentes" (ver publicarTodosPendentes) — não tem mais coluna própria na grade (ver
   * PricingTable.tsx, o 🌐 por item saiu, o botão global já resolve). Roda sobre
   * `produtosParaPublicar` (SEM filtro/busca) quando disponível — senão cai pra `produtos` (que já
   * vem filtrado), mas aí "Publicar" passa a respeitar o filtro sem querer.
   */
  const publicacaoPendentePorProduto = useMemo(() => {
    if (!canal) return new Map<string, 'novo' | 'preco' | 'remover'>();
    const mapa = new Map<string, 'novo' | 'preco' | 'remover'>();
    (produtosParaPublicar ?? produtos).forEach((p) => {
      const categoria = categorias.find((c) => c.id === p.categoriaId) ?? categorias[0];
      const subcategoria = p.subcategoriaId ? subcategorias.find((s) => s.id === p.subcategoriaId) : undefined;
      const fornecedorVisivelPdf = fornecedorPorId.get(p.fornecedorId ?? '')?.visivelPdf ?? true;
      const status = statusPublicacaoPendente(p, canal, precosPublicados.get(p.id), categoria, subcategoria, transportadoraPorId, canaisPorId, resolverDescontoBi, fornecedorVisivelPdf);
      if (status) mapa.set(p.id, status);
    });
    return mapa;
  }, [produtos, produtosParaPublicar, canal, categorias, subcategorias, transportadoraPorId, canaisPorId, resolverDescontoBi, fornecedorPorId, precosPublicados]);

  const [publicandoPendentes, setPublicandoPendentes] = useState(false);
  const queryClient = useQueryClient();

  /** Envolve o 🌐 (individual e em lote) pra invalidar precosPublicados depois de publicar/remover — senão o destaque de pendência ficava desatualizado até fechar e reabrir o modal. */
  async function atualizarItemEinvalidar(produtoId: string, canalArg: Canal, dadosPlantio: DadosPlantioCatalogo): Promise<boolean> {
    if (!onAtualizarItemCatalogo) return false;
    const ok = await onAtualizarItemCatalogo(produtoId, canalArg, dadosPlantio);
    if (ok) queryClient.invalidateQueries({ queryKey: ['pricing', 'catalogoPublicoPrecos', canalArg.id] });
    return ok;
  }

  /**
   * Botão "global" — publica (ou remove) de uma vez todos os itens com pendência (ver
   * publicacaoPendentePorProduto), reaproveitando o MESMO onAtualizarItemCatalogo do 🌐 por item, um
   * de cada vez. Busca os dados de plantio UMA VEZ antes do loop (não a cada item) — buscar de novo
   * por item multiplicava 3 requisições paginadas por pendência e travava a tela com poucas dezenas.
   */
  async function publicarTodosPendentes() {
    if (!canal || !onAtualizarItemCatalogo || publicacaoPendentePorProduto.size === 0) return;
    setPublicandoPendentes(true);
    try {
      const [arquivosLaudos, parametrizacaoProdutos, fatoresPlantio] = await Promise.all([
        fetchArquivosLaudos(),
        fetchParametrizacaoProdutos(),
        fetchFatoresPlantio(),
      ]);
      const dadosPlantio: DadosPlantioCatalogo = { arquivosLaudos, parametrizacaoProdutos, fatoresPlantio };
      for (const produtoId of publicacaoPendentePorProduto.keys()) {
        await atualizarItemEinvalidar(produtoId, canal, dadosPlantio);
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
            // Mesmos campos da busca da grade principal (ver produtosFiltrados em PricingPage.tsx) —
            // nome, fornecedor, categoria, subcategoria (Processo) e cultivar, não só nome/fornecedor.
            const fornecedor = p.fornecedorId ? fornecedorPorId.get(p.fornecedorId) : undefined;
            const categoria = categorias.find((c) => c.id === p.categoriaId);
            const subcategoria = p.subcategoriaId ? subcategorias.find((s) => s.id === p.subcategoriaId) : undefined;
            const descricao = `${p.nome} ${fornecedor?.nome ?? ''} ${categoria?.nome ?? ''} ${subcategoria?.nome ?? ''} ${p.cultivar ?? ''}`.toLowerCase();
            return palavras.every((palavra) => descricao.includes(palavra));
          });
    if (!ordenarPorRepresentacao) return filtrados;
    // Maior Representação primeiro — produto sem dado (Código não batendo) vai pro final.
    return [...filtrados].sort((a, b) => (representatividadePorProduto.get(b.id)?.pct ?? -1) - (representatividadePorProduto.get(a.id)?.pct ?? -1));
  }, [produtos, busca, fornecedorPorId, categorias, subcategorias, ordenarPorRepresentacao, representatividadePorProduto]);

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
                ? 'Recolher — volta a mostrar só Produto/Fornecedor/Peso'
                : 'Estender pra ver Classe/ID/Custo também'
            }
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-normal whitespace-nowrap ${custoEstendido ? 'bg-[var(--color-accent)] text-[#04241A]' : 'bg-white/15 text-white hover:bg-white/25'}`}
          >
            {custoEstendido ? 'Recolher' : 'Estender'} <span className="opacity-75">⤢</span>
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
            // Bloco fixo (Classe/ID/Custo) começa recolhido — só Produto/Fornecedor/Peso — e o botão
            // "Estender" no cabeçalho do modal (acima) abre os três juntos. As colunas de cada Tabela
            // (Preço/Frete/Encargos/ML%/ML$/Repres.%/Ajuste) ficam sempre completas aqui, com ou sem
            // isso ligado — só 1 Tabela em tela cheia, tem espaço de sobra. (O cabeçalho de grupo com
            // o ícone "Estender ⤢" da grade principal não existe aqui — somenteCanal esconde essa
            // linha, já que só tem 1 Tabela; por isso o toggle vive no título do modal, não na grade.)
            mostrarDetalhesFixos={custoEstendido}
            mostrarCusto={custoEstendido}
            mostrarDetalhesTabelas
            onUpdatePreco={onUpdatePreco}
            onResetPreco={onResetPreco}
            onResetTodosPrecos={onResetTodosPrecos}
            onTogglePrecisaAjuste={onTogglePrecisaAjuste}
            onToggleImprimir={onToggleImprimir}
            onAtualizarValorKg={onAtualizarValorKg}
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
