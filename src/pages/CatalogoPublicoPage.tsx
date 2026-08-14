import { Loader2, Search, ShoppingCart, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NomeComDestaque } from '@/components/ui/NomeComDestaque';
import { chaveComparacaoNome } from '@/features/pricing/calculations';
import { fetchCatalogoPublicoPorSlug, type CatalogoPublico } from '@/features/pricing/api';
import { gerarOrcamentoPdf } from '@/features/pricing/orcamentoPdf';

type ItemCatalogo = CatalogoPublico['itens'][number];
type ItemCarrinho = ItemCatalogo & { qtd: number };

function fmtR(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function chaveCache(slug: string): string {
  return `catalogo-publico-cache:${slug}`;
}

/** Lido de forma síncrona no primeiro render — dá pra já mostrar os cards antes mesmo do fetch responder, importante numa conexão de celular mais lenta. Descartado silenciosamente se estiver corrompido/vier de uma versão antiga do formato. */
function lerCache(slug: string): CatalogoPublico | null {
  try {
    const bruto = localStorage.getItem(chaveCache(slug));
    return bruto ? (JSON.parse(bruto) as CatalogoPublico) : null;
  } catch {
    return null;
  }
}

function salvarCache(slug: string, dados: CatalogoPublico) {
  try {
    localStorage.setItem(chaveCache(slug), JSON.stringify(dados));
  } catch {
    // localStorage indisponível/cheio (aba anônima, cota) — sem cache, só não acelera a próxima visita.
  }
}

function linkWhatsApp(numero: string, texto?: string): string {
  const base = `https://wa.me/${numero}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

/** `frete === null` = canal Manual, sem Transportadora vinculada — sem referência real de frete pra calcular, então nem entra na mensagem/total (fica "a combinar", pedido à parte via botão "Cotação de frete"). */
function montarMensagemOrcamento(canalNome: string, itens: ItemCarrinho[], frete: number | null, total: number): string {
  const linhas = itens.map((i) => `${i.qtd}x ${i.nome.replace(/[*_]/g, '')} — R$ ${fmtR(i.preco * i.qtd)}`);
  const linhaFrete = frete === null ? 'Frete: a combinar (cotação à parte)' : `Frete: R$ ${fmtR(frete)}`;
  const linhaTotal = frete === null ? `Total dos produtos: R$ ${fmtR(total)}` : `Total: R$ ${fmtR(total)}`;
  return [`Orçamento — ${canalNome}`, '', ...linhas, '', linhaFrete, linhaTotal].join('\n');
}

function montarMensagemCotacaoFrete(canalNome: string, itens: ItemCarrinho[]): string {
  const linhas = itens.map((i) => `${i.qtd}x ${i.nome.replace(/[*_]/g, '')}`);
  return [`Olá! Gostaria de uma cotação de frete — ${canalNome}`, '', ...linhas].join('\n');
}

/** Ícone oficial do WhatsApp (glifo público, mesmo usado em botões "fale conosco" pela web afora). */
function IconeWhatsApp({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86.173.087.274.072.376-.043.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564c.173.087.289.13.332.202.043.072.043.419-.101.824zM12 2C6.477 2 2 6.477 2 12c0 1.795.474 3.48 1.303 4.937L2 22l5.184-1.361A9.938 9.938 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" />
    </svg>
  );
}

/** 1 linha (produto) — usada tanto sozinha (card próprio) quanto dentro de um bloco "colado" (variantes do mesmo produto, ver agruparPorProduto). Fornecedor SEMPRE numa linha própria embaixo do nome, mesmo quando o nome é curto e caberia do lado — padronizado, não depende do fluxo de texto quebrar sozinho. */
function LinhaProduto({ item, selecionado, onClick }: { item: ItemCatalogo; selecionado: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition ${selecionado ? 'bg-[#e4f6ef]' : 'bg-white active:bg-[#f5f7fa]'}`}
    >
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm leading-snug text-[#1a2233]">
          <NomeComDestaque nome={item.nome} />
        </p>
        {item.fornecedorNome && <p className="truncate text-[10px] font-medium uppercase tracking-wide text-[#67718a]">{item.fornecedorNome}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="num text-base font-bold text-[#0e9d74]">R$ {fmtR(item.preco)}</p>
        <p className="text-[11px] text-[#67718a]">{Math.round(item.peso)}kg</p>
      </div>
      {selecionado && (
        <span className="shrink-0 rounded-full bg-[#0e9d74] p-0.5 text-white">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
      )}
    </button>
  );
}

function QuantidadeInput({ valor, onAlterar }: { valor: number; onAlterar: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => onAlterar(valor - 1)} className="flex h-7 w-7 items-center justify-center rounded-md border border-[#e2e6ed] text-[#67718a] hover:bg-[#f5f7fa]">
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        value={valor}
        onChange={(e) => onAlterar(Math.max(1, parseInt(e.target.value, 10) || 1))}
        className="num w-11 rounded-md border border-[#e2e6ed] bg-white px-1 py-1 text-center text-sm text-[#1a2233]"
      />
      <button type="button" onClick={() => onAlterar(valor + 1)} className="flex h-7 w-7 items-center justify-center rounded-md border border-[#e2e6ed] text-[#67718a] hover:bg-[#f5f7fa]">
        +
      </button>
    </div>
  );
}

