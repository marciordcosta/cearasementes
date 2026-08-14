import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { fetchVendaItens, fetchVendas } from '@/features/bi/api';
import { agregarItens } from '@/features/bi/aggregate';
import type { Transportadora } from '@/features/fretes/types';
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
}: ChannelFullscreenModalProps) {
  const [busca, setBusca] = useState('');
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
            // Sempre "Mais detalhes" aqui — é a tela cheia de UMA Tabela, tem espaço de sobra
            // e o usuário já veio pra examinar essa Tabela a fundo (o toggle da barra de
            // ferramentas principal segue só valendo pra grade compacta com várias Tabelas lado a lado).
            mostrarMaisDetalhes
            onUpdatePreco={onUpdatePreco}
            onResetPreco={onResetPreco}
            onResetTodosPrecos={onResetTodosPrecos}
            onTogglePrecisaAjuste={onTogglePrecisaAjuste}
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
