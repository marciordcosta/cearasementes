import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Gauge, Loader2, Truck } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { fetchArquivosLaudos, fetchFatoresPlantio, fetchParametrizacaoProdutos } from '@/features/arquivos/api';
import { resolverPlantioParaProduto } from '@/features/arquivos/calculoSemeadura';
import { agregarItens } from '@/features/bi/aggregate';
import { fetchVendaItens, fetchVendas } from '@/features/bi/api';
import { aplicarTransportadoraNoCanal, fetchTransportadoras } from '@/features/fretes/api';
import {
  apagarCanal,
  apagarCategoria,
  apagarCustoPersonalizado,
  apagarFornecedor,
  apagarProduto,
  apagarSubcategoria,
  apagarSubcategoriaMargem,
  apagarTodosProdutos,
  atualizarCanal,
  atualizarCategoria,
  atualizarCustoPersonalizado,
  atualizarFornecedor,
  atualizarPrecisaAjuste,
  atualizarProduto,
  atualizarSubcategoria,
  fetchCanais,
  fetchCategorias,
  fetchCustosPersonalizados,
  fetchFornecedores,
  fetchProdutos,
  fetchSubcategorias,
  inserirCanal,
  inserirCategoria,
  inserirCustoPersonalizado,
  inserirFornecedor,
  inserirProduto,
  inserirSubcategoria,
  publicarCatalogoOnline,
  upsertCategoriaMargem,
  upsertCategoriaMargemTolerancia,
  upsertCategoriaReferencia,
  upsertCategoriaReferenciaAjuste,
  upsertProdutoPreco,
  upsertSubcategoriaMargem,
} from '@/features/pricing/api';
import { gerarCatalogoGerenciamentoPDF, gerarCatalogoPDF } from '@/features/pricing/catalogoPdf';
import { calcularCanal, ordenarProdutos, resolverFreteEfetivo } from '@/features/pricing/calculations';
import { AddProductForm } from '@/features/pricing/components/AddProductForm';
import { CategoryMarginsPanel } from '@/features/pricing/components/CategoryMarginsPanel';
import { ChannelFullscreenModal } from '@/features/pricing/components/ChannelFullscreenModal';
import { ChannelsPanel, type NovoCanalInput } from '@/features/pricing/components/ChannelsPanel';
import { CompraModal } from '@/features/pricing/components/CompraModal';
import { CustosPersonalizadosPanel } from '@/features/pricing/components/CustosPersonalizadosPanel';
import { EditProductModal } from '@/features/pricing/components/EditProductModal';
import { ExportDropdown } from '@/features/pricing/components/ExportDropdown';
import { ExportPdfModal } from '@/features/pricing/components/ExportPdfModal';
import { FornecedoresPanel } from '@/features/pricing/components/FornecedoresPanel';
import { OrderModal } from '@/features/pricing/components/OrderModal';
import { PricingTable } from '@/features/pricing/components/PricingTable';
import { GraficoCurvaMensalModal } from '@/features/pricing/components/GraficoCurvaMensalModal';
import { GraficoRepresentacaoModal } from '@/features/pricing/components/GraficoRepresentacaoModal';
import { MargemResumoModal } from '@/features/pricing/components/MargemResumoModal';
import { ReorderDropdown } from '@/features/pricing/components/ReorderDropdown';
import { SeletorCriterioRepresentacao } from '@/features/pricing/components/SeletorCriterioRepresentacao';
import {
  calcularMargemAtualProjetada,
  calcularRepresentatividadeGeral,
  calcularRepresentatividadePorCanal,
  construirDescontoUltimaSafraPorCanal,
  construirHistoricoPorCodigo,
  listarTodasSafrasGeral,
  resolverDescontoEfetivo,
  temDescontoBiParaProduto,
  type CriterioRepresentacao,
} from '@/features/pricing/historicoBi';
import type { Canal, Categoria, CustoPersonalizado, Fornecedor, FreteAdicionalTipo, Produto, Subcategoria, TipoImposto } from '@/features/pricing/types';
import { mensagemDeErro } from '@/lib/errors';

type CampoNumericoCanal = 'desconto' | 'comissao' | 'cartao' | 'outrosEncargos' | 'freteKg' | 'fretePct' | 'freteAdicionalValor';

const CAMPO_PARA_COLUNA: Record<CampoNumericoCanal, string> = {
  desconto: 'desconto',
  comissao: 'comissao',
  cartao: 'cartao',
  outrosEncargos: 'outros_encargos',
  freteKg: 'frete_kg',
  fretePct: 'frete_pct',
  freteAdicionalValor: 'frete_adicional_valor',
};

