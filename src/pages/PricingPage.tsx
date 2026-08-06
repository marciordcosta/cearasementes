import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { aplicarTransportadoraNoCanal, fetchTransportadoras } from '@/features/fretes/api';
import {
  apagarCanal,
  apagarCategoria,
  apagarFornecedor,
  apagarProduto,
  apagarTodosProdutos,
  atualizarCanal,
  atualizarCategoria,
  atualizarFornecedor,
  atualizarProduto,
  fetchCanais,
  fetchCategorias,
  fetchFornecedores,
  fetchProdutos,
  inserirCanal,
  inserirCategoria,
  inserirFornecedor,
  inserirProduto,
  upsertCategoriaMargem,
  upsertProdutoPreco,
} from '@/features/pricing/api';
import { gerarCatalogoPDF } from '@/features/pricing/catalogoPdf';
import { ordenarProdutos } from '@/features/pricing/calculations';
import { AddProductForm } from '@/features/pricing/components/AddProductForm';
import { CategoryMarginsPanel } from '@/features/pricing/components/CategoryMarginsPanel';
import { ChannelFullscreenModal } from '@/features/pricing/components/ChannelFullscreenModal';
import { ChannelsPanel, type NovoCanalInput } from '@/features/pricing/components/ChannelsPanel';
import { EditProductModal } from '@/features/pricing/components/EditProductModal';
import { ExportDropdown } from '@/features/pricing/components/ExportDropdown';
import { ExportPdfModal } from '@/features/pricing/components/ExportPdfModal';
import { FornecedoresPanel } from '@/features/pricing/components/FornecedoresPanel';
import { OrderModal } from '@/features/pricing/components/OrderModal';
import { PricingTable } from '@/features/pricing/components/PricingTable';
import { ReorderDropdown } from '@/features/pricing/components/ReorderDropdown';
import type { Canal, Categoria, Fornecedor, FreteAdicionalTipo, Produto, TipoImposto } from '@/features/pricing/types';
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
  const { data: produtosData } = useQuery({ queryKey: ['pricing', 'produtos'], queryFn: fetchProdutos });
  const { data: fornecedoresData } = useQuery({ queryKey: ['pricing', 'fornecedores'], queryFn: fetchFornecedores });

  // Estado local "espelha" o Supabase uma única vez ao carregar (feito pra
  // edição instantânea, tipo planilha) — depois disso, a fonte da verdade
  // pra tela é o estado local, sincronizado em background pelas chamadas
  // de API abaixo. Não refazemos o seed em todo refetch pra não perder
  // edição em andamento do usuário.
  const seeded = useRef(false);
  const [canais, setCanais] = useState<Canal[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);

  useEffect(() => {
    if (seeded.current || !canaisData || !categoriasData || !produtosData || !fornecedoresData) return;
    setCanais(canaisData);
    setCategorias(categoriasData);
    setProdutos(ordenarProdutos(produtosData, categoriasData));
    setFornecedores(fornecedoresData);
    seeded.current = true;
  }, [canaisData, categoriasData, produtosData, fornecedoresData]);

  const [modalParametrizacaoAberto, setModalParametrizacaoAberto] = useState(false);
  const [buscaProduto, setBuscaProduto] = useState('');
  const [filtroClasse, setFiltroClasse] = useState('todas');
  const [mostrarColunaId, setMostrarColunaId] = useState(true);
  const [produtoEditandoId, setProdutoEditandoId] = useState<string | null>(null);
  const [canalTelaCheiaId, setCanalTelaCheiaId] = useState<string | null>(null);
  const [modalOrdemTipo, setModalOrdemTipo] = useState<'categorias' | 'canais' | null>(null);
  const [modalPdfAberto, setModalPdfAberto] = useState(false);
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
  const produtoEditando = produtos.find((p) => p.id === produtoEditandoId) ?? null;
  const canalTelaCheia = canais.find((c) => c.id === canalTelaCheiaId) ?? null;
  const fornecedorPorId = new Map(fornecedores.map((f) => [f.id, f]));
  const produtosExibidos = produtos
    .filter((p) => {
      if (filtroClasse === 'todas') return true;
      if (filtroClasse.startsWith('cat:')) return p.categoriaId === filtroClasse.slice(4);
      if (filtroClasse.startsWith('forn:')) return p.fornecedorId === filtroClasse.slice(5);
      return true;
    })
    .filter((p) => {
      const termo = buscaProduto.trim().toLowerCase();
      if (!termo) return true;
      if (p.nome.toLowerCase().includes(termo)) return true;
      const fornecedor = p.fornecedorId ? fornecedorPorId.get(p.fornecedorId) : undefined;
      return fornecedor ? fornecedor.nome.toLowerCase().includes(termo) : false;
    });

  // ---------- Produtos ----------
  function onUpdateCusto(produtoId: string, custo: number) {
    setProdutos((prev) => prev.map((p) => (p.id === produtoId ? { ...p, custo } : p)));
    debounced(`produto-custo-${produtoId}`, () => atualizarProduto(produtoId, { custo }).then(invalidarProdutosPreco));
  }

  function onUpdatePreco(produtoId: string, canalId: string, preco: number) {
    setProdutos((prev) => prev.map((p) => (p.id === produtoId ? { ...p, precos: { ...p.precos, [canalId]: { preco, manual: true } } } : p)));
    debounced(`produto-preco-${produtoId}-${canalId}`, () => upsertProdutoPreco(produtoId, canalId, preco, true).then(invalidarProdutosPreco));
  }

  function onResetPreco(produtoId: string, canalId: string) {
    setProdutos((prev) => prev.map((p) => (p.id === produtoId ? { ...p, precos: { ...p.precos, [canalId]: { preco: null, manual: false } } } : p)));
    salvarAgora(() => upsertProdutoPreco(produtoId, canalId, null, false).then(invalidarProdutosPreco));
  }

  function onRemoverProduto(produtoId: string) {
    setProdutos((prev) => prev.filter((p) => p.id !== produtoId));
    salvarAgora(() => apagarProduto(produtoId).then(invalidarProdutosPreco));
  }

  async function onAdicionarProduto(input: { nome: string; categoriaId: string; peso: number; custo: number }) {
    try {
      const codigo = String(1000 + produtos.length + 1);
      const produto = await inserirProduto({ ...input, codigo }, canais);
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
    peso: number;
    despesaExtraValor: number;
    cubagem: string | null;
    fornecedorId: string | null;
    imprimir: boolean;
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
                peso: patch.peso,
                despesaExtraValor: patch.despesaExtraValor,
                cubagem: patch.cubagem,
                fornecedorId: patch.fornecedorId,
                imprimir: patch.imprimir,
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
        peso: patch.peso,
        despesa_extra_valor: patch.despesaExtraValor,
        cubagem: patch.cubagem,
        fornecedor_id: patch.fornecedorId,
        imprimir: patch.imprimir,
      }).then(invalidarProdutosPreco),
    );
    setProdutoEditandoId(null);
  }

  // ---------- Canais ----------
  function onAtualizarCampoCanal(canalId: string, campo: CampoNumericoCanal, valor: number) {
    setCanais((prev) => prev.map((c) => (c.id === canalId ? { ...c, [campo]: valor } : c)));
    debounced(`canal-${canalId}-${campo}`, () => atualizarCanal(canalId, { [CAMPO_PARA_COLUNA[campo]]: valor }));
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
    setCategorias((prev) => prev.map((cat) => {
      const margens = { ...cat.margens };
      delete margens[canalId];
      return { ...cat, margens };
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
      setProdutos((prev) => prev.map((p) => ({ ...p, precos: { ...p.precos, [canal.id]: { preco: null, manual: false } } })));
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

  /** Sem confirmação/bloqueio: fornecedor_id é opcional (on delete set null) — produtos que usavam esse fornecedor só ficam sem fornecedor. */
  function onRemoverFornecedor(id: string) {
    setFornecedores((prev) => prev.filter((f) => f.id !== id));
    setProdutos((prev) => prev.map((p) => (p.fornecedorId === id ? { ...p, fornecedorId: null } : p)));
    if (filtroClasse === `forn:${id}`) setFiltroClasse('todas');
    salvarAgora(() => apagarFornecedor(id));
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
      onAbrirParametrizacao={() => setModalParametrizacaoAberto(true)}
      actions={
        <>
          <ExportDropdown onExportarPdf={() => setModalPdfAberto(true)} />
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
              <span className="text-xs font-semibold text-[var(--color-text-soft)]">Filtrar por classe:</span>
              <select value={filtroClasse} onChange={(e) => setFiltroClasse(e.target.value)} className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]">
                <option value="todas" className="text-[var(--color-text)]">Mostrar Todas</option>
                <optgroup label="Categoria">
                  {categorias.map((c) => (
                    <option key={c.id} value={`cat:${c.id}`} className="text-[var(--color-text)]">
                      {c.nome}
                    </option>
                  ))}
                </optgroup>
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
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-soft)]">
                <input type="checkbox" checked={mostrarColunaId} onChange={(e) => setMostrarColunaId(e.target.checked)} className="accent-[var(--color-navy)]" />
                Exibir coluna ID
              </label>
              <div className="flex-1" />
              <ReorderDropdown
                onEscolherCategorias={() => setModalOrdemTipo('categorias')}
                onEscolherCanais={() => setModalOrdemTipo('canais')}
              />
            </div>

            <PricingTable
              produtos={produtosExibidos}
              categorias={categorias}
              fornecedores={fornecedores}
              canaisVisiveis={canaisVisiveis}
              transportadoras={transportadoras}
              mostrarColunaId={mostrarColunaId}
              onUpdateCusto={onUpdateCusto}
              onUpdatePreco={onUpdatePreco}
              onResetPreco={onResetPreco}
              onEditarProduto={setProdutoEditandoId}
              onRemoverProduto={onRemoverProduto}
              onAbrirCanalTelaCheia={(canal) => setCanalTelaCheiaId(canal.id)}
            />
          </Card>
        </div>
      </div>

      <EditProductModal
        produto={produtoEditando}
        categorias={categorias}
        fornecedores={fornecedores}
        onFechar={() => setProdutoEditandoId(null)}
        onSalvar={onSalvarEdicaoProduto}
      />

      <ChannelFullscreenModal
        canal={canalTelaCheia}
        produtos={produtosExibidos}
        categorias={categorias}
        fornecedores={fornecedores}
        transportadoras={transportadoras}
        mostrarColunaId={mostrarColunaId}
        onFechar={() => setCanalTelaCheiaId(null)}
        onUpdateCusto={onUpdateCusto}
        onUpdatePreco={onUpdatePreco}
        onResetPreco={onResetPreco}
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
        onFechar={() => setModalPdfAberto(false)}
        onConfirmar={(canal) => {
          setModalPdfAberto(false);
          gerarCatalogoPDF(canal, produtosExibidos, categorias, fornecedores, transportadoraPorId);
        }}
      />

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
        <div className="space-y-8">
          <ChannelsPanel
            canais={canais}
            transportadoras={transportadoras}
            onSelecionarTransportadora={onSelecionarTransportadora}
            onAtualizarCampo={onAtualizarCampoCanal}
            onAtualizarTipoImposto={onAtualizarTipoImposto}
            onAtualizarFreteAdicionalTipo={onAtualizarFreteAdicionalTipo}
            onToggleVisivel={onToggleVisivel}
            onToggleFreteIncluso={onToggleFreteIncluso}
            onRemoverCanal={onRemoverCanal}
            onAdicionarCanal={onAdicionarCanal}
          />
          <CategoryMarginsPanel
            categorias={categorias}
            canais={canais}
            onAtualizarCategoria={onAtualizarCategoria}
            onAtualizarMargem={onAtualizarMargem}
            onRemoverCategoria={onRemoverCategoria}
            onAdicionarCategoria={onAdicionarCategoria}
          />
          <FornecedoresPanel
            fornecedores={fornecedores}
            onAdicionarFornecedor={onAdicionarFornecedor}
            onRenomearFornecedor={onRenomearFornecedor}
            onRemoverFornecedor={onRemoverFornecedor}
          />
        </div>
      </Modal>
    </AppShell>
  );
}
