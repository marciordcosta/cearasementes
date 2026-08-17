import { Calculator, FileText, Loader2, Search, Truck, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NomeComDestaque } from '@/components/ui/NomeComDestaque';
import {
  arredondarSacos,
  covasM2Alvo,
  distanciaDeCovasM2,
  distanciaIdealProduto,
  espacamentoDeDistancia,
  kgPorHaDeSementesCova,
  sementesComAjustePorDistancia,
} from '@/features/arquivos/calculoSemeadura';
import { paraNumero } from '@/features/arquivos/metricas';
import { chaveComparacaoProduto } from '@/features/pricing/calculations';
import { fetchCatalogoPublicoPorSlug, type CatalogoPublico } from '@/features/pricing/api';
import { gerarCatalogoPublicoPdf, gerarCatalogoPublicoPdfBlob } from '@/features/pricing/catalogoPublicoPdf';
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

/**
 * `freteDescricao` já vem pronto de descreverFrete() — cobre os 4 estados (cotação/não
 * calculado/retirada/valor), então aqui só monta o texto, sem saber de onde veio. Cada item em 2
 * linhas — nome+fornecedor+peso, depois qtd × unitário = subtotal — com uma linha em branco
 * separando um item do outro.
 */
function montarMensagemOrcamento(canalNome: string, itens: ItemCarrinho[], freteDescricao: string, total: number): string {
  const blocos = itens.map((i) => {
    const nomeLimpo = i.nome.replace(/[*_]/g, '');
    const linhaNome = [nomeLimpo, i.fornecedorNome, `${Math.round(i.peso)}kg`].filter(Boolean).join(' ');
    const linhaValores = `${i.qtd} x R$ ${fmtR(i.preco)} = R$ ${fmtR(i.preco * i.qtd)}`;
    return `${linhaNome}\n${linhaValores}`;
  });
  return [`Orçamento — ${canalNome}`, '', blocos.join('\n\n'), '', `Frete: ${freteDescricao}`, `Total: R$ ${fmtR(total)}`].join('\n');
}

function montarMensagemCotacaoFrete(canalNome: string, itens: ItemCarrinho[]): string {
  const linhas = itens.map((i) => `${i.qtd}x ${i.nome.replace(/[*_]/g, '')}`);
  return [`Olá! Gostaria de uma cotação de frete — ${canalNome}`, '', ...linhas].join('\n');
}

/** Mesmo formato de lista usada no Orçamento (qtd×nome — R$ subtotal), sem Frete/Total geral — aqui é só contexto extra numa mensagem de contato solta, não um orçamento formal. Carrinho vazio devolve a mensagem base sem alteração. */
function montarMensagemComCarrinho(mensagemBase: string, itens: ItemCarrinho[]): string {
  if (itens.length === 0) return mensagemBase;
  const blocos = itens.map((i) => `${i.qtd}x ${i.nome.replace(/[*_]/g, '')} — R$ ${fmtR(i.preco * i.qtd)}`);
  return [mensagemBase, '', 'Produtos de interesse:', ...blocos].join('\n');
}

/** Ícone oficial do WhatsApp (glifo público, mesmo usado em botões "fale conosco" pela web afora). */
function IconeWhatsApp({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86.173.087.274.072.376-.043.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564c.173.087.289.13.332.202.043.072.043.419-.101.824zM12 2C6.477 2 2 6.477 2 12c0 1.795.474 3.48 1.303 4.937L2 22l5.184-1.361A9.938 9.938 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" />
    </svg>
  );
}