export function PricingPage() {
  const queryClient = useQueryClient();
  const { data: canaisData } = useQuery({ queryKey: ['pricing', 'canais'], queryFn: fetchCanais });
  const { data: transportadoras = [] } = useQuery({ queryKey: ['fretes', 'transportadoras'], queryFn: fetchTransportadoras });
  const transportadoraPorId = useMemo(() => new Map(transportadoras.map((t) => [t.id, t])), [transportadoras]);
  const { data: categoriasData } = useQuery({ queryKey: ['pricing', 'categorias'], queryFn: fetchCategorias });
  const { data: subcategoriasData } = useQuery({ queryKey: ['pricing', 'subcategorias'], queryFn: fetchSubcategorias });
  const { data: produtosData } = useQuery({ queryKey: ['pricing', 'produtos'], queryFn: fetchProdutos });
  const { data: fornecedoresData } = useQuery({ queryKey: ['pricing', 'fornecedores'], queryFn: fetchFornecedores });
  const { data: custosData } = useQuery({ queryKey: ['pricing', 'custos'], queryFn: fetchCustosPersonalizados });

  // Estado local "espelha" o Supabase uma única vez ao carregar (feito pra
  // edição instantânea, tipo planilha) — depois disso, a fonte da verdade
  // pra tela é o estado local, sincronizado em background pelas chamadas
  // de API abaixo. Não refazemos o seed em todo refetch pra não perder
  // edição em andamento do usuário.
  const seeded = useRef(false);
  const [canais, setCanais] = useState<Canal[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [custos, setCustos] = useState<CustoPersonalizado[]>([]);

  useEffect(() => {
    if (seeded.current || !canaisData || !categoriasData || !subcategoriasData || !produtosData || !fornecedoresData || !custosData) return;
    setCanais(canaisData);
    setCategorias(categoriasData);
    setSubcategorias(subcategoriasData);
    setProdutos(ordenarProdutos(produtosData, categoriasData));
    setFornecedores(fornecedoresData);
    setCustos(custosData);
    seeded.current = true;
  }, [canaisData, categoriasData, subcategoriasData, produtosData, fornecedoresData, custosData]);

  const [modalParametrizacaoAberto, setModalParametrizacaoAberto] = useState(false);
  const [abaParametrizacao, setAbaParametrizacao] = useState<'tabelas' | 'categorias' | 'fornecedores' | 'custos'>('tabelas');
  const [buscaProduto, setBuscaProduto] = useState('');
  const [filtroClasse, setFiltroClasse] = useState('todas');
  const [mostrarMaisDetalhes, setMostrarMaisDetalhes] = useState(false);
  const [modalMargemAberto, setModalMargemAberto] = useState(false);
  const [modalCompraAberto, setModalCompraAberto] = useState(false);
  const [ordenarPorRepresentacao, setOrdenarPorRepresentacao] = useState(false);
  const [criterioRepresentacao, setCriterioRepresentacao] = useState<CriterioRepresentacao>('valor');
  const [graficoRepresentacaoAberto, setGraficoRepresentacaoAberto] = useState(false);
  // null = média das últimas safras (padrão) — só afeta o gráfico de Representação Geral, não a grade.
  const [safraSelecionadaGrafico, setSafraSelecionadaGrafico] = useState<string | null>(null);
  const [produtoGraficoLinha, setProdutoGraficoLinha] = useState<Produto | null>(null);
  const [produtoEditandoId, setProdutoEditandoId] = useState<string | null>(null);
  const [canalTelaCheiaId, setCanalTelaCheiaId] = useState<string | null>(null);
  const [modalOrdemTipo, setModalOrdemTipo] = useState<'categorias' | 'canais' | null>(null);
  const [modalPdfAberto, setModalPdfAberto] = useState(false);
  const [modoExportacaoPdf, setModoExportacaoPdf] = useState<'padrao' | 'gerenciamento' | 'online'>('padrao');
  const [linkCatalogoPublicado, setLinkCatalogoPublicado] = useState<{ canalNome: string; url: string } | null>(null);
  const [publicandoCatalogo, setPublicandoCatalogo] = useState(false);
  const [modalLimparAberto, setModalLimparAberto] = useState(false);
  const [limpandoTabela, setLimpandoTabela] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const debounced = useDebouncedCallback((acao: () => Promise<void>) => {
    acao().catch((e: unknown) => setErro(mensagemDeErro(e, 'Falha ao salvar no Supabase.')));
  }, 500);

  function salvarAgora(acao: () => Promise<void>) {
    acao().catch((e: unknown) => setErro(mensagemDeErro(e, 'Falha ao salvar no Supabase.')));
  }

  // Essa página mantém sua própria cópia local de `produtos` (ver comentário acima) e nunca
  // volta a ler a query — mas outras telas que também usam produtos da Tabela de Preço (ex.:
  // Guia de Plantio, em Arquivos) leem direto da query `['pricing','produtos']` e não têm
  // como saber que mudou aqui. Sem isso, elas ficam com o nome/peso/custo antigo até a página
  // ser recarregada inteira.
  function invalidarProdutosPreco() {
    queryClient.invalidateQueries({ queryKey: ['pricing', 'produtos'] });
  }

  const canaisVisiveis = canais.filter((c) => c.visivel);

  // Selo "MB atual" na barra de ferramentas — mesma conta do modal de tela cheia por canal (ver
  // historicoBi.ts), só que somando TODAS as Tabelas visíveis de uma vez. Mesma queryKey do
  // Dashboard/modal, então reaproveita o cache se algum dos dois já tiver sido aberto na sessão.
  const { data: vendasBi = [], isLoading: carregandoVendasBi } = useQuery({ queryKey: ['bi', 'vendas'], queryFn: fetchVendas });
  const { data: itensBi = [], isLoading: carregandoItensBi } = useQuery({ queryKey: ['bi', 'itens'], queryFn: fetchVendaItens });
  // Enquanto isso não termina, MB/M.C./Repres./Desconto real ainda mostram os valores "sem BI"
  // (fallback automático, ver resolverDescontoBi) — o ícone da barra de ferramentas avisa disso.
  const carregandoBi = carregandoVendasBi || carregandoItensBi;
  const itemsAgregadosBi = useMemo(() => agregarItens(vendasBi, itensBi), [vendasBi, itensBi]);
  const canaisPorId = useMemo(() => new Map(canais.map((c) => [c.id, c])), [canais]);
  // Desconto médio REAL (última Safra, ver historicoBi.ts) por canal+produto — fonte primária do
  // Encargos "Desconto" em calcularCanal, no lugar do Canal.desconto cadastrado; sem dado do BI pra
  // esse canal+produto, calcularCanal cai sozinho pro cadastrado (ver resolverDescontoEfetivo).
  const descontoBiPorCanalECodigo = useMemo(() => construirDescontoUltimaSafraPorCanal(canais, itemsAgregadosBi), [canais, itemsAgregadosBi]);
  // Opt-in por produto (ver EditProductModal.tsx) — sem marcar "Usar desconto real", calcularCanal
  // sempre cai pro Canal.desconto cadastrado, mesmo com dado do BI disponível pra esse produto.
  const resolverDescontoBi = useMemo(
    () => (canal: Canal, produto: Produto) => (produto.usarDescontoReal ? resolverDescontoEfetivo(descontoBiPorCanalECodigo, canal.id, produto.codigo) : null),
    [descontoBiPorCanalECodigo],
  );
  // Coluna "Repres. Geral (%)" — soma a média de valor vendido de cada produto em TODAS as
  // Tabelas (não só uma), então precisa rodar de novo só quando produtos/canais/histórico mudam.
  const representatividadeGeralPorProduto = useMemo(
    () => calcularRepresentatividadeGeral(produtos, canais, itemsAgregadosBi, criterioRepresentacao),
    [produtos, canais, itemsAgregadosBi, criterioRepresentacao],
  );
  // Só pro gráfico de Representação Geral (colunas/pizza) — a grade principal (coluna "Repres.
  // Geral (%)") sempre usa a média acima, sem a opção de ver uma safra específica.
  const representatividadeGeralGraficoPorProduto = useMemo(
    () => calcularRepresentatividadeGeral(produtos, canais, itemsAgregadosBi, criterioRepresentacao, safraSelecionadaGrafico ?? undefined),
    [produtos, canais, itemsAgregadosBi, criterioRepresentacao, safraSelecionadaGrafico],
  );
  const todasSafrasDisponiveisGeral = useMemo(() => listarTodasSafrasGeral(canais, itemsAgregadosBi), [canais, itemsAgregadosBi]);
  let margemAtualTotalValor = 0;
  let margemAtualTotalMargem = 0;
  let margemAtualTotalMargemLiquida = 0;
  let margemAtualTotalFrete = 0;
  let margemAtualTotalEncargos = 0;
  let margemAtualTotalDesconto = 0;
  for (const canal of canaisVisiveis) {
    const historicoPorCodigo = construirHistoricoPorCodigo(itemsAgregadosBi, canal.nome);
    const r = calcularMargemAtualProjetada(produtos, canal, categorias, subcategorias, transportadoraPorId, canaisPorId, historicoPorCodigo);
    margemAtualTotalValor += r.valorProjetado;
    margemAtualTotalMargem += r.margemProjetada;
    margemAtualTotalMargemLiquida += r.margemLiquidaProjetada;
    margemAtualTotalFrete += r.freteProjetado;
    margemAtualTotalEncargos += r.encargosProjetado;
    margemAtualTotalDesconto += r.descontoProjetado;
  }
  const margemAtualTotalPct = margemAtualTotalValor > 0 ? (margemAtualTotalMargem / margemAtualTotalValor) * 100 : 0;
  const margemAtualTotalLiquidaPct = margemAtualTotalValor > 0 ? (margemAtualTotalMargemLiquida / margemAtualTotalValor) * 100 : 0;
  // Fornecedor (custo do produto) = Valor - Margem Bruta — mesma relação usada em todo o resto (r.margemReais etc.). Base do DRE no MargemResumoModal.
  const margemAtualTotalFornecedor = margemAtualTotalValor - margemAtualTotalMargem;
  const produtoEditando = produtos.find((p) => p.id === produtoEditandoId) ?? null;
  const canalTelaCheia = canais.find((c) => c.id === canalTelaCheiaId) ?? null;
  const fornecedorPorId = new Map(fornecedores.map((f) => [f.id, f]));
  const produtosFiltrados = produtos
    // Fornecedor com "Grade" desmarcada some da Tabela de Preços inteira (e, por consequência, do PDF também).
    .filter((p) => (p.fornecedorId ? (fornecedorPorId.get(p.fornecedorId)?.visivelGrade ?? true) : true))
    .filter((p) => {
      if (filtroClasse === 'todas') return true;
      if (filtroClasse.startsWith('cat:')) return p.categoriaId === filtroClasse.slice(4);
      if (filtroClasse.startsWith('forn:')) return p.fornecedorId === filtroClasse.slice(5);
      if (filtroClasse.startsWith('sub:')) return p.subcategoriaId === filtroClasse.slice(4);
      return true;
    })
    .filter((p) => {
      const palavras = buscaProduto.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (palavras.length === 0) return true;
      const fornecedor = p.fornecedorId ? fornecedorPorId.get(p.fornecedorId) : undefined;
      const categoria = categorias.find((c) => c.id === p.categoriaId);
      const subcategoria = p.subcategoriaId ? subcategorias.find((s) => s.id === p.subcategoriaId) : undefined;
      // Nem todo nome de produto carrega a Categoria/Subcategoria dele (ex.: "Semente XYZ 123" na
      // Classe "Milho") — busca também nesses nomes, não só no nome do produto e do fornecedor.
      const descricao = `${p.nome} ${fornecedor?.nome ?? ''} ${categoria?.nome ?? ''} ${subcategoria?.nome ?? ''}`.toLowerCase();
      return palavras.every((palavra) => descricao.includes(palavra));
    });
  // Só o rótulo do "Filtrar:" (Categoria/Subcategoria/Fornecedor) — sem a busca por nome. Reaproveitado
  // no gráfico da grade principal E passado pra tela cheia por Tabela, pra ela saber que um filtro
  // "de fora" (não só a busca dela mesma) já está recortando os produtos que ela recebeu.
  const rotuloFiltroClasse = useMemo(() => {
    if (filtroClasse.startsWith('cat:')) return categorias.find((cat) => cat.id === filtroClasse.slice(4))?.nome ?? null;
    if (filtroClasse.startsWith('forn:')) return fornecedores.find((f) => f.id === filtroClasse.slice(5))?.nome ?? null;
    if (filtroClasse.startsWith('sub:')) return subcategorias.find((s) => s.id === filtroClasse.slice(4))?.nome ?? null;
    return null;
  }, [filtroClasse, categorias, subcategorias, fornecedores]);

  // Filtro Categoria/Fornecedor E/OU busca por nome, os dois juntos — qualquer um dos dois ativo já
  // vira o gráfico de Representação Geral em pizza (participação dentro do que está filtrado/buscado
  // na grade); sem nenhum dos dois, volta pro formato em colunas (todo o sortimento).
  const filtroAtivoGrafico = useMemo(() => {
    const buscaAtiva = buscaProduto.trim().length > 0;
    if (!rotuloFiltroClasse && !buscaAtiva) return null;
    const partesRotulo = [rotuloFiltroClasse, buscaAtiva ? `"${buscaProduto.trim()}"` : null].filter((parte): parte is string => parte !== null);
    return { rotulo: partesRotulo.join(' + '), produtoIds: new Set(produtosFiltrados.map((p) => p.id)) };
  }, [rotuloFiltroClasse, buscaProduto, produtosFiltrados]);

  // Participação de cada Tabela nas vendas dos itens em vista (mesmo recorte de filtroAtivoGrafico,
  // ou todo o sortimento sem filtro) — só pro ícone "Tabelas" do gráfico de Representação Geral.
  const representatividadePorCanalGrafico = useMemo(
    () =>
      calcularRepresentatividadePorCanal(
        produtos,
        canais,
        itemsAgregadosBi,
        criterioRepresentacao,
        filtroAtivoGrafico?.produtoIds,
        safraSelecionadaGrafico ?? undefined,
      ),
    [produtos, canais, itemsAgregadosBi, criterioRepresentacao, filtroAtivoGrafico, safraSelecionadaGrafico],
  );

  // Maior Representação Geral primeiro — produto sem dado (Código não batendo) vai pro final.
  const produtosExibidos = !ordenarPorRepresentacao
    ? produtosFiltrados
    : [...produtosFiltrados].sort(
        (a, b) => (representatividadeGeralPorProduto.get(b.id)?.pct ?? -1) - (representatividadeGeralPorProduto.get(a.id)?.pct ?? -1),
      );

  // ---------- Produtos ----------
  function onUpdatePreco(produtoId: string, canalId: string, preco: number) {
    setProdutos((prev) =>
      prev.map((p) => (p.id === produtoId ? { ...p, precos: { ...p.precos, [canalId]: { ...p.precos[canalId], preco, manual: true } } } : p)),
    );
    debounced(`produto-preco-${produtoId}-${canalId}`, () => upsertProdutoPreco(produtoId, canalId, preco, true).then(invalidarProdutosPreco));
  }

  /** Edição em lote do Valor Kg direto na grade (ícone ✎ ao lado de "Custo") — custo = valorKg x peso, mesma conta do Editar Produto. */
  function onAtualizarValorKg(produtoId: string, valorKg: number) {
    const produto = produtos.find((p) => p.id === produtoId);
    if (!produto) return;
    const custo = valorKg * produto.peso;
    setProdutos((prev) => prev.map((p) => (p.id === produtoId ? { ...p, valorKg, custo } : p)));
    debounced(`produto-valor-kg-${produtoId}`, () => atualizarProduto(produtoId, { valor_kg: valorKg, custo }).then(invalidarProdutosPreco));
  }

  function onResetPreco(produtoId: string, canalId: string) {
    setProdutos((prev) =>
      prev.map((p) => (p.id === produtoId ? { ...p, precos: { ...p.precos, [canalId]: { ...p.precos[canalId], preco: null, manual: false } } } : p)),
    );
    salvarAgora(() => upsertProdutoPreco(produtoId, canalId, null, false).then(invalidarProdutosPreco));
  }

  /** Restaura o preço sugerido de todos os produtos que estão manuais nessa tabela — ícone ↺ ao lado do rótulo "Preço". */
  function onResetTodosPrecos(canalId: string) {
    const idsParaResetar = produtos.filter((p) => p.precos[canalId]?.manual).map((p) => p.id);
    if (idsParaResetar.length === 0) return;
    setProdutos((prev) =>
      prev.map((p) => (idsParaResetar.includes(p.id) ? { ...p, precos: { ...p.precos, [canalId]: { ...p.precos[canalId], preco: null, manual: false } } } : p)),
    );
    salvarAgora(async () => {
      for (const produtoId of idsParaResetar) {
        await upsertProdutoPreco(produtoId, canalId, null, false);
      }
      invalidarProdutosPreco();
    });
  }

  function onTogglePrecisaAjuste(produtoId: string, canalId: string, valor: boolean) {
    setProdutos((prev) =>
      prev.map((p) => (p.id === produtoId ? { ...p, precos: { ...p.precos, [canalId]: { ...p.precos[canalId], precisaAjuste: valor } } } : p)),
    );
    salvarAgora(() => atualizarPrecisaAjuste(produtoId, canalId, valor).then(invalidarProdutosPreco));
  }

  function onRemoverProduto(produtoId: string) {
    setProdutos((prev) => prev.filter((p) => p.id !== produtoId));
    salvarAgora(() => apagarProduto(produtoId).then(invalidarProdutosPreco));
  }

  async function onAdicionarProduto(input: { nome: string; categoriaId: string; peso: number; valorKg: number; custo: number }) {
    try {
      // Sem código automático — um código inventado (ex.: sequencial) pode coincidir por acaso com
      // o Código Interno real de outro produto no Max Manager e puxar histórico de vendas errado
      // (ver colunas de Safra/MB/M.C. e Representação, que cruzam por Código). Fica em branco até o
      // usuário preencher o código de verdade em "Editar Produto".
      const produto = await inserirProduto({ ...input, codigo: null }, canais);
      setProdutos((prev) => ordenarProdutos([...prev, produto], categorias));
      invalidarProdutosPreco();
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao adicionar produto.'));
    }
  }

  function onSalvarEdicaoProduto(patch: {
    nome: string;
    codigo: string;
    categoriaId: string;
    subcategoriaId: string | null;
    valorKg: number;
    custo: number;
    peso: number;
    despesaExtraValor: number;
    cubagem: string | null;
    fornecedorId: string | null;
    imprimir: boolean;
    usarDescontoReal: boolean;
  }) {
    if (!produtoEditandoId) return;
    setProdutos((prev) =>
      ordenarProdutos(
        prev.map((p) =>
          p.id === produtoEditandoId
            ? {
                ...p,
                nome: patch.nome,
                codigo: patch.codigo || null,
                categoriaId: patch.categoriaId,
                subcategoriaId: patch.subcategoriaId,
                valorKg: patch.valorKg,
                custo: patch.custo,
                peso: patch.peso,
                despesaExtraValor: patch.despesaExtraValor,
                cubagem: patch.cubagem,
                fornecedorId: patch.fornecedorId,
                imprimir: patch.imprimir,
                usarDescontoReal: patch.usarDescontoReal,
              }
            : p,
        ),
        categorias,
      ),
    );
    salvarAgora(() =>
      atualizarProduto(produtoEditandoId, {
        nome: patch.nome,
        codigo: patch.codigo || null,
        categoria_id: patch.categoriaId,
        subcategoria_id: patch.subcategoriaId,
        valor_kg: patch.valorKg,
        custo: patch.custo,
        peso: patch.peso,
        despesa_extra_valor: patch.despesaExtraValor,
        cubagem: patch.cubagem,
        fornecedor_id: patch.fornecedorId,
        imprimir: patch.imprimir,
        usar_desconto_real: patch.usarDescontoReal,
      }).then(invalidarProdutosPreco),
    );
    setProdutoEditandoId(null);
  }

  /**
   * "Publicar" o Catálogo Online desse canal — calcula o preço de cada produto elegível AGORA
   * (autenticado, com Custo/Margem em mãos com segurança) e salva só nome+preço+peso já prontos
   * (ver publicarCatalogoOnline em pricing/api.ts) — a página pública nunca lê Custo/Margem.
   * Mesmo filtro do PDF de catálogo (Imprimir + Fornecedor visível no PDF + sem "precisa ajuste"
   * nesse canal), mais Código cadastrado (produto sem Código não teria como ligar ao snapshot).
   */
  async function publicarCatalogo(canal: Canal) {
    setPublicandoCatalogo(true);
    try {
      const getCategoria = (id: string) => categorias.find((c) => c.id === id) ?? categorias[0];
      const getSubcategoria = (id: string | null) => (id ? subcategorias.find((s) => s.id === id) : undefined);
      const getFornecedor = (id: string | null) => (id ? fornecedores.find((f) => f.id === id) : undefined);
      const elegiveis = produtosExibidos.filter(
        (p) => p.imprimir && p.codigo && !(p.precos[canal.id]?.precisaAjuste ?? false) && (getFornecedor(p.fornecedorId)?.visivelPdf ?? true),
      );
      // Dados de plantio (Guia de Plantio) só buscados aqui, no momento de publicar — não fazem parte
      // da carga normal da Precificação (ver resolverPlantioParaProduto em calculoSemeadura.ts).
      const [arquivosLaudos, parametrizacaoProdutos, fatoresPlantio] = await Promise.all([
        fetchArquivosLaudos(),
        fetchParametrizacaoProdutos(),
        fetchFatoresPlantio(),
      ]);
      const itens = ordenarProdutos(elegiveis, categorias).map((p, indice) => {
        const categoria = getCategoria(p.categoriaId);
        const r = calcularCanal(p, canal, categoria, getSubcategoria(p.subcategoriaId), transportadoraPorId, canaisPorId, true, resolverDescontoBi);
        const fornecedorNome = getFornecedor(p.fornecedorId)?.nome ?? null;
        const plantio = resolverPlantioParaProduto(p.nome, arquivosLaudos, parametrizacaoProdutos, fatoresPlantio, fornecedorNome);
        return {
          produtoId: p.id,
          nome: p.nome,
          categoriaNome: categoria.nome,
          subcategoriaNome: getSubcategoria(p.subcategoriaId)?.nome ?? null,
          fornecedorNome,
          preco: r.preco,
          peso: p.peso,
          pesoUsado: r.pesoUsado,
          plantioKgHaLanco: plantio.kgHaLanco,
          plantioSementesCovaBase: plantio.sementesCovaBase,
          plantioPms: plantio.pms,
          plantioVc: plantio.vc,
          plantioPmsManual: plantio.pmsManual,
          plantioValidade: plantio.validade,
          plantioMargemTolerancia: plantio.margemTolerancia,
          ordem: indice,
        };
      });
      const { freteKgEfetivo, fretePctEfetivo, freteMinimo } = resolverFreteEfetivo(canal, transportadoraPorId);
      const slug = await publicarCatalogoOnline(
        canal.id,
        canal.nome,
        freteKgEfetivo,
        fretePctEfetivo,
        freteMinimo,
        canal.transportadoraId !== null,
        canal.whatsapp,
        canal.mostrarDetalhesPlantio,
        itens,
      );
      setLinkCatalogoPublicado({ canalNome: canal.nome, url: `${window.location.origin}/catalogo/${slug}` });
    } catch (e) {
      alert(mensagemDeErro(e, 'Falha ao publicar o Catálogo Online.'));
    } finally {
      setPublicandoCatalogo(false);
    }
  }

  // ---------- Canais ----------
  function onAtualizarCampoCanal(canalId: string, campo: CampoNumericoCanal, valor: number) {
    setCanais((prev) => prev.map((c) => (c.id === canalId ? { ...c, [campo]: valor } : c)));
    debounced(`canal-${canalId}-${campo}`, () => atualizarCanal(canalId, { [CAMPO_PARA_COLUNA[campo]]: valor }));
  }

  function onAtualizarWhatsappCanal(canalId: string, valor: string) {
    const whatsapp = valor || null;
    setCanais((prev) => prev.map((c) => (c.id === canalId ? { ...c, whatsapp } : c)));
    atualizarCanal(canalId, { whatsapp });
  }

  function onAtualizarMostrarDetalhesCanal(canalId: string, valor: boolean) {
    setCanais((prev) => prev.map((c) => (c.id === canalId ? { ...c, mostrarDetalhesPlantio: valor } : c)));
    atualizarCanal(canalId, { mostrar_detalhes_plantio: valor });
  }

  async function onSelecionarTransportadora(canalId: string, transportadoraId: string | null) {
    if (transportadoraId === null) {
      setCanais((prev) => prev.map((c) => (c.id === canalId ? { ...c, transportadoraId: null } : c)));
      salvarAgora(() => atualizarCanal(canalId, { transportadora_id: null }));
      return;
    }

    const transportadora = transportadoras.find((t) => t.id === transportadoraId);
    if (!transportadora) return;
    try {
      const { pctAplicado } = await aplicarTransportadoraNoCanal(canalId, transportadora);
      setCanais((prev) =>
        prev.map((c) =>
          c.id === canalId
            ? { ...c, transportadoraId, freteKg: transportadora.valorPorKg, fretePct: pctAplicado ? transportadora.valorPorNf * 100 : c.fretePct }
            : c,
        ),
      );
      if (!pctAplicado) {
        setErro(
          `${transportadora.nome} cobra NF como valor fixo (R$ ${transportadora.valorPorNf.toFixed(2)}), não como %. O cálculo vai usar o Frete Kg dela ao vivo; o Custo NF continua manual — ajuste em Outros Encargos se precisar refletir no preço.`,
        );
      }
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao aplicar a transportadora no Supabase.'));
    }
  }

  function onAtualizarTipoImposto(canalId: string, valor: TipoImposto) {
    setCanais((prev) => prev.map((c) => (c.id === canalId ? { ...c, tipoImposto: valor } : c)));
    salvarAgora(() => atualizarCanal(canalId, { tipo_imposto: valor }));
  }

  function onAtualizarFreteAdicionalTipo(canalId: string, valor: FreteAdicionalTipo) {
    setCanais((prev) => prev.map((c) => (c.id === canalId ? { ...c, freteAdicionalTipo: valor } : c)));
    salvarAgora(() => atualizarCanal(canalId, { frete_adicional_tipo: valor }));
  }

  function onToggleVisivel(canalId: string, valor: boolean) {
    setCanais((prev) => prev.map((c) => (c.id === canalId ? { ...c, visivel: valor } : c)));
    salvarAgora(() => atualizarCanal(canalId, { visivel: valor }));
  }

  function onToggleFreteIncluso(canalId: string, valor: boolean) {
    setCanais((prev) => prev.map((c) => (c.id === canalId ? { ...c, freteIncluso: valor } : c)));
    salvarAgora(() => atualizarCanal(canalId, { frete_incluso: valor }));
  }

  function onRemoverCanal(canalId: string) {
    if (canais.length <= 1) {
      setErro('É necessário manter ao menos uma Tabela de Preço ativa no sistema.');
      return;
    }
    setCanais((prev) => prev.filter((c) => c.id !== canalId));
    setCategorias((prev) =>
      prev.map((cat) => {
        const margens = { ...cat.margens };
        delete margens[canalId];
        const referenciaCanalId = { ...cat.referenciaCanalId };
        delete referenciaCanalId[canalId];
        Object.keys(referenciaCanalId).forEach((cId) => {
          if (referenciaCanalId[cId] === canalId) delete referenciaCanalId[cId];
        });
        const referenciaAjustePct = { ...cat.referenciaAjustePct };
        delete referenciaAjustePct[canalId];
        return { ...cat, margens, referenciaCanalId, referenciaAjustePct };
      }),
    );
    setSubcategorias((prev) => prev.map((sub) => {
      const margens = { ...sub.margens };
      delete margens[canalId];
      return { ...sub, margens };
    }));
    setProdutos((prev) => prev.map((p) => {
      const precos = { ...p.precos };
      delete precos[canalId];
      return { ...p, precos };
    }));
    salvarAgora(() => apagarCanal(canalId));
  }

  async function onAdicionarCanal(input: NovoCanalInput) {
    if (canais.some((c) => c.nome.toLowerCase() === input.nome.toLowerCase())) {
      setErro('Já existe uma Tabela de Preço com esse nome.');
      return;
    }
    try {
      const canal = await inserirCanal({ ...input, ordem: canais.length });
      setCanais((prev) => [...prev, canal]);
      setCategorias((prev) => prev.map((cat) => ({ ...cat, margens: { ...cat.margens, [canal.id]: 20 } })));
      setProdutos((prev) => prev.map((p) => ({ ...p, precos: { ...p.precos, [canal.id]: { preco: null, manual: false, precisaAjuste: false } } })));
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao adicionar Tabela de Preço.'));
    }
  }

  // ---------- Categorias ----------
  function onAtualizarCategoria(categoriaId: string, campo: 'estadual' | 'interestadual', valor: number) {
    setCategorias((prev) => prev.map((c) => (c.id === categoriaId ? { ...c, [campo]: valor } : c)));
    debounced(`categoria-${categoriaId}-${campo}`, () => atualizarCategoria(categoriaId, { [campo]: valor }));
  }

  function onAtualizarMargem(categoriaId: string, canalId: string, valor: number) {
    setCategorias((prev) => prev.map((c) => (c.id === categoriaId ? { ...c, margens: { ...c.margens, [canalId]: valor } } : c)));
    debounced(`margem-${categoriaId}-${canalId}`, () => upsertCategoriaMargem(categoriaId, canalId, valor));
  }

  /** valor null = apaga a tolerância (sem alerta pra essa categoria+canal). */
  function onAtualizarTolerancia(categoriaId: string, canalId: string, valor: number | null) {
    setCategorias((prev) =>
      prev.map((c) => {
        if (c.id !== categoriaId) return c;
        const tolerancias = { ...c.tolerancias };
        if (valor === null) delete tolerancias[canalId];
        else tolerancias[canalId] = valor;
        return { ...c, tolerancias };
      }),
    );
    debounced(`tolerancia-${categoriaId}-${canalId}`, () => upsertCategoriaMargemTolerancia(categoriaId, canalId, valor));
  }

  /** true = essa Tabela inteira passa a operar "por referência" (a Tabela referenciada em si é escolhida por Categoria, ver onAtualizarCategoriaReferencia). false = volta a calcular por categoria/subcategoria normal. */
  function onAtualizarCanalModoMargem(canalId: string, porReferencia: boolean) {
    setCanais((prev) => prev.map((c) => (c.id === canalId ? { ...c, margemPorReferencia: porReferencia } : c)));
    salvarAgora(() => atualizarCanal(canalId, { margem_por_referencia: porReferencia }));
  }

  /** null = essa categoria ainda não escolheu (ou volta a não ter) referência pra esse canal. */
  function onAtualizarCategoriaReferencia(categoriaId: string, canalId: string, valor: string | null) {
    setCategorias((prev) =>
      prev.map((c) => {
        if (c.id !== categoriaId) return c;
        const referenciaCanalId = { ...c.referenciaCanalId };
        if (valor === null) delete referenciaCanalId[canalId];
        else referenciaCanalId[canalId] = valor;
        return { ...c, referenciaCanalId };
      }),
    );
    salvarAgora(() => upsertCategoriaReferencia(categoriaId, canalId, valor));
  }

  /** 0 = mira a Margem R$ da referência sem alteração; positivo/negativo ajusta esse % sobre o valor antes de virar a meta. */
  function onAtualizarCategoriaReferenciaAjuste(categoriaId: string, canalId: string, valor: number) {
    setCategorias((prev) =>
      prev.map((c) => (c.id === categoriaId ? { ...c, referenciaAjustePct: { ...c.referenciaAjustePct, [canalId]: valor } } : c)),
    );
    debounced(`referencia-ajuste-${categoriaId}-${canalId}`, () => upsertCategoriaReferenciaAjuste(categoriaId, canalId, valor));
  }

  function onRemoverCategoria(categoriaId: string) {
    if (produtos.some((p) => p.categoriaId === categoriaId)) {
      setErro('Não é possível deletar esta categoria: existem produtos cadastrados vinculados a ela.');
      return;
    }
    if (categorias.length <= 1) {
      setErro('É necessário manter ao menos uma categoria cadastrada no sistema.');
      return;
    }
    setCategorias((prev) => prev.filter((c) => c.id !== categoriaId));
    // O cascade do banco já apaga as subcategorias dela — só reflete no estado local.
    setSubcategorias((prev) => prev.filter((s) => s.categoriaId !== categoriaId));
    if (filtroClasse === `cat:${categoriaId}`) setFiltroClasse('todas');
    salvarAgora(() => apagarCategoria(categoriaId));
  }

  async function onAdicionarCategoria(input: { nome: string; estadual: number; interestadual: number }) {
    if (categorias.some((c) => c.nome.toLowerCase() === input.nome.toLowerCase())) {
      setErro('Já existe uma categoria com esse nome.');
      return;
    }
    try {
      const categoria = await inserirCategoria({ ...input, ordem: categorias.length }, canais);
      setCategorias((prev) => [...prev, categoria]);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao adicionar categoria.'));
    }
  }

  // ---------- Subcategorias ----------
  async function onAdicionarSubcategoria(categoriaId: string, nome: string) {
    const irmas = subcategorias.filter((s) => s.categoriaId === categoriaId);
    if (irmas.some((s) => s.nome.toLowerCase() === nome.toLowerCase())) {
      setErro('Já existe uma subcategoria com esse nome nessa categoria.');
      return;
    }
    try {
      const subcategoria = await inserirSubcategoria({ categoriaId, nome, ordem: irmas.length });
      setSubcategorias((prev) => [...prev, subcategoria]);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao adicionar subcategoria.'));
    }
  }

  function onRenomearSubcategoria(id: string, nome: string) {
    setSubcategorias((prev) => prev.map((s) => (s.id === id ? { ...s, nome } : s)));
    salvarAgora(() => atualizarSubcategoria(id, { nome }));
  }

  /** Sem confirmação/bloqueio: subcategoria_id é opcional (on delete set null) — produtos que a usavam só ficam sem subcategoria. */
  function onRemoverSubcategoria(id: string) {
    setSubcategorias((prev) => prev.filter((s) => s.id !== id));
    setProdutos((prev) => prev.map((p) => (p.subcategoriaId === id ? { ...p, subcategoriaId: null } : p)));
    if (filtroClasse === `sub:${id}`) setFiltroClasse('todas');
    salvarAgora(() => apagarSubcategoria(id));
  }

  /** valor null = apaga o override daquele canal, volta a herdar a margem da categoria pai. */
  function onAtualizarMargemSubcategoria(subcategoriaId: string, canalId: string, valor: number | null) {
    setSubcategorias((prev) =>
      prev.map((s) => {
        if (s.id !== subcategoriaId) return s;
        const margens = { ...s.margens };
        if (valor === null) delete margens[canalId];
        else margens[canalId] = valor;
        return { ...s, margens };
      }),
    );
    salvarAgora(() => (valor === null ? apagarSubcategoriaMargem(subcategoriaId, canalId) : upsertSubcategoriaMargem(subcategoriaId, canalId, valor)));
  }

  // ---------- Fornecedores ----------
  async function onAdicionarFornecedor(nome: string) {
    if (fornecedores.some((f) => f.nome.toLowerCase() === nome.toLowerCase())) {
      setErro('Já existe um fornecedor com esse nome.');
      return;
    }
    try {
      const fornecedor = await inserirFornecedor({ nome, ordem: fornecedores.length });
      setFornecedores((prev) => [...prev, fornecedor]);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao adicionar fornecedor.'));
    }
  }

  function onRenomearFornecedor(id: string, nome: string) {
    setFornecedores((prev) => prev.map((f) => (f.id === id ? { ...f, nome } : f)));
    salvarAgora(() => atualizarFornecedor(id, { nome }));
  }

  /** 'visivelGrade' desmarcado já esconde os produtos desse fornecedor da grade E do PDF; 'visivelPdf' desmarcado esconde só do PDF. */
  function onAtualizarFornecedorVisibilidade(id: string, campo: 'visivelGrade' | 'visivelPdf', valor: boolean) {
    setFornecedores((prev) => prev.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
    salvarAgora(() => atualizarFornecedor(id, { [campo === 'visivelGrade' ? 'visivel_grade' : 'visivel_pdf']: valor }));
  }

  /** Sem confirmação/bloqueio: fornecedor_id é opcional (on delete set null) — produtos que usavam esse fornecedor só ficam sem fornecedor. */
  function onRemoverFornecedor(id: string) {
    setFornecedores((prev) => prev.filter((f) => f.id !== id));
    setProdutos((prev) => prev.map((p) => (p.fornecedorId === id ? { ...p, fornecedorId: null } : p)));
    if (filtroClasse === `forn:${id}`) setFiltroClasse('todas');
    salvarAgora(() => apagarFornecedor(id));
  }

  // ---------- Custos Personalizados ----------
  async function onAdicionarCusto(input: { descricao: string; tipo: 'reais' | 'percentual'; valor: number }) {
    try {
      const custo = await inserirCustoPersonalizado({ ...input, ordem: custos.length });
      setCustos((prev) => [...prev, custo]);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao adicionar custo.'));
    }
  }

  function onAtualizarCusto(id: string, patch: Partial<Pick<CustoPersonalizado, 'descricao' | 'tipo' | 'valor'>>) {
    setCustos((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    salvarAgora(() => atualizarCustoPersonalizado(id, patch));
  }

  function onRemoverCusto(id: string) {
    setCustos((prev) => prev.filter((c) => c.id !== id));
    salvarAgora(() => apagarCustoPersonalizado(id));
  }

  function onSalvarOrdemCategorias(novaOrdem: Categoria[]) {
    const comOrdem = novaOrdem.map((c, i) => ({ ...c, ordem: i }));
    setCategorias(comOrdem);
    setProdutos((prev) => ordenarProdutos(prev, comOrdem));
    salvarAgora(async () => {
      for (const c of comOrdem) {
        await atualizarCategoria(c.id, { ordem: c.ordem });
      }
    });
    setModalOrdemTipo(null);
  }

  function onSalvarOrdemCanais(novaOrdem: Canal[]) {
    const comOrdem = novaOrdem.map((c, i) => ({ ...c, ordem: i }));
    setCanais(comOrdem);
    salvarAgora(async () => {
      for (const c of comOrdem) {
        await atualizarCanal(c.id, { ordem: c.ordem });
      }
    });
    setModalOrdemTipo(null);
  }

  async function onConfirmarLimparTabela() {
    setLimpandoTabela(true);
    try {
      await apagarTodosProdutos();
      setProdutos([]);
      invalidarProdutosPreco();
      setModalLimparAberto(false);
    } catch (e) {
      setErro(mensagemDeErro(e, 'Falha ao limpar a tabela no Supabase.'));
    } finally {
      setLimpandoTabela(false);
    }
  }

  return (
    <AppShell
      topbarNavy
      title={<AddProductForm categorias={categorias} onAdicionar={onAdicionarProduto} />}
      mostrarParametrizacao
      onAbrirParametrizacao={() => {
        setAbaParametrizacao('tabelas');
        setModalParametrizacaoAberto(true);
      }}
      actions={
        <>
          <ExportDropdown
            onExportarPdf={() => {
              setModoExportacaoPdf('padrao');
              setModalPdfAberto(true);
            }}
            onExportarGerenciamento={() => {
              setModoExportacaoPdf('gerenciamento');
              setModalPdfAberto(true);
            }}
            onPublicarCatalogoOnline={() => {
              setModoExportacaoPdf('online');
              setModalPdfAberto(true);
            }}
          />
          <Button variant="navy" onClick={() => setModalCompraAberto(true)} title="Planejamento de Compra por Fornecedor">
            <span className="inline-flex items-center gap-1.5">
              <Truck size={16} />
              Compra
            </span>
          </Button>
          <Button variant="danger" onClick={() => setModalLimparAberto(true)} title="Apaga todos os produtos da Tabela de Preços">
            Limpar Tabela
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {erro && (
          <Card className="flex items-center justify-between gap-3 border-bad/40 bg-bad-soft p-3 text-sm text-[#8F2E2E]">
            <span>{erro}</span>
            <button type="button" onClick={() => setErro(null)} className="font-semibold hover:underline">
              Fechar
            </button>
          </Card>
        )}

        <div className="space-y-4">
          <Card className="p-0">
            <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-page)] px-4 py-3">
              <input
                value={buscaProduto}
                onChange={(e) => setBuscaProduto(e.target.value)}
                placeholder="Buscar produto pelo nome ou fornecedor…"
                className="w-full max-w-xs rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)]"
              />
              <span className="text-xs font-semibold text-[var(--color-text-soft)]">Filtrar:</span>
              <select value={filtroClasse} onChange={(e) => setFiltroClasse(e.target.value)} className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]">
                <option value="todas" className="text-[var(--color-text)]">Mostrar Todas</option>
                {categorias.map((c) => (
                  <optgroup key={c.id} label={c.nome}>
                    <option value={`cat:${c.id}`} className="text-[var(--color-text)]">
                      {c.nome} (geral)
                    </option>
                    {subcategorias
                      .filter((s) => s.categoriaId === c.id)
                      .map((s) => (
                        <option key={s.id} value={`sub:${s.id}`} className="text-[var(--color-text)]">
                          {s.nome}
                        </option>
                      ))}
                  </optgroup>
                ))}
                {fornecedores.length > 0 && (
                  <optgroup label="Fornecedor">
                    {fornecedores.map((f) => (
                      <option key={f.id} value={`forn:${f.id}`} className="text-[var(--color-text)]">
                        {f.nome}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <ReorderDropdown
                onEscolherCategorias={() => setModalOrdemTipo('categorias')}
                onEscolherCanais={() => setModalOrdemTipo('canais')}
              />
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-soft)]">
                <input
                  type="checkbox"
                  checked={mostrarMaisDetalhes}
                  onChange={(e) => setMostrarMaisDetalhes(e.target.checked)}
                  className="accent-[var(--color-navy)]"
                />
                Mais detalhes
              </label>
              <div className="flex-1" />
              <SeletorCriterioRepresentacao
                criterio={criterioRepresentacao}
                ordenarAtivo={ordenarPorRepresentacao}
                onEscolher={(c) => {
                  setCriterioRepresentacao(c);
                  setOrdenarPorRepresentacao(true);
                }}
                onDesativarOrdenacao={() => setOrdenarPorRepresentacao(false)}
              />
              {(carregandoBi || margemAtualTotalValor > 0) && (
                <button
                  type="button"
                  onClick={() => setModalMargemAberto(true)}
                  disabled={carregandoBi}
                  title={carregandoBi ? 'Carregando dados do BI (MB/M.C./Desconto real)…' : 'Ver margens (MB atual / M.C prevista)'}
                  className={`shrink-0 rounded-full bg-[var(--color-navy)] p-1.5 text-white ${carregandoBi ? 'cursor-wait opacity-70' : 'hover:brightness-110'}`}
                >
                  {carregandoBi ? <Loader2 size={16} className="animate-spin" /> : <Gauge size={16} />}
                </button>
              )}
            </div>

            <PricingTable
              produtos={produtosExibidos}
              categorias={categorias}
              subcategorias={subcategorias}
              fornecedores={fornecedores}
              canaisVisiveis={canaisVisiveis}
              todosCanais={canais}
              transportadoras={transportadoras}
              mostrarMaisDetalhes={mostrarMaisDetalhes}
              onUpdatePreco={onUpdatePreco}
              onResetPreco={onResetPreco}
              onResetTodosPrecos={onResetTodosPrecos}
              onTogglePrecisaAjuste={onTogglePrecisaAjuste}
              onAtualizarValorKg={onAtualizarValorKg}
              onEditarProduto={setProdutoEditandoId}
              onRemoverProduto={onRemoverProduto}
              onAbrirCanalTelaCheia={(canal) => setCanalTelaCheiaId(canal.id)}
              representatividadeGeralPorProduto={representatividadeGeralPorProduto}
              resolverDescontoBi={resolverDescontoBi}
              ordenadoPorRepresentacao={ordenarPorRepresentacao}
              onAbrirGraficoRepresentacao={() => setGraficoRepresentacaoAberto(true)}
              onAbrirGraficoProduto={setProdutoGraficoLinha}
            />
          </Card>
        </div>
      </div>

      <MargemResumoModal
        open={modalMargemAberto}
        onFechar={() => setModalMargemAberto(false)}
        margemAtualPct={margemAtualTotalPct}
        margemLiquidaPct={margemAtualTotalLiquidaPct}
        custos={custos}
        totalVendas={margemAtualTotalValor}
        totalFornecedor={margemAtualTotalFornecedor}
        totalFrete={margemAtualTotalFrete}
        totalEncargos={margemAtualTotalEncargos - margemAtualTotalDesconto}
        totalDesconto={margemAtualTotalDesconto}
      />

      <CompraModal
        open={modalCompraAberto}
        onFechar={() => setModalCompraAberto(false)}
        produtos={produtos}
        produtosFiltrados={produtosExibidos}
        fornecedores={fornecedores}
        items={itemsAgregadosBi}
      />

      <GraficoRepresentacaoModal
        open={graficoRepresentacaoAberto}
        onFechar={() => setGraficoRepresentacaoAberto(false)}
        titulo="Representação Geral"
        criterio={criterioRepresentacao}
        onEscolherCriterio={setCriterioRepresentacao}
        produtos={produtos}
        representatividadePorProduto={representatividadeGeralGraficoPorProduto}
        filtroAtivo={filtroAtivoGrafico}
        agruparPorNomeEClasse={filtroClasse.startsWith('cat:')}
        historicoSafras={todasSafrasDisponiveisGeral}
        safraSelecionada={safraSelecionadaGrafico}
        onEscolherSafra={setSafraSelecionadaGrafico}
        representatividadePorCanal={representatividadePorCanalGrafico}
        categorias={categorias}
        subcategorias={subcategorias}
      />
      <GraficoCurvaMensalModal
        produto={produtoGraficoLinha}
        onFechar={() => setProdutoGraficoLinha(null)}
        criterio={criterioRepresentacao}
        onEscolherCriterio={setCriterioRepresentacao}
        items={itemsAgregadosBi}
        produtos={produtos}
      />

      <EditProductModal
        produto={produtoEditando}
        categorias={categorias}
        subcategorias={subcategorias}
        fornecedores={fornecedores}
        temDescontoBi={temDescontoBiParaProduto(descontoBiPorCanalECodigo, produtoEditando?.codigo ?? null)}
        onFechar={() => setProdutoEditandoId(null)}
        onSalvar={onSalvarEdicaoProduto}
      />

      <ChannelFullscreenModal
        canal={canalTelaCheia}
        produtos={produtosExibidos}
        categorias={categorias}
        subcategorias={subcategorias}
        fornecedores={fornecedores}
        todosCanais={canais}
        transportadoras={transportadoras}
        filtroExternoRotulo={rotuloFiltroClasse}
        agruparPorNomeEClasse={filtroClasse.startsWith('cat:')}
        onFechar={() => setCanalTelaCheiaId(null)}
        onUpdatePreco={onUpdatePreco}
        onResetPreco={onResetPreco}
        onResetTodosPrecos={onResetTodosPrecos}
        onTogglePrecisaAjuste={onTogglePrecisaAjuste}
        onAtualizarValorKg={onAtualizarValorKg}
      />

      <OrderModal
        open={modalOrdemTipo === 'categorias'}
        titulo="Ordem Personalizada das Categorias"
        dica="Use as setas para colocar as categorias na ordem que preferir. Os produtos na Tabela de Preços seguirão sempre essa ordem, agrupados por categoria."
        itens={categorias}
        onFechar={() => setModalOrdemTipo(null)}
        onSalvar={onSalvarOrdemCategorias}
      />

      <OrderModal
        open={modalOrdemTipo === 'canais'}
        titulo="Ordem Personalizada das Tabelas de Preço"
        dica="Use as setas para colocar as Tabelas de Preço na ordem que preferir. A Tabela de Preços e a Parametrização de Custos seguirão sempre essa ordem."
        itens={canais}
        onFechar={() => setModalOrdemTipo(null)}
        onSalvar={onSalvarOrdemCanais}
      />

      <ExportPdfModal
        open={modalPdfAberto}
        canaisVisiveis={canaisVisiveis}
        modo={modoExportacaoPdf}
        onFechar={() => setModalPdfAberto(false)}
        onConfirmar={(canal) => {
          setModalPdfAberto(false);
          if (modoExportacaoPdf === 'gerenciamento') {
            gerarCatalogoGerenciamentoPDF(canal, produtosExibidos, categorias, subcategorias, fornecedores, canais, transportadoraPorId, resolverDescontoBi);
          } else if (modoExportacaoPdf === 'online') {
            publicarCatalogo(canal);
          } else {
            gerarCatalogoPDF(canal, produtosExibidos, categorias, subcategorias, fornecedores, canais, transportadoraPorId, resolverDescontoBi);
          }
        }}
      />

      <Modal open={publicandoCatalogo} title="Publicando…" onClose={() => {}} widthClassName="max-w-[360px]">
        <p className="text-sm text-[var(--color-text-soft)]">Calculando e salvando os preços do Catálogo Online…</p>
      </Modal>

      <Modal
        open={linkCatalogoPublicado !== null}
        title="Catálogo Online publicado"
        onClose={() => setLinkCatalogoPublicado(null)}
        widthClassName="max-w-[440px]"
        footer={
          <Button variant="primary" onClick={() => setLinkCatalogoPublicado(null)}>
            Fechar
          </Button>
        }
      >
        {linkCatalogoPublicado && (
          <div className="space-y-2.5 text-sm">
            <p className="text-[var(--color-text-soft)]">
              Link público de <strong className="text-[var(--color-text)]">{linkCatalogoPublicado.canalNome}</strong> atualizado — mande esse link pro cliente:
            </p>
            <div className="flex items-center gap-2">
              <input readOnly value={linkCatalogoPublicado.url} onFocus={(e) => e.target.select()} className="num flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-page)] px-2.5 py-1.5 text-xs text-[var(--color-text)]" />
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(linkCatalogoPublicado.url);
                }}
              >
                Copiar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={modalLimparAberto}
        title="Limpar Tabela de Preços"
        onClose={() => setModalLimparAberto(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalLimparAberto(false)} disabled={limpandoTabela}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={onConfirmarLimparTabela} disabled={limpandoTabela}>
              {limpandoTabela ? 'Limpando...' : 'Apagar todos os produtos'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-text)]">
          Isso vai apagar <strong>todos os {produtos.length} produtos</strong> cadastrados e os preços deles em cada Tabela de
          Preço. As Tabelas de Preço (canais) e as Categorias continuam intactas. Não tem como desfazer.
        </p>
      </Modal>

      <Modal
        open={modalParametrizacaoAberto}
        title="Parametrização de Custos"
        onClose={() => setModalParametrizacaoAberto(false)}
        widthClassName="max-w-[95vw]"
      >
        <div className="sticky -top-[18px] z-20 -mx-[18px] -mt-[18px] mb-4 flex gap-2 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-[18px] pb-2 pt-2.5">
          {(
            [
              { valor: 'tabelas', rotulo: 'Tabelas' },
              { valor: 'categorias', rotulo: 'Categorias' },
              { valor: 'fornecedores', rotulo: 'Fornecedores' },
              { valor: 'custos', rotulo: 'Custos' },
            ] as const
          ).map((aba) => (
            <button
              key={aba.valor}
              type="button"
              onClick={() => setAbaParametrizacao(aba.valor)}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
                abaParametrizacao === aba.valor
                  ? 'bg-[var(--color-navy)] text-white'
                  : 'bg-[var(--color-page)] text-[var(--color-text-soft)] hover:text-[var(--color-text)]'
              }`}
            >
              {aba.rotulo}
            </button>
          ))}
        </div>

        {abaParametrizacao === 'tabelas' && (
          <ChannelsPanel
            canais={canais}
            transportadoras={transportadoras}
            onSelecionarTransportadora={onSelecionarTransportadora}
            onAtualizarCampo={onAtualizarCampoCanal}
            onAtualizarWhatsapp={onAtualizarWhatsappCanal}
            onAtualizarMostrarDetalhes={onAtualizarMostrarDetalhesCanal}
            onAtualizarTipoImposto={onAtualizarTipoImposto}
            onAtualizarFreteAdicionalTipo={onAtualizarFreteAdicionalTipo}
            onToggleVisivel={onToggleVisivel}
            onToggleFreteIncluso={onToggleFreteIncluso}
            onRemoverCanal={onRemoverCanal}
            onAdicionarCanal={onAdicionarCanal}
          />
        )}
        {abaParametrizacao === 'categorias' && (
          <CategoryMarginsPanel
            categorias={categorias}
            subcategorias={subcategorias}
            canais={canais}
            onAtualizarCategoria={onAtualizarCategoria}
            onAtualizarMargem={onAtualizarMargem}
            onAtualizarTolerancia={onAtualizarTolerancia}
            onRemoverCategoria={onRemoverCategoria}
            onAdicionarCategoria={onAdicionarCategoria}
            onAdicionarSubcategoria={onAdicionarSubcategoria}
            onRenomearSubcategoria={onRenomearSubcategoria}
            onRemoverSubcategoria={onRemoverSubcategoria}
            onAtualizarMargemSubcategoria={onAtualizarMargemSubcategoria}
            onAtualizarCanalModoMargem={onAtualizarCanalModoMargem}
            onAtualizarCategoriaReferencia={onAtualizarCategoriaReferencia}
            onAtualizarCategoriaReferenciaAjuste={onAtualizarCategoriaReferenciaAjuste}
          />
        )}
        {abaParametrizacao === 'fornecedores' && (
          <FornecedoresPanel
            fornecedores={fornecedores}
            onAdicionarFornecedor={onAdicionarFornecedor}
            onRenomearFornecedor={onRenomearFornecedor}
            onRemoverFornecedor={onRemoverFornecedor}
            onAtualizarFornecedorVisibilidade={onAtualizarFornecedorVisibilidade}
          />
        )}
        {abaParametrizacao === 'custos' && (
          <CustosPersonalizadosPanel
            custos={custos}
            totalVendas={margemAtualTotalValor}
            onAdicionarCusto={onAdicionarCusto}
            onAtualizarCusto={onAtualizarCusto}
            onRemoverCusto={onRemoverCusto}
          />
        )}
      </Modal>
    </AppShell>
  );
}