function ModalConcluir({
  onWhatsApp,
  onPdf,
  onFechar,
}: {
  onWhatsApp: () => void;
  onPdf: () => void;
  onFechar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/45 p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="w-full max-w-xs rounded-xl bg-white p-4 shadow-2xl">
        <p className="mb-3 text-center text-sm font-semibold text-[#1a2233]">Como você quer o orçamento?</p>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={onWhatsApp} className="flex items-center justify-center gap-2 rounded-md bg-[#25D366] py-2.5 text-sm font-semibold text-white hover:brightness-95">
            <IconeWhatsApp size={18} />
            Enviar por WhatsApp
          </button>
          <button type="button" onClick={onPdf} className="rounded-md border border-[#e2e6ed] py-2.5 text-sm font-semibold text-[#1a2233] hover:bg-[#f5f7fa]">
            Salvar em PDF
          </button>
          <button type="button" onClick={onFechar} className="mt-1 text-xs text-[#67718a] hover:underline">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/** Composição livre antes de sair pro WhatsApp — o clique no ícone flutuante não navega direto, só abre isso; o navegador só é aberto de fato ao confirmar "Enviar", pra não tirar o cliente do catálogo à toa. */
function ModalMensagemWhatsApp({ mensagemInicial, onEnviar, onFechar }: { mensagemInicial: string; onEnviar: (mensagem: string) => void; onFechar: () => void }) {
  const [mensagem, setMensagem] = useState(mensagemInicial);
  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold text-[#1a2233]">Mensagem pro WhatsApp</p>
          <button type="button" onClick={onFechar} className="rounded-md p-1 text-[#67718a] hover:bg-[#f5f7fa]">
            <X size={18} />
          </button>
        </div>
        <textarea
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          rows={5}
          className="w-full resize-none rounded-md border border-[#e2e6ed] bg-[#f5f7fa] p-2.5 text-sm text-[#1a2233]"
        />
        <button
          type="button"
          onClick={() => onEnviar(mensagem)}
          disabled={!mensagem.trim()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-[#25D366] py-2.5 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <IconeWhatsApp size={18} />
          Enviar
        </button>
      </div>
    </div>
  );
}

/** Igual ModalMensagemWhatsApp (mesmo padrão de "compor antes de enviar"), só que pro Orçamento: o resumo calculado (itens/frete/total) fica travado (editar ali poderia descombinar do que o PDF mostra) — só a observação embaixo é livre, some do texto final se ficar em branco. */
function ModalObservacaoWhatsApp({ resumo, onEnviar, onFechar }: { resumo: string; onEnviar: (mensagemFinal: string) => void; onFechar: () => void }) {
  const [observacao, setObservacao] = useState('');
  return (
    <div className="fixed inset-0 z-[230] flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold text-[#1a2233]">Mensagem pro WhatsApp</p>
          <button type="button" onClick={onFechar} className="rounded-md p-1 text-[#67718a] hover:bg-[#f5f7fa]">
            <X size={18} />
          </button>
        </div>
        <pre className="mb-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-[#f5f7fa] p-2.5 font-sans text-xs text-[#1a2233]">{resumo}</pre>
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={3}
          placeholder="Adicionar observação…"
          className="w-full resize-none rounded-md border border-[#e2e6ed] bg-white p-2.5 text-sm text-[#1a2233] placeholder:text-[#67718a]"
        />
        <button
          type="button"
          onClick={() => onEnviar(observacao.trim() ? `${resumo}\n\nObs.: ${observacao.trim()}` : resumo)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-[#25D366] py-2.5 text-sm font-semibold text-white hover:brightness-95"
        >
          <IconeWhatsApp size={18} />
          Enviar
        </button>
      </div>
    </div>
  );
}

function ModalOrcamento({
  canalNome,
  itens,
  freteKgEfetivo,
  fretePctEfetivo,
  freteMinimo,
  temTransportadora,
  whatsapp,
  onAtualizarQtd,
  onFechar,
}: {
  canalNome: string;
  itens: ItemCarrinho[];
  freteKgEfetivo: number;
  fretePctEfetivo: number;
  freteMinimo: number;
  /** false = canal Manual (sem Transportadora) — Frete Kg/% digitado à mão não é uma referência real de frete, então não calcula: mostra "Cotação de frete" (WhatsApp) em vez de um valor. */
  temTransportadora: boolean;
  whatsapp: string | null;
  onAtualizarQtd: (itemId: string, qtd: number) => void;
  onFechar: () => void;
}) {
  const [concluirAberto, setConcluirAberto] = useState(false);
  const [observacaoWhatsAppAberta, setObservacaoWhatsAppAberta] = useState(false);

  const valorProdutos = itens.reduce((s, i) => s + i.preco * i.qtd, 0);
  const pesoTotalUsado = itens.reduce((s, i) => s + i.pesoUsado * i.qtd, 0);
  const freteBruto = pesoTotalUsado * freteKgEfetivo + (valorProdutos * fretePctEfetivo) / 100;
  const frete = !temTransportadora ? null : itens.length === 0 ? 0 : Math.max(freteBruto, freteMinimo);
  const total = valorProdutos + (frete ?? 0);

  function enviarWhatsApp() {
    setConcluirAberto(false);
    setObservacaoWhatsAppAberta(true);
  }

  function confirmarEnvioWhatsApp(mensagemFinal: string) {
    if (!whatsapp) return;
    window.open(linkWhatsApp(whatsapp, mensagemFinal), '_blank');
    setObservacaoWhatsAppAberta(false);
  }

  function pedirCotacaoFrete() {
    if (!whatsapp) return;
    window.open(linkWhatsApp(whatsapp, montarMensagemCotacaoFrete(canalNome, itens)), '_blank');
  }

  function salvarPdf() {
    gerarOrcamentoPdf(
      canalNome,
      itens.map((i) => ({ nome: i.nome, qtd: i.qtd, precoUnitario: i.preco, subtotal: i.preco * i.qtd })),
      frete,
      total,
    );
    setConcluirAberto(false);
  }

  return (
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[#e2e6ed] px-4 py-3.5">
          <p className="text-sm font-bold text-[#1a2233]">Orçamento — {canalNome}</p>
          <button type="button" onClick={onFechar} className="rounded-md p-1 text-[#67718a] hover:bg-[#f5f7fa]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {itens.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#67718a]">Nenhum produto selecionado ainda — toque num card do catálogo pra adicionar aqui.</p>
          ) : (
            <div className="flex flex-col divide-y divide-[#e2e6ed]">
              {itens.map((item) => (
                <div key={item.id} className="flex flex-col gap-1.5 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-[#1a2233]">
                        <NomeComDestaque nome={item.nome} />
                      </p>
                      {item.fornecedorNome && <p className="truncate text-[10px] font-medium uppercase tracking-wide text-[#67718a]">{item.fornecedorNome}</p>}
                    </div>
                    <button type="button" onClick={() => onAtualizarQtd(item.id, 0)} title="Remover" className="shrink-0 text-[#67718a] hover:text-[#c24444]">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <QuantidadeInput valor={item.qtd} onAlterar={(v) => onAtualizarQtd(item.id, v)} />
                    <div className="text-right">
                      <p className="num text-sm font-semibold text-[#1a2233]">R$ {fmtR(item.preco * item.qtd)}</p>
                      <p className="text-[11px] text-[#67718a]">R$ {fmtR(item.preco)}/un.</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[#e2e6ed] bg-[#f5f7fa] px-4 py-3">
          <div className="mb-2.5 space-y-1 text-sm">
            <div className="flex justify-between text-[#67718a]">
              <span>Produtos</span>
              <span className="num">R$ {fmtR(valorProdutos)}</span>
            </div>
            <div className="flex justify-between text-[#67718a]">
              <span>Frete</span>
              {frete !== null ? (
                <span className="num">R$ {fmtR(frete)}</span>
              ) : whatsapp ? (
                <button type="button" onClick={pedirCotacaoFrete} className="text-xs font-semibold text-[#0e9d74] underline">
                  Cotação de frete
                </button>
              ) : (
                <span className="text-xs">A combinar</span>
              )}
            </div>
            <div className="flex justify-between text-base font-bold text-[#1a2233]">
              <span>{frete === null ? 'Total dos produtos' : 'Total'}</span>
              <span className="num">R$ {fmtR(total)}</span>
            </div>
          </div>
          <button
            type="button"
            disabled={itens.length === 0}
            onClick={() => setConcluirAberto(true)}
            className="w-full rounded-md bg-[#10233f] py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Concluir
          </button>
        </div>
      </div>

      {concluirAberto && <ModalConcluir onWhatsApp={enviarWhatsApp} onPdf={salvarPdf} onFechar={() => setConcluirAberto(false)} />}
      {observacaoWhatsAppAberta && (
        <ModalObservacaoWhatsApp
          resumo={montarMensagemOrcamento(canalNome, itens, frete, total)}
          onEnviar={confirmarEnvioWhatsApp}
          onFechar={() => setObservacaoWhatsAppAberta(false)}
        />
      )}
    </div>
  );
}

/**
 * Link público (sem login) de UMA Tabela de Preço — lê só de `catalogo_publico_itens`/
 * `catalogo_publico_canais` (nome, preço, peso, fornecedor, frete e whatsapp já prontos,
 * publicados pelo operador em Precificação > Exportar > 🌐 Catálogo Online), nunca de
 * `produtos`/`canais_preco` — Custo/Margem nunca chegam nessa página. Ver
 * 0069-0072_catalogo_publico*.sql e publicarCatalogoOnline em pricing/api.ts.
 *
 * `slug` vem de App.tsx (regex na URL, não de <Route>/useParams — esse app não usa roteamento
 * declarativo do react-router, ver o comentário em App.tsx).
 */
export function CatalogoPublicoPage({ slug }: { slug: string }) {
  // Sempre modo claro aqui, independente do que o visitante tiver usado no app interno nesse
  // mesmo navegador (localStorage) ou da preferência do sistema — o toggle de tema não existe
  // nessa página. Só mexe na classe do <html> enquanto essa página está montada.
  useEffect(() => {
    const tinhaDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.remove('dark');
    return () => {
      if (tinhaDark) document.documentElement.classList.add('dark');
    };
  }, []);

  const [cache] = useState(() => lerCache(slug));
  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['catalogo-publico', slug],
    queryFn: () => fetchCatalogoPublicoPorSlug(slug),
    initialData: cache ?? undefined,
    // Sempre busca de novo ao entrar, mesmo com cache — o padrão global (staleTime: 60s, ver
    // main.tsx) faria o cache do localStorage "parecer" recém-buscado e nunca revalidar sozinho.
    staleTime: 0,
  });

  useEffect(() => {
    if (data) salvarCache(slug, data);
  }, [data, slug]);

  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [carrinho, setCarrinho] = useState<Map<string, number>>(new Map());
  const [orcamentoAberto, setOrcamentoAberto] = useState(false);
  const [mensagemWhatsAppAberta, setMensagemWhatsAppAberta] = useState(false);

  function alternarSelecao(itemId: string) {
    setCarrinho((prev) => {
      const proximo = new Map(prev);
      if (proximo.has(itemId)) proximo.delete(itemId);
      else proximo.set(itemId, 1);
      return proximo;
    });
  }

  function atualizarQtd(itemId: string, qtd: number) {
    setCarrinho((prev) => {
      const proximo = new Map(prev);
      if (qtd <= 0) proximo.delete(itemId);
      else proximo.set(itemId, qtd);
      return proximo;
    });
  }

  const categorias = useMemo(() => {
    const vistas = new Set<string>();
    const lista: string[] = [];
    data?.itens.forEach((i) => {
      if (!vistas.has(i.categoriaNome)) {
        vistas.add(i.categoriaNome);
        lista.push(i.categoriaNome);
      }
    });
    return lista;
  }, [data]);

  const itensFiltrados = useMemo(() => {
    if (!data) return [];
    const porCategoria = categoriaFiltro ? data.itens.filter((i) => i.categoriaNome === categoriaFiltro) : data.itens;
    // Mesma lógica de busca da grade interna (PricingPage.tsx): cada palavra digitada precisa
    // aparecer em algum lugar do nome+fornecedor+categoria+subcategoria (qualquer ordem, sem
    // acentuação especial) — nem todo nome de produto carrega a Categoria/Classe dele.
    const palavras = busca.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (palavras.length === 0) return porCategoria;
    return porCategoria.filter((i) => {
      const descricao = `${i.nome} ${i.fornecedorNome ?? ''} ${i.categoriaNome} ${i.subcategoriaNome ?? ''}`.toLowerCase();
      return palavras.every((palavra) => descricao.includes(palavra));
    });
  }, [data, categoriaFiltro, busca]);

  // Categoria -> blocos "colados" (mesmo produto/variantes, ver chaveComparacaoNome — mesma regra
  // do PDF de catálogo) -> itens. Produto diferente do anterior sempre inicia um bloco novo (espaço
  // padrão entre blocos); mesma família de produto continua no MESMO bloco (visualmente colado).
  const grupos = useMemo(() => {
    const porCategoria: { categoriaNome: string; blocos: { chave: string; itens: ItemCatalogo[] }[] }[] = [];
    itensFiltrados.forEach((item) => {
      let grupoAtual = porCategoria[porCategoria.length - 1];
      if (!grupoAtual || grupoAtual.categoriaNome !== item.categoriaNome) {
        grupoAtual = { categoriaNome: item.categoriaNome, blocos: [] };
        porCategoria.push(grupoAtual);
      }
      const chave = chaveComparacaoNome(item.nome);
      const blocoAtual = grupoAtual.blocos[grupoAtual.blocos.length - 1];
      if (blocoAtual && blocoAtual.chave === chave) blocoAtual.itens.push(item);
      else grupoAtual.blocos.push({ chave, itens: [item] });
    });
    return porCategoria;
  }, [itensFiltrados]);

  const itensCarrinho: ItemCarrinho[] = useMemo(() => {
    if (!data) return [];
    const porId = new Map(data.itens.map((i) => [i.id, i]));
    return Array.from(carrinho.entries())
      .map(([id, qtd]) => {
        const item = porId.get(id);
        return item ? { ...item, qtd } : null;
      })
      .filter((x): x is ItemCarrinho => x !== null);
  }, [carrinho, data]);

  const semNadaAindaCarregando = isLoading && !data;

  return (
    <div className="min-h-screen bg-[#f5f7fa] pb-20">
      <header className="relative border-b border-[#e2e6ed] bg-[#10233f] px-4 py-4 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Ceará Sementes</p>
        <h1 className="mt-0.5 truncate text-lg font-bold pr-14">{data?.canalNome ?? (semNadaAindaCarregando ? 'Carregando…' : 'Catálogo')}</h1>
        {isFetching && <Loader2 size={16} className="absolute right-4 top-4 animate-spin text-white/70" aria-label="Atualizando…" />}
      </header>

      <div className="border-b border-[#e2e6ed] bg-white px-3 py-2.5">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#67718a]" />
          <input
            type="text"
            inputMode="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto…"
            className="w-full rounded-md border border-[#e2e6ed] bg-[#f5f7fa] py-2 pl-8 pr-8 text-sm text-[#1a2233] placeholder:text-[#67718a]"
          />
          {busca && (
            <button type="button" onClick={() => setBusca('')} title="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 text-[#67718a] hover:text-[#1a2233]">
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {categorias.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-[#e2e6ed] bg-white px-3 py-2.5">
          <button
            type="button"
            onClick={() => setCategoriaFiltro(null)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${categoriaFiltro === null ? 'bg-[#10233f] text-white' : 'bg-[#f5f7fa] text-[#67718a]'}`}
          >
            Todas
          </button>
          {categorias.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoriaFiltro(cat)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${categoriaFiltro === cat ? 'bg-[#10233f] text-white' : 'bg-[#f5f7fa] text-[#67718a]'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <main className="mx-auto max-w-2xl px-3 py-4">
        {semNadaAindaCarregando && <p className="text-sm text-[#67718a]">Carregando catálogo…</p>}

        {isError && !data && <p className="text-sm text-[#c24444]">Não foi possível carregar esse catálogo. Confira o link e tente de novo.</p>}

        {!semNadaAindaCarregando && !isError && data && data.itens.length === 0 && (
          <p className="text-sm text-[#67718a]">Esse catálogo ainda não tem produtos publicados.</p>
        )}

        {!semNadaAindaCarregando && !isError && data && data.itens.length > 0 && itensFiltrados.length === 0 && (
          <p className="text-sm text-[#67718a]">Nenhum produto encontrado com esse filtro/busca.</p>
        )}

        {grupos.map((grupo) => (
          <section key={grupo.categoriaNome} className="mb-5">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#67718a]">{grupo.categoriaNome}</h2>
            <div className="flex flex-col gap-2">
              {grupo.blocos.map((bloco, i) => (
                <div key={bloco.chave + i} className="overflow-hidden rounded-lg border border-[#e2e6ed] shadow-sm">
                  {bloco.itens.map((item, j) => (
                    <div key={item.id} className={j > 0 ? 'border-t border-[#e2e6ed]' : ''}>
                      <LinhaProduto item={item} selecionado={carrinho.has(item.id)} onClick={() => alternarSelecao(item.id)} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>

      {carrinho.size > 0 && (
        <button
          type="button"
          onClick={() => setOrcamentoAberto(true)}
          title="Ver orçamento"
          className="fixed right-5 top-5 z-[190] flex h-12 w-12 items-center justify-center rounded-full bg-[#10233f] text-white shadow-lg hover:brightness-110"
        >
          <ShoppingCart size={20} />
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#f5f7fa] bg-[#0e9d74] px-0.5 text-[10px] font-bold leading-none">
            {carrinho.size}
          </span>
        </button>
      )}

      {data?.whatsapp && (
        <button
          type="button"
          onClick={() => setMensagemWhatsAppAberta(true)}
          title="Falar no WhatsApp"
          className="fixed bottom-5 right-5 z-[190] flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg hover:brightness-95"
        >
          <IconeWhatsApp size={26} />
        </button>
      )}

      {mensagemWhatsAppAberta && data?.whatsapp && (
        <ModalMensagemWhatsApp
          mensagemInicial="Olá! Vim do catálogo online."
          onEnviar={(mensagem) => {
            window.open(linkWhatsApp(data.whatsapp!, mensagem), '_blank');
            setMensagemWhatsAppAberta(false);
          }}
          onFechar={() => setMensagemWhatsAppAberta(false)}
        />
      )}

      {orcamentoAberto && data && (
        <ModalOrcamento
          canalNome={data.canalNome ?? ''}
          itens={itensCarrinho}
          freteKgEfetivo={data.freteKgEfetivo}
          fretePctEfetivo={data.fretePctEfetivo}
          freteMinimo={data.freteMinimo}
          temTransportadora={data.temTransportadora}
          whatsapp={data.whatsapp}
          onAtualizarQtd={atualizarQtd}
          onFechar={() => setOrcamentoAberto(false)}
        />
      )}
    </div>
  );
}