/** Selo de check — mesmo usado no card do produto (LinhaProduto) pra indicar "marcado"/"no carrinho" — reaproveitado na Calculadora de plantio (ver LinhaCalculadoraPlantio) pra indicar cart, mesma linguagem visual. */
function IconeCheck() {
  return (
    <span className="shrink-0 rounded-full bg-[#0e9d74] p-0.5 text-white">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

/**
 * 1 linha (produto) — usada tanto sozinha (card próprio) quanto dentro de um bloco "colado"
 * (variantes do mesmo produto, ver agruparPorProduto). Fornecedor SEMPRE numa linha própria embaixo
 * do nome, mesmo quando o nome é curto e caberia do lado — padronizado, não depende do fluxo de
 * texto quebrar sozinho. `mostrarDetalhes` (Canal.mostrarDetalhesPlantio E Produto.mostrarDetalhesCatalogo
 * juntos, ver ChannelsPanel.tsx/EditProductModal.tsx — o produto SOBREPÕE a Tabela só pra esconder,
 * nunca pra forçar mostrar quando a Tabela está desligada) — só quando os dois permitem, VC%/
 * PMS/Validade entram na mesma linha discreta, nessa ordem: Fornecedor > VC% > PMS > Validade;
 * desligado, mostra só o Fornecedor. PMS aqui é sempre o digitado NESSE laudo (plantioPmsManual) —
 * nunca o base da Parametrização. Fornecedor com mais peso (font-medium) que VC%/PMS/Validade
 * (font-light, peso 300) — mesmo tamanho de fonte, mas com menos destaque, pra não competir de
 * igual com o Fornecedor.
 */
function LinhaProduto({ item, selecionado, mostrarDetalhes, onClick }: { item: ItemCatalogo; selecionado: boolean; mostrarDetalhes: boolean; onClick: () => void }) {
  const detalhesPartes = [
    mostrarDetalhes && item.plantioVc != null ? `VC ${Math.round(item.plantioVc)}%` : null,
    mostrarDetalhes && item.plantioPmsManual ? `PMS ${item.plantioPmsManual}` : null,
    mostrarDetalhes && item.plantioValidade ? `Val. ${item.plantioValidade}` : null,
  ].filter((parte): parte is string => !!parte);

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
        {(item.fornecedorNome || detalhesPartes.length > 0) && (
          <p className="truncate text-[10px] uppercase tracking-wide text-[#67718a]">
            {item.fornecedorNome && <span className="font-medium">{item.fornecedorNome}</span>}
            {item.fornecedorNome && detalhesPartes.length > 0 && ' · '}
            {detalhesPartes.length > 0 && <span className="font-light">{detalhesPartes.join(' · ')}</span>}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="num text-base font-bold text-[#0e9d74]">R$ {fmtR(item.preco)}</p>
        <p className="text-[11px] text-[#67718a]">{Math.round(item.peso)}kg</p>
      </div>
      {selecionado && <IconeCheck />}
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
  titulo = 'Como você quer o orçamento?',
  onWhatsApp,
  onPdf,
  onFechar,
}: {
  titulo?: string;
  onWhatsApp: () => void;
  onPdf: () => void;
  onFechar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/45 p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="w-full max-w-xs rounded-xl bg-white p-4 shadow-2xl">
        <p className="mb-3 text-center text-sm font-semibold text-[#1a2233]">{titulo}</p>
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

/**
 * Número de destino pra "Enviar por WhatsApp" o catálogo em PDF — sempre Brasil, "+55" fixo, só
 * pede DDD+número (ver ModalConcluir/gerarCatalogoPublicoPdfBlob). O envio automático de arquivo
 * sem ação nenhuma do cliente não é possível num site comum (exigiria a API paga do WhatsApp
 * Business); o mais próximo é baixar o PDF e já abrir a conversa certa (wa.me abre o app no
 * celular, o WhatsApp Web no computador), faltando só o cliente anexar o arquivo recém-baixado.
 */
function ModalNumeroWhatsApp({ enviando, onEnviar, onFechar }: { enviando: boolean; onEnviar: (digitos: string) => void; onFechar: () => void }) {
  const [numero, setNumero] = useState('');
  const digitos = numero.replace(/\D/g, '');
  const valido = digitos.length >= 10;
  return (
    <div className="fixed inset-0 z-[230] flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="w-full max-w-xs rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-bold text-[#1a2233]">Enviar catálogo pro WhatsApp</p>
          <button type="button" onClick={onFechar} className="rounded-md p-1 text-[#67718a] hover:bg-[#f5f7fa]">
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-xs text-[#67718a]">O PDF é baixado e a conversa já abre nesse número — é só anexar o arquivo.</p>
        <div className="flex items-center gap-1.5">
          <span className="rounded-md border border-[#e2e6ed] bg-[#f5f7fa] px-2.5 py-2 text-sm font-medium text-[#67718a]">+55</span>
          <input
            type="tel"
            inputMode="numeric"
            autoFocus
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="DDD + número"
            className="num flex-1 rounded-md border border-[#e2e6ed] bg-white px-2.5 py-2 text-sm text-[#1a2233] placeholder:text-[#67718a]"
          />
        </div>
        <button
          type="button"
          disabled={!valido || enviando}
          onClick={() => onEnviar(digitos)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-[#25D366] py-2.5 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <IconeWhatsApp size={18} />}
          {enviando ? 'Gerando PDF…' : 'Enviar'}
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
  totalAreaHa,
  whatsapp,
  onAtualizarQtd,
  onAbrirCalculadora,
  onFechar,
}: {
  canalNome: string;
  itens: ItemCarrinho[];
  freteKgEfetivo: number;
  fretePctEfetivo: number;
  freteMinimo: number;
  /** false = canal Manual (sem Transportadora) — Frete Kg/% digitado à mão não é uma referência real de frete, então não calcula: mostra "Cotação de frete" (WhatsApp) em vez de um valor. */
  temTransportadora: boolean;
  /** Soma da Área (ha) digitada em cada produto na Calculadora de plantio (ver areasPorItem em CatalogoPublicoPage) — 0 quando ninguém usou a calculadora ainda. */
  totalAreaHa: number;
  whatsapp: string | null;
  onAtualizarQtd: (itemId: string, qtd: number) => void;
  /** "Área total" nos totais é o link pra Calculadora de plantio — fecha o Orçamento e abre a Calculadora (ver render em CatalogoPublicoPage). */
  onAbrirCalculadora: () => void;
  onFechar: () => void;
}) {
  const [concluirAberto, setConcluirAberto] = useState(false);
  const [observacaoWhatsAppAberta, setObservacaoWhatsAppAberta] = useState(false);
  // Sempre nasce "não calculado" — some quando o Orçamento fecha (desmonta) e volta a pedir clique
  // na próxima vez que abrir, mesmo pro mesmo carrinho. Só faz sentido quando temTransportadora (a
  // "Cotação de frete" do canal Manual é um fluxo à parte, ver pedirCotacaoFrete).
  const [estadoFrete, setEstadoFrete] = useState<'nao_calculado' | 'calculado' | 'retirada'>('nao_calculado');

  const valorProdutos = itens.reduce((s, i) => s + i.preco * i.qtd, 0);
  const pesoTotalUsado = itens.reduce((s, i) => s + i.pesoUsado * i.qtd, 0);
  const freteBruto = pesoTotalUsado * freteKgEfetivo + (valorProdutos * fretePctEfetivo) / 100;
  const freteCalculado = itens.length === 0 ? 0 : Math.max(freteBruto, freteMinimo);
  const freteIncluidoNoTotal = temTransportadora && estadoFrete === 'calculado';
  const total = valorProdutos + (freteIncluidoNoTotal ? freteCalculado : 0);

  function alternarFrete() {
    // 1º clique (nao_calculado) mostra o valor; daí em diante alterna valor <-> Retirar no local.
    setEstadoFrete((atual) => (atual === 'calculado' ? 'retirada' : 'calculado'));
  }

  function descreverFrete(): string {
    if (!temTransportadora) return 'a combinar (cotação à parte)';
    if (estadoFrete === 'retirada') return 'Retirar no local';
    if (estadoFrete === 'calculado') return `R$ ${fmtR(freteCalculado)}`;
    return 'a calcular';
  }

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
      descreverFrete(),
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
              {!temTransportadora ? (
                whatsapp ? (
                  <button type="button" onClick={pedirCotacaoFrete} className="text-xs font-semibold text-[#0e9d74] underline">
                    Cotação de frete
                  </button>
                ) : (
                  <span className="text-xs">A combinar</span>
                )
              ) : (
                <button type="button" onClick={alternarFrete} className={`text-xs ${estadoFrete === 'nao_calculado' ? 'font-semibold text-[#0e9d74] underline' : 'num text-[#67718a] underline'}`}>
                  {estadoFrete === 'nao_calculado' ? 'Calcular frete' : estadoFrete === 'retirada' ? 'Retirar no local' : `R$ ${fmtR(freteCalculado)}`}
                </button>
              )}
            </div>
            <div className="flex justify-between text-base font-bold text-[#1a2233]">
              <span>{freteIncluidoNoTotal ? 'Total' : 'Total dos produtos'}</span>
              <span className="num">R$ {fmtR(total)}</span>
            </div>
            {totalAreaHa > 0 && (
              <button
                type="button"
                onClick={() => {
                  onFechar();
                  onAbrirCalculadora();
                }}
                title="Abrir a Calculadora de plantio"
                className="flex w-full justify-between text-xs font-semibold text-[#0e9d74] underline"
              >
                <span>Área total (calculadora de plantio)</span>
                <span className="num">{totalAreaHa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha</span>
              </button>
            )}
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
          resumo={montarMensagemOrcamento(canalNome, itens, descreverFrete(), total)}
          onEnviar={confirmarEnvioWhatsApp}
          onFechar={() => setObservacaoWhatsAppAberta(false)}
        />
      )}
    </div>
  );
}

/**
 * Sementes/cova AJUSTADA ao Corredor digitado pelo cliente — mesma conta do Guia interno (regra
 * GERAL, ver sementesCovaAtual em calculoSemeadura.ts), só que aqui partindo do snapshot publicado
 * (`sementesCovaBase`, já resolvido "no espaçamento padrão"/50cm) em vez de recalcular germinação/
 * densidade a cada tecla — a página pública nunca vê laudo algum. Usada tanto pro kg/ha (ver
 * kgHaCovas) quanto pra exibir "Sementes por cova" (só informativo, sem edição).
 */
function sementesCovaAjustada(sementesCovaBase: number, corredorTexto: string): number | null {
  const distancia = distanciaDeCovasM2(covasM2Alvo(), corredorTexto);
  const espacamentoAtual = espacamentoDeDistancia(distancia, corredorTexto);
  if (espacamentoAtual === null) return null;
  return sementesComAjustePorDistancia(sementesCovaBase, espacamentoAtual, distanciaIdealProduto());
}

/** kg/ha em modo Covas — Sementes/cova ajustada (ver sementesCovaAjustada) × Covas/m² alvo × PMS. */
function kgHaCovas(sementesCovaBase: number, pms: number, corredorTexto: string): number | null {
  const sementesAjustada = sementesCovaAjustada(sementesCovaBase, corredorTexto);
  return sementesAjustada === null ? null : kgPorHaDeSementesCova(covasM2Alvo(), sementesAjustada, pms);
}

type ModoPlantio = 'lanco' | 'covas';

/**
 * 1 produto marcado, dentro da calculadora — cálculo e estado (modo/corredor) 100% independentes dos
 * outros produtos marcados (ver ModalCalculadoraPlantio, que só empilha uma dessas por item do
 * carrinho). Área é a ÚNICA parte do estado que mora no componente pai (CatalogoPublicoPage,
 * `areasPorItem`) — precisa disso pra somar o total de hectares no rodapé daqui E do Orçamento (ver
 * totalAreaHa). O Nº de embalagens mostrado aqui é CALCULADO a partir da Área (atualiza a cada tecla)
 * mas só entra no carrinho quando o cliente clica em "Usar N embalagens" — a partir daí os campos
 * (Área/modo/Distância) TRAVAM (disabled, ver `travado`), pra não parecer que o card ainda tá "ao vivo"
 * enquanto o carrinho já ficou com outro valor. Clicar de novo no botão ("No carrinho: N ✓") só
 * DESTRAVA os campos pra editar — NÃO mexe no carrinho (`travado` é estado local, independente da qtd
 * real): a qtd que já tava lá fica intocada até o cliente clicar em "Usar" de novo com o novo cálculo;
 * fechar sem reenviar mantém a qtd anterior. Mesma conta do Guia de Plantio interno (kg/ha), condição
 * sempre "Média" (sem seletor aqui) e só 2 modos (A Lanço/Covas — nunca Milho/Sorgo com Sementes/cova
 * editável nem modo Linha, ver
 * resolverPlantioParaProduto em calculoSemeadura.ts). Campos compactados (rótulos/paddings menores)
 * pra caber vários produtos empilhados sem rolagem excessiva.
 */
function LinhaCalculadoraPlantio({
  item,
  area,
  onAlterarArea,
  onDefinirQtd,
}: {
  item: ItemCarrinho;
  /** undefined = ainda sem Área guardada pra esse produto (nunca editada aqui) — diferente de "" ou "1", precisa dar pra distinguir do valor padrão pra decidir se faz o backfill reverso abaixo. */
  area: string | undefined;
  onAlterarArea: (valor: string) => void;
  /** Nunca desmarca o produto (ao contrário do onAtualizarQtd do Orçamento) — zerar aqui só tira da conta do pedido, o produto continua com linha própria na calculadora (ver definirQtdCarrinho em CatalogoPublicoPage). */
  onDefinirQtd: (itemId: string, qtd: number) => void;
}) {
  const [modo, setModo] = useState<ModoPlantio>(item.plantioKgHaLanco != null ? 'lanco' : 'covas');
  const [corredor, setCorredor] = useState('50');
  // Estado local, independente da qtd real do carrinho — só controla se os campos estão travados
  // (mostrando o que já foi aplicado) ou liberados pra editar. Nasce travado quando o produto já chega
  // com qtd>0 (ex.: marcado direto na lista); "editar" (ver botão) só muda ISSO, nunca zera o carrinho.
  const [travado, setTravado] = useState(item.qtd > 0);

  const temPlantio = item.plantioKgHaLanco != null || item.plantioSementesCovaBase != null;
  const temOsDoisModos = item.plantioKgHaLanco != null && item.plantioSementesCovaBase != null && item.plantioPms != null;

  const kgPorHa =
    modo === 'lanco'
      ? (item.plantioKgHaLanco ?? null)
      : item.plantioSementesCovaBase != null && item.plantioPms != null
        ? kgHaCovas(item.plantioSementesCovaBase, item.plantioPms, corredor)
        : null;

  const areaNum = paraNumero(area ?? '1');
  const totalKg = kgPorHa !== null && areaNum !== null && areaNum > 0 ? Math.ceil(kgPorHa) * areaNum : null;

  // Campos de Covas (distância, sementes/peso por cova) — calculados INDEPENDENTE do modo ativo, não
  // só quando `modo === 'covas'`: o card reserva o espaço deles sempre que o produto tem dado de Covas
  // (`temDadosCovas` abaixo), só alternando visibilidade (`invisible`, mantém o espaço) conforme o
  // modo — trocar de aba não pode fazer o card "pular" de tamanho.
  const temDadosCovas = item.plantioSementesCovaBase != null;
  // Distância entre covas (cm) — mesma referência do Guia interno (Covas/m² alvo travado em 4, ver
  // covasM2Alvo), só informativo: quem trava o espaçamento é a Distância entre linhas mesmo.
  const distanciaCovas = distanciaDeCovasM2(covasM2Alvo(), corredor);
  const sementesPorCovaBruta = temDadosCovas ? sementesCovaAjustada(item.plantioSementesCovaBase!, corredor) : null;
  // Sementes Tradicionais soltas não dá pra contar uma a uma pra colocar na cova, só pesar (ver
  // precisaPesoPorCova em calculoSemeadura.ts) — mostra Peso/cova (g), via PMS, em vez da contagem
  // crua; sem PMS nenhum (nem do lote, nem base da Parametrização), não dá pra converter em peso.
  const pesoPorCovaGramas =
    sementesPorCovaBruta !== null && item.plantioPrecisaPesoPorCova && item.plantioPms != null && item.plantioPms > 0 ? (sementesPorCovaBruta * item.plantioPms) / 1000 : null;
  const sementesPorCova = item.plantioPrecisaPesoPorCova ? null : sementesPorCovaBruta;

  // Nº de embalagens = Total necessário ÷ peso da embalagem desse produto (já cadastrado, o mesmo
  // peso mostrado no card) — arredondado pela MESMA margem de tolerância por grupo do Guia de
  // Plantio interno (ver arredondarSacos em calculoSemeadura.ts), não um Math.ceil puro: até essa %
  // de embalagem faltando ainda arredonda pra baixo, acima arredonda pra cima.
  const qtdEmbalagensCalculada = totalKg !== null && item.peso > 0 ? arredondarSacos(totalKg / item.peso, (item.plantioMargemTolerancia ?? 25) / 100) : null;

  // Produto já no carrinho (qtd real) pode ter chegado lá sem passar pelo "Usar" daqui (marcado direto
  // na lista principal, ou a qtd ajustada no Orçamento) — nesses casos a Área/resultado recalculados a
  // partir da `area` guardada não batem com a qtd de verdade. Enquanto `travado`, tudo que aparece
  // (Área, kg total, embalagens, valor) reflete a qtd REAL do carrinho (exata, sem arredondamento) em
  // vez do que sairia recalculando do zero — inclusive a Área mostrada é a REVERSA (aproximada — o
  // inverso de totalKg = Math.ceil(kgPorHa) × área) que corresponde a essa qtd.
  const areaReversaDoCarrinho =
    kgPorHa !== null && kgPorHa > 0 && item.peso > 0 ? String(Math.round(((item.qtd * item.peso) / Math.ceil(kgPorHa)) * 100) / 100) : null;
  const qtdEmbalagens = travado ? item.qtd : qtdEmbalagensCalculada;
  const totalKgExibido = travado ? (item.peso > 0 ? item.qtd * item.peso : null) : totalKg;
  const areaCorrespondenteAoCarrinho = travado && areaReversaDoCarrinho !== null ? areaReversaDoCarrinho : (area ?? '1');

  // Guarda travado/Área reversa do render anterior — só pra distinguir DOIS motivos diferentes de
  // recalcular a Área guardada (nunca a qtd do carrinho, só essa informação pro total de hectares):
  // 1) Produto que chega já travado (marcado direto na lista, nunca passou pelo "Usar" daqui) não tem
  //    Área guardada (`area` undefined) — sem isso, o total de hectares (ver totalAreaHa em
  //    CatalogoPublicoPage) fica 0 pra esse produto mesmo mostrando uma Área reversa aqui.
  // 2) A Área reversa mudou por FORA de editar o campo, enquanto já estava travado — tanto por a qtd
  //    mudar (ex.: stepper do Orçamento) quanto por trocar o modo Lanço/Covas aqui mesmo (só o modo
  //    continua liberado quando travado — Lanço e Covas têm Taxa de semeadura diferente, então a MESMA
  //    qtd real corresponde a uma Área diferente em cada modo). A Área guardada acompanha os dois casos.
  // Deliberadamente NÃO recalcula só porque acabou de travar via "Usar" — nesse caso a Área já foi
  // guardada pelo próprio campo (onChange) enquanto o cliente editava, e a reversa (aproximada, por
  // causa da margem de tolerância de arredondarSacos) poderia "corrigir" o valor certinho que o
  // cliente digitou pra um número ligeiramente diferente, sem ele ter mexido em nada.
  const anteriorRef = useRef({ travado, areaReversa: areaReversaDoCarrinho });
  useEffect(() => {
    const anterior = anteriorRef.current;
    const chegouTravadoSemArea = travado && area === undefined;
    const mudouPorForaJaTravado = anterior.travado && travado && anterior.areaReversa !== areaReversaDoCarrinho;
    if ((chegouTravadoSemArea || mudouPorForaJaTravado) && areaReversaDoCarrinho !== null) {
      onAlterarArea(areaReversaDoCarrinho);
    }
    anteriorRef.current = { travado, areaReversa: areaReversaDoCarrinho };
  }, [travado, area, areaReversaDoCarrinho, onAlterarArea]);

  if (!temPlantio) {
    return (
      <div className="rounded-md border border-[#e2e6ed] bg-[#f5f7fa] p-2.5">
        <p className="text-sm font-semibold text-[#1a2233]">
          <NomeComDestaque nome={item.nome} />
        </p>
        <p className="mt-1 text-xs text-[#67718a]">Sem dado de plantio pra esse produto.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-[#e2e6ed] bg-[#f5f7fa] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1a2233]">
          <NomeComDestaque nome={item.nome} />
        </p>
        {temOsDoisModos && (
          <div className="flex shrink-0 gap-1">
            {(['lanco', 'covas'] as const).map((m) => (
              <button
                key={m}
                type="button"
                title={travado ? 'Já travado — trocar o modo só reexpressa a mesma quantidade real, a Área ajusta sozinha' : undefined}
                onClick={() => setModo(m)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${modo === m ? 'bg-[#10233f] text-white' : 'bg-white text-[#67718a]'}`}
              >
                {m === 'lanco' ? 'Lanço' : 'Covas'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`grid gap-1.5 ${temDadosCovas ? 'grid-cols-3' : 'grid-cols-1'}`}>
        <label className="block text-[10px] text-[#67718a]">
          Área (ha)
          <input
            type="number"
            inputMode="decimal"
            value={areaCorrespondenteAoCarrinho}
            disabled={travado}
            onChange={(e) => onAlterarArea(e.target.value)}
            className="num mt-0.5 w-full rounded-md border border-[#e2e6ed] bg-white px-2 py-1 text-sm text-[#1a2233] disabled:cursor-not-allowed disabled:bg-[#eef1f5] disabled:text-[#67718a]"
          />
        </label>
        {temDadosCovas && (
          <>
            <label className={`block text-[10px] text-[#67718a] ${modo !== 'covas' ? 'invisible' : ''}`}>
              Dist. linhas (cm)
              <input
                type="number"
                inputMode="decimal"
                value={corredor}
                disabled={travado}
                onChange={(e) => setCorredor(e.target.value)}
                className="num mt-0.5 w-full rounded-md border border-[#e2e6ed] bg-white px-2 py-1 text-sm text-[#1a2233] disabled:cursor-not-allowed disabled:bg-[#eef1f5] disabled:text-[#67718a]"
              />
            </label>
            <label className={`block text-[10px] text-[#67718a] ${modo !== 'covas' ? 'invisible' : ''}`}>
              Dist. covas (cm)
              <input
                type="text"
                readOnly
                disabled
                value={distanciaCovas !== null ? Math.round(distanciaCovas) : '—'}
                title="Travada — segue a Distância entre linhas, mantendo a densidade de covas por m² sempre igual"
                className="num mt-0.5 w-full cursor-not-allowed rounded-md border border-[#e2e6ed] bg-[#eef1f5] px-2 py-1 text-sm text-[#67718a]"
              />
            </label>
          </>
        )}
      </div>

      <p className="text-[10px] text-[#67718a]">
        Taxa de semeadura: <span className="num font-semibold text-[#1a2233]">{kgPorHa !== null ? `${Math.ceil(kgPorHa)} kg/ha` : '—'}</span>
        {modo === 'covas' && sementesPorCova !== null && (
          <>
            {' '}
            · Sementes por cova: <span className="num font-semibold text-[#1a2233]">{Math.round(sementesPorCova)}</span>
          </>
        )}
        {modo === 'covas' && sementesPorCova === null && pesoPorCovaGramas !== null && (
          <>
            {' '}
            · Peso por cova (g): <span className="num font-semibold text-[#1a2233]">{pesoPorCovaGramas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
          </>
        )}
      </p>

      <div className="space-y-0.5 rounded-md bg-white px-2.5 py-1.5 text-xs">
        {totalKgExibido !== null && (
          <div className="flex justify-between">
            <span className="text-[#67718a]">Qtd total em Kg</span>
            <span className="num font-bold text-[#0e9d74]">{Math.ceil(totalKgExibido)} kg</span>
          </div>
        )}
        {qtdEmbalagens !== null && (
          <div className="flex justify-between">
            <span className="text-[#67718a]">Qtd total em sacos</span>
            <span className="num font-semibold text-[#1a2233]">
              {qtdEmbalagens} ({Math.round(item.peso)}kg cada)
            </span>
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={!travado && qtdEmbalagensCalculada === null}
        onClick={() => {
          if (travado) setTravado(false);
          else if (qtdEmbalagensCalculada !== null) {
            onDefinirQtd(item.id, qtdEmbalagensCalculada);
            setTravado(true);
          }
        }}
        title={travado ? 'Libera os campos pra editar — o carrinho só muda quando enviar de novo' : undefined}
        className={`w-full rounded-md py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
          travado ? 'bg-[#e4f6ef] text-[#0e9d74] hover:bg-[#d7f0e6]' : 'bg-[#10233f] text-white hover:brightness-110'
        }`}
      >
        {travado ? `No carrinho: ${item.qtd} ✓ — clique pra editar` : `Usar ${qtdEmbalagensCalculada ?? '—'} embalagens no carrinho`}
      </button>
    </div>
  );
}

/**
 * Calculadora de plantio do Catálogo Online — trabalha SEMPRE em cima da mesma seleção do carrinho
 * (marcar um produto na lista principal marca pro carrinho E pra calculadora, exatamente como um item
 * de carrinho): cada produto marcado ganha sua própria linha com cálculo 100% independente dos outros
 * (ver LinhaCalculadoraPlantio) — sem busca própria aqui dentro, pra adicionar mais um produto à conta
 * é só marcar mais um na tela principal. Cada linha calcula o Nº de embalagens a partir da Área, mas só
 * entra no carrinho quando o cliente clica em "Usar N embalagens" (ver LinhaCalculadoraPlantio) — nada
 * automático. Clicar em "No carrinho: N ✓" de novo só DESTRAVA os campos pra editar, nunca mexe na qtd
 * do carrinho (ver `travado` em LinhaCalculadoraPlantio) — a qtd anterior fica valendo até o cliente
 * clicar em "Usar" de novo com o cálculo atualizado. Só desmarcar na tela principal tira o produto
 * daqui de vez (e do carrinho). Produto marcado sem laudo correspondente aparece com aviso, sem campos.
 */
function ModalCalculadoraPlantio({
  itens,
  areasPorItem,
  totalAreaHa,
  whatsapp,
  onAlterarArea,
  onDefinirQtd,
  onAbrirCarrinho,
  onFechar,
}: {
  itens: ItemCarrinho[];
  areasPorItem: Map<string, string>;
  /** Soma da Área (ha) de todos os itens (ver totalAreaHa em CatalogoPublicoPage) — mesmo total mostrado no Orçamento. */
  totalAreaHa: number;
  whatsapp: string | null;
  onAlterarArea: (itemId: string, valor: string) => void;
  onDefinirQtd: (itemId: string, qtd: number) => void;
  /** Link "Ir para o carrinho" no rodapé — fecha a Calculadora e abre o Orçamento (ver render em CatalogoPublicoPage). */
  onAbrirCarrinho: () => void;
  onFechar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[#e2e6ed] px-4 py-3.5">
          <p className="text-sm font-bold text-[#1a2233]">Calculadora de plantio</p>
          <button type="button" onClick={onFechar} className="rounded-md p-1 text-[#67718a] hover:bg-[#f5f7fa]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {itens.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#67718a]">Marque um ou mais produtos no catálogo pra calcular a quantidade de sementes necessária.</p>
          ) : (
            itens.map((item) => (
              <LinhaCalculadoraPlantio
                key={item.id}
                item={item}
                area={areasPorItem.get(item.id)}
                onAlterarArea={(valor) => onAlterarArea(item.id, valor)}
                onDefinirQtd={onDefinirQtd}
              />
            ))
          )}

          {itens.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onFechar();
                onAbrirCarrinho();
              }}
              className="w-full text-center text-xs font-semibold text-[#0e9d74] underline"
            >
              Ir para o carrinho
            </button>
          )}

          {totalAreaHa > 0 && (
            <div className="flex justify-between rounded-md bg-[#eef1f5] px-2.5 py-1.5 text-xs font-semibold text-[#1a2233]">
              <span>Área total</span>
              <span className="num">{totalAreaHa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha</span>
            </div>
          )}

          <div className="border-t border-[#e2e6ed] pt-2.5 text-[11px] leading-snug text-[#67718a]">
            <p>A indicação do sistema é uma forma básica e superficial. Para uma melhor precisão nos dados, consulte um de nossos consultores.</p>
            {whatsapp && (
              <a
                href={linkWhatsApp(whatsapp, 'Olá! Vim da calculadora de plantio do catálogo online e gostaria de falar com um consultor sobre o plantio.')}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block font-semibold text-[#0e9d74] underline"
              >
                Falar com um consultor
              </a>
            )}
          </div>
        </div>
      </div>
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
  // Presença = "marcado" (aparece destacado na lista + com linha própria na Calculadora de plantio);
  // valor = qtd real no pedido (0 = marcado mas fora do pedido — ver definirQtdCarrinho). Só
  // `alternarSelecao` (clique no card, na lista principal) desmarca de vez (apaga a chave).
  const [carrinho, setCarrinho] = useState<Map<string, number>>(new Map());
  // Área (ha) digitada em cada produto na Calculadora de plantio — mora aqui (não dentro de
  // LinhaCalculadoraPlantio) só pra dar pra somar o total de hectares tanto no rodapé da própria
  // calculadora quanto no Orçamento (ver totalAreaHa).
  const [areasPorItem, setAreasPorItem] = useState<Map<string, string>>(new Map());
  const [orcamentoAberto, setOrcamentoAberto] = useState(false);
  const [mensagemWhatsAppAberta, setMensagemWhatsAppAberta] = useState(false);
  const [calculadoraAberta, setCalculadoraAberta] = useState(false);
  const [pdfEscolhaAberta, setPdfEscolhaAberta] = useState(false);
  const [numeroPdfWhatsAppAberto, setNumeroPdfWhatsAppAberto] = useState(false);
  const [enviandoPdfWhatsApp, setEnviandoPdfWhatsApp] = useState(false);
  const [preparandoCompartilhamentoPdf, setPreparandoCompartilhamentoPdf] = useState(false);

  /** Clique no card, na lista principal — desmarca de vez (some do carrinho E da Calculadora) quando já marcado. */
  function alternarSelecao(itemId: string) {
    setCarrinho((prev) => {
      const proximo = new Map(prev);
      if (proximo.has(itemId)) proximo.delete(itemId);
      else proximo.set(itemId, 1);
      return proximo;
    });
    setAreasPorItem((prev) => {
      if (!prev.has(itemId)) return prev;
      const proximo = new Map(prev);
      proximo.delete(itemId);
      return proximo;
    });
  }

  /** Usado no Orçamento (stepper/remover) — qtd<=0 desmarca de vez, igual sempre foi (remover ali é uma decisão explícita: "não quero mais esse produto"). */
  function atualizarQtd(itemId: string, qtd: number) {
    setCarrinho((prev) => {
      const proximo = new Map(prev);
      if (qtd <= 0) proximo.delete(itemId);
      else proximo.set(itemId, qtd);
      return proximo;
    });
  }

  /** Só pra dentro da Calculadora de plantio — NUNCA desmarca (ao contrário de atualizarQtd): zerar aqui só tira da conta do pedido, o produto continua com linha própria na calculadora. */
  function definirQtdCarrinho(itemId: string, qtd: number) {
    setCarrinho((prev) => {
      if (!prev.has(itemId)) return prev;
      const proximo = new Map(prev);
      proximo.set(itemId, Math.max(0, qtd));
      return proximo;
    });
  }

  function alterarArea(itemId: string, area: string) {
    setAreasPorItem((prev) => new Map(prev).set(itemId, area));
  }

  /**
   * Tenta o compartilhamento nativo do navegador (Web Share API com arquivo) — a mesma tela que
   * abre pra compartilhar um comprovante de banco: já lista o WhatsApp entre os apps e deixa
   * escolher o CONTATO ali dentro, sem precisar digitar número nenhum aqui. Só existe em navegador
   * de celular (Android/iOS) com suporte a compartilhar arquivo; em navegador sem esse suporte
   * (a maioria dos computadores) devolve `false` pra cair no fallback de baixar+abrir wa.me. Cancelar
   * a tela nativa (usuário mudou de ideia) conta como "concluído", não como "sem suporte" — não faz
   * sentido emendar o fallback logo depois de um cancelamento proposital.
   */
  async function tentarCompartilharPdf(): Promise<boolean> {
    if (!data) return false;
    const nav = navigator as Navigator & { canShare?: (dados?: { files?: File[] }) => boolean; share?: (dados: { files?: File[]; title?: string }) => Promise<void> };
    if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    setPreparandoCompartilhamentoPdf(true);
    try {
      const blob = await gerarCatalogoPublicoPdfBlob(data.canalNome ?? '', itensParaPdfWhatsApp);
      const nomeArquivo = `Catálogo ${data.canalNome ?? 'Ceará Sementes'}.pdf`;
      const file = new File([blob], nomeArquivo, { type: 'application/pdf' });
      if (!nav.canShare({ files: [file] })) return false;
      await nav.share({ files: [file], title: nomeArquivo });
      return true;
    } catch (erro) {
      return erro instanceof Error && erro.name === 'AbortError';
    } finally {
      setPreparandoCompartilhamentoPdf(false);
    }
  }

  /** Clique em "Enviar por WhatsApp" — tenta o compartilhamento nativo primeiro (ver tentarCompartilharPdf); sem suporte, cai no fallback de pedir o número e abrir a conversa manualmente. */
  async function iniciarEnvioPdf() {
    const concluido = await tentarCompartilharPdf();
    if (!concluido) setNumeroPdfWhatsAppAberto(true);
  }

  /** Fallback sem Web Share (a maioria dos computadores): baixa o PDF (jsPDF de verdade, ver gerarCatalogoPublicoPdfBlob) e abre a conversa nesse número — wa.me abre o app no celular, o WhatsApp Web no computador; nenhum dos dois aceita anexo automático sem a API paga do WhatsApp Business, então o cliente anexa o arquivo recém-baixado manualmente. */
  async function enviarPdfWhatsApp(digitos: string) {
    if (!data) return;
    setEnviandoPdfWhatsApp(true);
    try {
      const blob = await gerarCatalogoPublicoPdfBlob(data.canalNome ?? '', itensParaPdfWhatsApp);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Catálogo ${data.canalNome ?? 'Ceará Sementes'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      const numeroCompleto = `55${digitos}`;
      const mensagem = `Olá! Segue o catálogo da Ceará Sementes em PDF${data.canalNome ? ` (${data.canalNome})` : ''} — acabei de baixar, é só um instante que já anexo aqui.`;
      window.open(linkWhatsApp(numeroCompleto, mensagem), '_blank');
      setNumeroPdfWhatsAppAberto(false);
    } finally {
      setEnviandoPdfWhatsApp(false);
    }
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
    // aparecer em algum lugar do nome+fornecedor+categoria+subcategoria+cultivar (qualquer ordem, sem
    // acentuação especial) — nem todo nome de produto carrega a Categoria/Classe/Cultivar dele.
    const palavras = busca.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (palavras.length === 0) return porCategoria;
    return porCategoria.filter((i) => {
      const descricao = `${i.nome} ${i.fornecedorNome ?? ''} ${i.categoriaNome} ${i.subcategoriaNome ?? ''} ${i.cultivar ?? ''}`.toLowerCase();
      return palavras.every((palavra) => descricao.includes(palavra));
    });
  }, [data, categoriaFiltro, busca]);

  // Mesmo formato usado no card da tela (ver LinhaProduto) — combina a permissão da Tabela (Canal) e
  // do Produto pra decidir se VC%/PMS/Validade entram no PDF enviado por WhatsApp (ver
  // gerarCatalogoPublicoPdfBlob), que também agrupa "colado" por produto e desenha o destaque em
  // negrito do nome — mesma regra visual do catálogo oficial.
  const itensParaPdfWhatsApp = useMemo(
    () =>
      itensFiltrados.map((item) => ({
        nome: item.nome,
        categoriaNome: item.categoriaNome,
        fornecedorNome: item.fornecedorNome,
        preco: item.preco,
        peso: item.peso,
        cultivar: item.cultivar,
        plantioVc: item.plantioVc,
        plantioPmsManual: item.plantioPmsManual,
        plantioValidade: item.plantioValidade,
        mostrarDetalhes: (data?.mostrarDetalhesPlantio ?? false) && item.mostrarDetalhesCatalogo,
      })),
    [itensFiltrados, data?.mostrarDetalhesPlantio],
  );

  // Categoria -> blocos "colados" (mesmo produto/variantes, ver chaveComparacaoProduto — mesma
  // regra do PDF de catálogo e da grade interna: prioriza Cultivar cadastrado, sem Categoria/Classe
  // interferindo) -> itens. Produto diferente do anterior sempre inicia um bloco novo (espaço
  // padrão entre blocos); mesma família de produto continua no MESMO bloco (visualmente colado).
  const grupos = useMemo(() => {
    const porCategoria: { categoriaNome: string; blocos: { chave: string; itens: ItemCatalogo[] }[] }[] = [];
    itensFiltrados.forEach((item) => {
      let grupoAtual = porCategoria[porCategoria.length - 1];
      if (!grupoAtual || grupoAtual.categoriaNome !== item.categoriaNome) {
        grupoAtual = { categoriaNome: item.categoriaNome, blocos: [] };
        porCategoria.push(grupoAtual);
      }
      const chave = chaveComparacaoProduto(item);
      const blocoAtual = grupoAtual.blocos[grupoAtual.blocos.length - 1];
      if (blocoAtual && blocoAtual.chave === chave) blocoAtual.itens.push(item);
      else grupoAtual.blocos.push({ chave, itens: [item] });
    });
    return porCategoria;
  }, [itensFiltrados]);

  // TODOS os produtos marcados (qualquer qtd, inclusive 0) — alimenta a Calculadora de plantio, que
  // precisa continuar mostrando a linha de um produto mesmo depois de zerado ali dentro (ver
  // definirQtdCarrinho). Pra tudo que é "carrinho de verdade" (orçamento, botão flutuante, mensagem de
  // WhatsApp), usa `itensNoCarrinho` (qtd>0) logo abaixo.
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

  const itensNoCarrinho = useMemo(() => itensCarrinho.filter((i) => i.qtd > 0), [itensCarrinho]);

  // Soma da Área (ha) digitada em cada produto que está de fato no pedido (qtd>0) — mesmo total
  // mostrado no rodapé da Calculadora de plantio E no Orçamento (ver ModalOrcamento/ModalCalculadoraPlantio).
  const totalAreaHa = useMemo(
    () => itensNoCarrinho.reduce((soma, item) => soma + (paraNumero(areasPorItem.get(item.id) ?? '') ?? 0), 0),
    [itensNoCarrinho, areasPorItem],
  );

  // Botão flutuante da calculadora só aparece com pelo menos 1 produto marcado (mesma seleção do
  // carrinho) que tenha dado de plantio — "!= null" (frouxo) de propósito: cache local (localStorage)
  // salvo antes desses campos existirem não tem essa chave (undefined), não `null`; "!== null" deixava
  // passar esse caso e piscava o botão no carregamento (cache velho "tem dado"), sumindo assim que o
  // fetch de verdade chegava.
  const temItemComPlantioNoCarrinho = itensCarrinho.some((i) => i.plantioKgHaLanco != null || i.plantioSementesCovaBase != null);

  const semNadaAindaCarregando = isLoading && !data;

  return (
    <div className="min-h-screen bg-[#f5f7fa] pb-20">
      {/* 1 linha só (nome da empresa colado no nome da Tabela, sem quebra) — topbar baixo de
          propósito, pra não tomar espaço de tela; ícones do tamanho dessa linha inteira
          (topo-a-piso), não pequenos flutuando soltos. */}
      <header className="flex items-center gap-2 border-b border-[#e2e6ed] bg-[#10233f] px-4 py-2 text-white">
        <h1 className="min-w-0 max-w-[65%] truncate leading-tight">
          <span className="text-sm font-medium text-white/70">Ceará Sementes </span>
          <span className="text-lg font-bold">{data?.canalNome ?? (semNadaAindaCarregando ? 'Carregando…' : 'Catálogo')}</span>
        </h1>
        <div className="flex shrink-0 items-center gap-1.5">
          {isFetching && <Loader2 size={18} className="animate-spin text-white/70" aria-label="Atualizando…" />}
          {data && (
            <button
              type="button"
              onClick={() => setPdfEscolhaAberta(true)}
              disabled={preparandoCompartilhamentoPdf}
              title="Salvar ou enviar tabela em PDF"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 disabled:opacity-60"
            >
              {preparandoCompartilhamentoPdf ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
            </button>
          )}
        </div>
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
                      <LinhaProduto
                        item={item}
                        selecionado={carrinho.has(item.id)}
                        mostrarDetalhes={(data?.mostrarDetalhesPlantio ?? false) && item.mostrarDetalhesCatalogo}
                        onClick={() => alternarSelecao(item.id)}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* Ícones que "flutuam" de verdade (acompanham o scroll) — PDF fica no topbar (ver <header>
          acima) e rola junto com a página. Carrinho só aparece com item marcado; a calculadora
          flutuante (embaixo do carrinho) usa a MESMA seleção do carrinho — aparece com 1+ produto
          marcado que tenha dado de plantio, e mostra todos eles de uma vez (ver ModalCalculadoraPlantio). */}
      {itensNoCarrinho.length > 0 && (
        <button
          type="button"
          onClick={() => setOrcamentoAberto(true)}
          title="Ver orçamento"
          className="fixed right-5 top-5 z-[190] flex h-12 w-12 items-center justify-center rounded-full bg-[#10233f] text-white shadow-lg hover:brightness-110"
        >
          <Truck size={20} />
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[#f5f7fa] bg-[#0e9d74] px-0.5 text-[10px] font-bold leading-none">
            {itensNoCarrinho.length}
          </span>
        </button>
      )}

      {temItemComPlantioNoCarrinho && (
        <button
          type="button"
          onClick={() => setCalculadoraAberta(true)}
          title="Calculadora de plantio"
          className="fixed right-5 top-20 z-[190] flex h-12 w-12 items-center justify-center rounded-full bg-[#10233f] text-white shadow-lg hover:brightness-110"
        >
          <Calculator size={20} />
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
          mensagemInicial={montarMensagemComCarrinho('Olá! Vim do catálogo online.', itensNoCarrinho)}
          onEnviar={(mensagem) => {
            window.open(linkWhatsApp(data.whatsapp!, mensagem), '_blank');
            setMensagemWhatsAppAberta(false);
          }}
          onFechar={() => setMensagemWhatsAppAberta(false)}
        />
      )}

      {calculadoraAberta && data && (
        <ModalCalculadoraPlantio
          itens={itensCarrinho}
          areasPorItem={areasPorItem}
          totalAreaHa={totalAreaHa}
          whatsapp={data.whatsapp}
          onAlterarArea={alterarArea}
          onDefinirQtd={definirQtdCarrinho}
          onAbrirCarrinho={() => setOrcamentoAberto(true)}
          onFechar={() => setCalculadoraAberta(false)}
        />
      )}

      {pdfEscolhaAberta && data && (
        <ModalConcluir
          titulo="Como você quer o catálogo?"
          onWhatsApp={() => {
            setPdfEscolhaAberta(false);
            void iniciarEnvioPdf();
          }}
          onPdf={() => {
            gerarCatalogoPublicoPdf(data.canalNome ?? '', itensFiltrados);
            setPdfEscolhaAberta(false);
          }}
          onFechar={() => setPdfEscolhaAberta(false)}
        />
      )}

      {numeroPdfWhatsAppAberto && (
        <ModalNumeroWhatsApp enviando={enviandoPdfWhatsApp} onEnviar={enviarPdfWhatsApp} onFechar={() => setNumeroPdfWhatsAppAberto(false)} />
      )}

      {orcamentoAberto && data && (
        <ModalOrcamento
          canalNome={data.canalNome ?? ''}
          itens={itensNoCarrinho}
          freteKgEfetivo={data.freteKgEfetivo}
          fretePctEfetivo={data.fretePctEfetivo}
          freteMinimo={data.freteMinimo}
          temTransportadora={data.temTransportadora}
          totalAreaHa={totalAreaHa}
          whatsapp={data.whatsapp}
          onAtualizarQtd={atualizarQtd}
          onAbrirCalculadora={() => setCalculadoraAberta(true)}
          onFechar={() => setOrcamentoAberto(false)}
        />
      )}
    </div>
  );
}
