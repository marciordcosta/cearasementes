import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import {
  apagarCanal,
  apagarCategoria,
  apagarProduto,
  apagarTodosProdutos,
  atualizarCanal,
  atualizarCategoria,
  atualizarProduto,
  fetchCanais,
  fetchCategorias,
  fetchProdutos,
  inserirCanal,
  inserirCategoria,
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
import { OrderModal } from '@/features/pricing/components/OrderModal';
import { PricingTable } from '@/features/pricing/components/PricingTable';
import { ReorderDropdown } from '@/features/pricing/components/ReorderDropdown';
import type { Canal, Categoria, DespesaDestino, FreteAdicionalTipo, Produto, TipoImposto } from '@/features/pricing/types';

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
  const { data: canaisData } = useQuery({ queryKey: ['pricing', 'canais'], queryFn: fetchCanais });
  const { data: categoriasData } = useQuery({ queryKey: ['pricing', 'categorias'], queryFn: fetchCategorias });
  const { data: produtosData } = useQuery({ queryKey: ['pricing', 'produtos'], queryFn: fetchProdutos });

  // Estado local "espelha" o Supabase uma única vez ao carregar (feito pra
  // edição instantânea, tipo planilha) — depois disso, a fonte da verdade
  // pra tela é o estado local, sincronizado em background pelas chamadas
  // de API abaixo. Não refazemos o seed em todo refetch pra não perder
  // edição em andamento do usuário.
  const seeded = useRef(false);
  const [canais, setCanais] = useState<Canal[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);

  useEffect(() => {
    if (seeded.current || !canaisData || !categoriasData || !produtosData) return;
    setCanais(canaisData);
    setCategorias(categoriasData);
    setProdutos(ordenarProdutos(produtosData, categoriasData));
    seeded.current = true;
  }, [canaisData, categoriasData, produtosData]);

  const [aba, setAba] = useState<'precos' | 'parametrizacao'>('precos');
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
    acao().catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Falha ao salvar no Supabase.'));
  }, 500);

  function salvarAgora(acao: () => Promise<void>) {
    acao().catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Falha ao salvar no Supabase.'));
  }

  const canaisVisiveis = canais.filter((c) => c.visivel);
  const produtoEditando = produtos.find((p) => p.id === produtoEditandoId) ?? null;
  const canalTelaCheia = canais.find((c) => c.id === canalTelaCheiaId) ?? null;
  const produtosExibidos = filtroClasse === 'todas' ? produtos : produtos.filter((p) => p.categoriaId === filtroClasse);

  // ---------- Produtos ----------
  function onUpdateCusto(produtoId: string, custo: number) {
    setProdutos((prev) => prev.map((p) => (p.id === produtoId ? { ...p, custo } : p)));
    debounced(`produto-custo-${produtoId}`, () => atualizarProduto(produtoId, { custo }));
  }

  function onUpdatePreco(produtoId: string, canalId: string, preco: number) {
    setProdutos((prev) => prev.map((p) => (p.id === produtoId ? { ...p, precos: { ...p.precos, [canalId]: { preco, manual: true } } } : p)));
    debounced(`produto-preco-${produtoId}-${canalId}`, () => upsertProdutoPreco(produtoId, canalId, preco, true));
  }

  function onResetPreco(produtoId: string, canalId: string) {
    setProdutos((prev) => prev.map((p) => (p.id === produtoId ? { ...p, precos: { ...p.precos, [canalId]: { preco: null, manual: false } } } : p)));
    salvarAgora(() => upsertProdutoPreco(produtoId, canalId, null, false));
  }

  function onRemoverProduto(produtoId: string) {
    setProdutos((prev) => prev.filter((p) => p.id !== produtoId));
    salvarAgora(() => apagarProduto(produtoId));
  }

  async function onAdicionarProduto(input: { nome: string; categoriaId: string; peso: number; custo: number }) {
    try {
      const codigo = String(1000 + produtos.length + 1);
      const produto = await inserirProduto({ ...input, codigo }, canais);
      setProdutos((prev) => ordenarProdutos([...prev, produto], categorias));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao adicionar produto.');
    }
  }

  function onSalvarEdicaoProduto(patch: { nome: string; codigo: string; categoriaId: string; peso: number; despesaExtraValor: number; despesaExtraDestino: DespesaDestino }) {
    if (!produtoEditandoId) return;
    setProdutos((prev) =>
      ordenarProdutos(
        prev.map((p) =>
          p.id === produtoEditandoId
            ? { ...p, nome: patch.nome, codigo: patch.codigo || null, categoriaId: patch.categoriaId, peso: patch.peso, despesaExtraValor: patch.despesaExtraValor, despesaExtraDestino: patch.despesaExtraDestino }
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
        despesa_extra_destino: patch.despesaExtraDestino,
      }),
    );
    setProdutoEditandoId(null);
  }

  // ---------- Canais ----------
  function onAtualizarCampoCanal(canalId: string, campo: CampoNumericoCanal, valor: number) {
    setCanais((prev) => prev.map((c) => (c.id === canalId ? { ...c, [campo]: valor } : c)));
    debounced(`canal-${canalId}-${campo}`, () => atualizarCanal(canalId, { [CAMPO_PARA_COLUNA[campo]]: valor }));
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
      setErro(e instanceof Error ? e.message : 'Falha ao adicionar Tabela de Preço.');
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
    if (filtroClasse === categoriaId) setFiltroClasse('todas');
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
      setErro(e instanceof Error ? e.message : 'Falha ao adicionar categoria.');
    }
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
      setModalLimparAberto(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao limpar a tabela no Supabase.');
    } finally {
      setLimpandoTabela(false);
    }
  }

  return (
    <AppShell
      topbarNavy
      hideTopbar={aba === 'parametrizacao'}
      title={<AddProductForm categorias={categorias} onAdicionar={onAdicionarProduto} />}
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

        {aba === 'precos' ? (
          <div className="space-y-4">
            <Card className="p-0">
              <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-page)] px-4 py-3">
                <span className="text-xs font-semibold text-[var(--color-text-soft)]">Filtrar por classe:</span>
                <select value={filtroClasse} onChange={(e) => setFiltroClasse(e.target.value)} className="rounded-md border border-[var(--color-line)] px-2 py-1.5 text-sm">
                  <option value="todas">Mostrar Todas</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
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
                <button
                  type="button"
                  onClick={() => setAba('parametrizacao')}
                  title="Ir para Parametrização de Custos"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-sm shadow-sm hover:bg-[var(--color-page)]"
                >
                  ⚙️
                </button>
              </div>

              <PricingTable
                produtos={produtosExibidos}
                categorias={categorias}
                canaisVisiveis={canaisVisiveis}
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
        ) : (
          <div className="space-y-8">
            <ChannelsPanel
              canais={canais}
              onAtualizarCampo={onAtualizarCampoCanal}
              onAtualizarTipoImposto={onAtualizarTipoImposto}
              onAtualizarFreteAdicionalTipo={onAtualizarFreteAdicionalTipo}
              onToggleVisivel={onToggleVisivel}
              onToggleFreteIncluso={onToggleFreteIncluso}
              onRemoverCanal={onRemoverCanal}
              onAdicionarCanal={onAdicionarCanal}
              acaoTitulo={
                <button
                  type="button"
                  onClick={() => setAba('precos')}
                  title="Voltar para a Tabela de Preços"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-sm shadow-sm hover:bg-[var(--color-page)]"
                >
                  ▦
                </button>
              }
            />
            <CategoryMarginsPanel
              categorias={categorias}
              canais={canais}
              onAtualizarCategoria={onAtualizarCategoria}
              onAtualizarMargem={onAtualizarMargem}
              onRemoverCategoria={onRemoverCategoria}
              onAdicionarCategoria={onAdicionarCategoria}
            />
          </div>
        )}
      </div>

      <EditProductModal produto={produtoEditando} categorias={categorias} onFechar={() => setProdutoEditandoId(null)} onSalvar={onSalvarEdicaoProduto} />

      <ChannelFullscreenModal
        canal={canalTelaCheia}
        produtos={produtosExibidos}
        categorias={categorias}
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
          gerarCatalogoPDF(canal, produtosExibidos, categorias);
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
    </AppShell>
  );
}
