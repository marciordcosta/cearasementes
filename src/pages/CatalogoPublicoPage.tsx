import { Calculator, FileText, Loader2, Search, Truck, X } from 'lucide-react';
// (arquivo tocado de propósito pra forçar um deploy novo no Vercel — os 2 últimos pushes não
// apareceram em produção; ver commit "Força novo deploy" logo antes deste.)
import { useEffect, useMemo, useState } from 'react';
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
import { calcularParcelasBoleto, chaveComparacaoProduto } from '@/features/pricing/calculations';
import { fetchCatalogoPublicoPorSlug, type CatalogoPublico } from '@/features/pricing/api';
import { gerarCatalogoPublicoPdf, gerarCatalogoPublicoPdfBlob } from '@/features/pricing/catalogoPublicoPdf';
import { gerarOrcamentoPdfBlob, type ItemOrcamentoPdf } from '@/features/pricing/orcamentoPdf';

type ItemCatalogo = CatalogoPublico['itens'][number];
/** modoEscolhido = modo (Lanço/Covas) salvo no carrinho via "Atualizar carrinho" na Calculadora — null = nunca escolhido, usa o padrão cadastrado (ver modoInicialDoItem/modoEfetivoDoItem). */
type ItemCarrinho = ItemCatalogo & { qtd: number; modoEscolhido: ModoPlantio | null };

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
 * `freteDescricao` já vem pronto de descreverFrete() — cobre os 3 estados (cotação/retirada/
 * valor calculado), então aqui só monta o texto, sem saber de onde veio. Cada item em 2
 * linhas — nome+fornecedor+peso, depois qtd × unitário = subtotal — com uma linha em branco
 * separando um item do outro.
 */
function montarMensagemOrcamento(canalNome: string, itens: ItemCarrinho[], freteDescricao: string, total: number, pagamentoDescricao?: string | null): string {
  const blocos = itens.map((i) => {
    const nomeLimpo = i.nome.replace(/[*_]/g, '');
    const linhaNome = [nomeLimpo, i.fornecedorNome, `${Math.round(i.peso)}kg`].filter(Boolean).join(' ');
    const linhaValores = `${i.qtd} x R$ ${fmtR(i.preco)} = R$ ${fmtR(i.preco * i.qtd)}`;
    return `${linhaNome}\n${linhaValores}`;
  });
  const linhas = [`Orçamento — ${canalNome}`, '', blocos.join('\n\n'), '', `Frete: ${freteDescricao}`];
  if (pagamentoDescricao) linhas.push(`Pagamento: ${pagamentoDescricao}`);
  linhas.push(`Total: R$ ${fmtR(total)}`);
  return linhas.join('\n');
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

/** Nunca deixa chegar a 0 — remover o produto é só pelo "×" (ação explícita), não por engano descendo o "−" (ver ModalOrcamento). */
/** Digitação livre — permite apagar o campo pra digitar um novo valor (sem o "1" grudado atrapalhando); só clampa no mínimo 1 ao sair do campo (vazio ou <1 volta pra "1"). Os botões −/+ continuam instantâneos, sem passar por aqui. */
function QuantidadeInput({ valor, onAlterar }: { valor: number; onAlterar: (v: number) => void }) {
  const [texto, setTexto] = useState(String(valor));

  useEffect(() => {
    setTexto(String(valor));
  }, [valor]);

  function commit() {
    const n = parseInt(texto, 10);
    const clamp = !texto.trim() || isNaN(n) || n < 1 ? 1 : n;
    setTexto(String(clamp));
    if (clamp !== valor) onAlterar(clamp);
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={valor <= 1}
        onClick={() => onAlterar(Math.max(1, valor - 1))}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-[#e2e6ed] text-[#67718a] hover:bg-[#f5f7fa] disabled:cursor-not-allowed disabled:opacity-40"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
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

type PagamentoEscolhido = { tipo: 'avista'; descontoPct: number } | { tipo: 'boleto'; parcelas: number; valorParcela: number; intervaloDias: number };

/** Mesmo ciclo do botão "Frete" no Orçamento (ver alternarFrete) — alterna nao_calculado ↔ calculado a cada clique. */
type EstadoFrete = 'nao_calculado' | 'calculado';

/** "30/60/90 dias" pra N parcelas num intervalo fixo (30 = padrão, 15 = "Fracionar boletos") — 1ª parcela já vence no 1º intervalo, não em D+0. */
function prazoBoletoLabel(parcelas: number, intervaloDias: number): string {
  return `${Array.from({ length: parcelas }, (_, i) => (i + 1) * intervaloDias).join('/')} dias`;
}

/**
 * "Formas de pagamento" — abre ao clicar "Concluir". Com pagamentoHabilitado, mostra Pix (desconto)
 * e Boleto (parcelado) juntos, sempre os dois — escolher uma opção já avança. Sem pagamento
 * habilitado, o modal ainda abre (só quando o frete ainda não foi calculado no carrinho, ver
 * precisaCalcularFreteAntes em ModalOrcamento) mostrando só "Calcular frete"; depois de calculado,
 * "Continuar" avança sem escolher forma de pagamento nenhuma. Cancelar sempre volta pro Orçamento
 * sem progredir. O aviso de frete (fora do cartão branco) aparece nos dois casos.
 */
function ModalPagamento({
  valorProdutos,
  totalComFrete,
  estadoFrete,
  temTransportadora,
  whatsapp,
  onCalcularFrete,
  onCotarFrete,
  pagamentoHabilitado,
  avistaDescontoPct,
  boletoValorMinimo,
  boletoParcelasMax,
  onEscolher,
  onContinuar,
  onFechar,
}: {
  valorProdutos: number;
  /** Produtos + frete (quando já calculado) — mostrado como referência abaixo do Boleto, já que as parcelas dividem só os produtos. */
  totalComFrete: number;
  /** Mesmo estado do botão "Frete" no Orçamento — alterna entre "Calcular frete" e "Valor sem o frete"/totais, só ligado a temTransportadora. */
  estadoFrete: EstadoFrete;
  /** false = canal Manual (sem Transportadora) — usa "Cotação de frete" (WhatsApp) em vez de "Calcular frete". */
  temTransportadora: boolean;
  whatsapp: string | null;
  onCalcularFrete: () => void;
  onCotarFrete: () => void;
  pagamentoHabilitado: boolean;
  avistaDescontoPct: number;
  boletoValorMinimo: number;
  boletoParcelasMax: number;
  onEscolher: (escolha: PagamentoEscolhido) => void;
  /** Sem pagamento habilitado — "Continuar" avança pro resumo sem escolher forma de pagamento nenhuma. */
  onContinuar: () => void;
  onFechar: () => void;
}) {
  // Abre a lista de parcelas ao clicar em "Boleto" — escolher uma delas é que confirma (ver botão de cada parcela abaixo).
  const [boletoExpandido, setBoletoExpandido] = useState(false);
  // "Fracionar boletos" troca de 30 pra 15 dias e dobra a qtd de parcelas exibida (3 parcelas de 30 em 30 vira 6 de 15 em 15).
  const [intervaloDias, setIntervaloDias] = useState(30);
  // Desconto Pix só sobre os produtos, mas o valor mostrado aqui já soma o frete (o que o cliente pagaria de fato agora).
  const frete = totalComFrete - valorProdutos;
  const totalPixComDesconto = valorProdutos * (1 - avistaDescontoPct / 100) + frete;
  // parcelasMax já é o teto real pra esse total (total ÷ valor mínimo, travado na Qtd máxima cadastrada) — o cliente escolhe qualquer valor de 1 até esse teto (ou o dobro disso, fracionado).
  const { parcelas: parcelasMax } = calcularParcelasBoleto(valorProdutos, boletoValorMinimo, boletoParcelasMax);
  const parcelasExibidas = intervaloDias === 30 ? parcelasMax : parcelasMax * 2;
  const freteResolvido = temTransportadora ? estadoFrete === 'calculado' : true;
  return (
    <div
      className="fixed inset-0 z-[220] flex flex-col items-center justify-center gap-2.5 bg-black/45 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onFechar()}
    >
      <div className="w-full max-w-xs rounded-xl bg-white p-4 shadow-2xl">
        {pagamentoHabilitado && <p className="mb-3 text-center text-sm font-semibold text-[#1a2233]">Formas de pagamento</p>}
        <div className="flex flex-col gap-2">
          {pagamentoHabilitado && (
            <>
              <button
                type="button"
                onClick={() => onEscolher({ tipo: 'avista', descontoPct: avistaDescontoPct })}
                className="rounded-md border border-[#e2e6ed] px-3 py-2.5 text-left text-sm hover:bg-[#f5f7fa]"
              >
                <p className="font-semibold text-[#1a2233]">Pix</p>
                <p className="text-xs">
                  {avistaDescontoPct > 0 && <span className="mr-1.5 text-[#9aa3b2] line-through">R$ {fmtR(totalComFrete)}</span>}
                  <span className="num font-semibold text-[#0e9d74]">R$ {fmtR(totalPixComDesconto)}</span>
                </p>
              </button>
              {!boletoExpandido && (
                <button
                  type="button"
                  onClick={() => (parcelasMax > 1 ? setBoletoExpandido(true) : onEscolher({ tipo: 'boleto', parcelas: 1, valorParcela: valorProdutos, intervaloDias: 30 }))}
                  className="rounded-md border border-[#e2e6ed] px-3 py-2.5 text-left text-sm hover:bg-[#f5f7fa]"
                >
                  <p className="font-semibold text-[#1a2233]">Boleto</p>
                  <p className="text-xs text-[#67718a]">
                    <span className="num font-semibold text-[#1a2233]">R$ {fmtR(valorProdutos)}</span>
                    {parcelasMax > 1 ? (
                      <>
                        {' '}
                        em até {parcelasMax}x de R$ {fmtR(valorProdutos / parcelasMax)}
                      </>
                    ) : (
                      <span className="ml-1 text-[10px] font-normal text-[#9aa3b2]">({prazoBoletoLabel(1, 30)})</span>
                    )}
                  </p>
                </button>
              )}
              {boletoExpandido && parcelasMax > 1 && (
                <div className="rounded-md border border-[#e2e6ed] p-2.5">
                  <p className="mb-1.5 text-xs font-semibold text-[#1a2233]">Boleto — escolha as parcelas</p>
                  <div className="flex flex-col gap-1.5">
                    {Array.from({ length: parcelasExibidas }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => onEscolher({ tipo: 'boleto', parcelas: n, valorParcela: valorProdutos / n, intervaloDias })}
                        className="flex items-center justify-between rounded-md border border-[#e2e6ed] px-2.5 py-2 text-sm hover:bg-[#f5f7fa]"
                      >
                        <span className="text-[#1a2233]">
                          {n}x <span className="text-[10px] font-normal text-[#9aa3b2]">({prazoBoletoLabel(n, intervaloDias)})</span>
                        </span>
                        <span className="num font-semibold text-[#1a2233]">R$ {fmtR(valorProdutos / n)}</span>
                      </button>
                    ))}
                  </div>
                  {intervaloDias === 30 && (
                    <button
                      type="button"
                      onClick={() => setIntervaloDias(15)}
                      className="mt-1.5 block w-full text-center text-[11px] text-[#0e9d74] underline"
                    >
                      Fracionar boletos
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          {/* Frete — sempre visível: com pagamento habilitado é referência pro Pix/Boleto; sem pagamento, é o único motivo do modal existir. */}
          <div className="px-1">
            {temTransportadora ? (
              estadoFrete === 'calculado' ? (
                pagamentoHabilitado ? (
                  <button type="button" onClick={onCalcularFrete} className="num text-left text-[11px] text-[#67718a] underline">
                    Valor sem o frete: R$ {fmtR(valorProdutos)}
                    {avistaDescontoPct > 0 && (
                      <span className="text-[#0e9d74]"> (R$ {fmtR(valorProdutos * (1 - avistaDescontoPct / 100))} no Pix)</span>
                    )}
                  </button>
                ) : (
                  <div className="space-y-1 text-xs text-[#67718a]">
                    <div className="flex justify-between">
                      <span>Frete</span>
                      <span className="num">R$ {fmtR(frete)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total dos produtos</span>
                      <span className="num">R$ {fmtR(valorProdutos)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold text-[#1a2233]">
                      <span>Total do pedido</span>
                      <span className="num">R$ {fmtR(totalComFrete)}</span>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-1">
                  <button type="button" onClick={onCalcularFrete} className="text-left text-[11px] font-semibold text-[#0e9d74] underline">
                    Calcular frete
                  </button>
                  {/* Frete nunca é obrigatório — sem pagamento habilitado, o "Continuar" abaixo só aparece
                      depois de calcular (ver freteResolvido); esse aqui deixa seguir direto pra retirada,
                      sem precisar calcular nada. Com pagamento habilitado, Pix/Boleto já servem pra isso
                      (nenhum dos dois exige frete calculado), então não repete o botão. */}
                  {!pagamentoHabilitado && (
                    <button type="button" onClick={onContinuar} className="text-left text-[11px] font-semibold text-[#67718a] underline">
                      Retirar no local
                    </button>
                  )}
                </div>
              )
            ) : whatsapp ? (
              <button type="button" onClick={onCotarFrete} className="text-left text-[11px] font-semibold text-[#0e9d74] underline">
                Cotação de frete
              </button>
            ) : (
              <p className="text-[11px] text-[#67718a]">Frete a combinar</p>
            )}
            {!(temTransportadora && estadoFrete === 'calculado') && (
              <p className="mt-0.5 text-[10px] text-[#9aa3b2]">Sem o frete informado, o produto deve ser retirado na loja.</p>
            )}
          </div>
          {!pagamentoHabilitado && freteResolvido && (
            <button
              type="button"
              onClick={onContinuar}
              className="mt-1 w-full rounded-md bg-[#10233f] py-2.5 text-sm font-semibold text-white hover:brightness-110"
            >
              Continuar
            </button>
          )}
          <button type="button" onClick={onFechar} className="mt-1 text-xs text-[#67718a] hover:underline">
            Cancelar
          </button>
        </div>
      </div>
      <p className="max-w-xs text-center text-[10px] leading-snug text-white/75">
        Cálculo de frete válido pro Estado do CE. Não enviamos pra zona rural ou distritos — pra mais informações,{' '}
        {whatsapp ? (
          <a
            href={linkWhatsApp(whatsapp, 'Olá! Gostaria de saber mais sobre entrega/frete pro meu endereço.')}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            converse com um consultor
          </a>
        ) : (
          'converse com um consultor'
        )}
        .
      </p>
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
          <p className="text-sm font-bold text-[#1a2233]">Resumo do pedido</p>
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
          Enviar pedido no WhatsApp
        </button>
      </div>
    </div>
  );
}

/**
 * Aberto depois de "Enviar pedido" no resumo/composição (ver iniciarEnvioPedido em ModalOrcamento),
 * MAS ainda antes de abrir o WhatsApp de fato — fica no meio do caminho, pergunta se quer salvar o
 * PDF do pedido também. Qualquer escolha (Salvar ou Não) segue pro passo final (ver finalizarEnvio),
 * que mostra "Enviando pedido…" e só depois abre o WhatsApp. Sem compartilhamento nativo aqui de
 * propósito — pedir número como fallback não é prático, e essa etapa roda antes do cliente sair pro
 * WhatsApp mesmo, evitando o problema de perder o convite quando ele volta do app.
 */
function ModalOfertaPdf({ onSalvar, onFechar }: { onSalvar: () => void; onFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/45 p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="w-full max-w-xs rounded-xl bg-white p-4 shadow-2xl">
        <p className="mb-3 text-center text-sm font-semibold text-[#1a2233]">Quer salvar o PDF do pedido também?</p>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={onSalvar} className="rounded-md bg-[#10233f] py-2.5 text-sm font-semibold text-white hover:brightness-110">
            Salvar
          </button>
          <button type="button" onClick={onFechar} className="mt-1 text-xs text-[#67718a] hover:underline">
            Não, obrigado
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Enviando pedido…" — cobre o passo final antes de abrir o WhatsApp (ver finalizarEnvio em ModalOrcamento), pra não trocar de app de repente, sem aviso nenhum. Sem botão nenhum de propósito — é só uma pausa curta, não precisa (nem dá tempo) de cancelar. */
function ModalEnviandoPedido() {
  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/45 p-4">
      <div className="flex items-center gap-2.5 rounded-xl bg-white px-5 py-4 shadow-2xl">
        <Loader2 size={18} className="animate-spin text-[#0e9d74]" />
        <span className="text-sm font-semibold text-[#1a2233]">Enviando pedido…</span>
      </div>
    </div>
  );
}

function ModalOrcamento({
  canalNome,
  itens,
  freteKgEfetivo,
  fretePctEfetivo,
  freteFixo,
  freteMinimo,
  temTransportadora,
  totalAreaHa,
  whatsapp,
  pagamentoHabilitado,
  pagamentoAvistaDescontoPct,
  pagamentoBoletoValorMinimo,
  pagamentoBoletoParcelasMax,
  onAtualizarQtd,
  onAbrirCalculadora,
  onDefinirModo,
  onLimparCarrinho,
  onFechar,
}: {
  canalNome: string;
  itens: ItemCarrinho[];
  freteKgEfetivo: number;
  fretePctEfetivo: number;
  freteFixo: number;
  freteMinimo: number;
  /** false = canal Manual (sem Transportadora) — Frete Kg/% digitado à mão não é uma referência real de frete, então não calcula: mostra "Cotação de frete" (WhatsApp) em vez de um valor. */
  temTransportadora: boolean;
  /** Soma da Área (ha) digitada em cada produto na Calculadora de plantio (ver areasPorItem em CatalogoPublicoPage) — 0 quando ninguém usou a calculadora ainda. */
  totalAreaHa: number;
  whatsapp: string | null;
  /** Config de pagamento da Tabela (ver Canal.pagamentoHabilitado em pricing/types.ts) — quando ligado, "Concluir" abre o ModalPagamento (Pix + Boleto) antes de mandar a mensagem no WhatsApp; quando desligado, o mesmo modal ainda abre só pra calcular o frete, se ele ainda não tiver sido calculado no carrinho. */
  pagamentoHabilitado: boolean;
  pagamentoAvistaDescontoPct: number;
  pagamentoBoletoValorMinimo: number;
  pagamentoBoletoParcelasMax: number;
  onAtualizarQtd: (itemId: string, qtd: number) => void;
  /** "Área total" nos totais é o link pra Calculadora de plantio — fecha o Orçamento e abre a Calculadora (ver render em CatalogoPublicoPage). */
  onAbrirCalculadora: () => void;
  /** Alterna o modo de plantio direto na tag do carrinho (só quando o item tem os dois modos, ver temAmbosModos) — mesmo mecanismo de persistência da Calculadora (ver definirModoCarrinho), reflete em rotuloModoPlantio/areaReversaDoItem/totalAreaHa. */
  onDefinirModo: (itemId: string, modo: ModoPlantio) => void;
  /** Zera carrinho/áreas editadas/modo escolhido (ver limparCarrinho em CatalogoPublicoPage) — chamado ao sair da tela de PDF (ver finalizarPedido), que fecha o ciclo do pedido. */
  onLimparCarrinho: () => void;
  onFechar: () => void;
}) {
  const [pagamentoAberto, setPagamentoAberto] = useState(false);
  const [pagamentoEscolhido, setPagamentoEscolhido] = useState<PagamentoEscolhido | null>(null);
  const [observacaoWhatsAppAberta, setObservacaoWhatsAppAberta] = useState(false);
  // Depois do resumo/composição (ModalObservacaoWhatsApp), antes de abrir o WhatsApp de fato —
  // pergunta se quer salvar o PDF também (ver iniciarEnvioPedido/finalizarEnvio).
  const [ofertaPdfAberta, setOfertaPdfAberta] = useState(false);
  // Mensagem final já composta (resumo + observação) — guardada aqui pra sobreviver o passo do
  // ModalOfertaPdf no meio do caminho, sendo enviada só depois que o cliente decidir sobre o PDF.
  const [mensagemPendente, setMensagemPendente] = useState<string | null>(null);
  // "Enviando pedido…" — cobre o tempo de gerar o PDF (se escolhido) + uma pausa mínima visível,
  // pra não abrir o WhatsApp "do nada" (ver finalizarEnvio/ModalEnviandoPedido).
  const [enviandoPedido, setEnviandoPedido] = useState(false);
  // Sempre nasce "não calculado" — some quando o Orçamento fecha (desmonta) e volta a pedir clique
  // na próxima vez que abrir, mesmo pro mesmo carrinho. Só faz sentido quando temTransportadora (a
  // "Cotação de frete" do canal Manual é um fluxo à parte, ver pedirCotacaoFrete).
  const [estadoFrete, setEstadoFrete] = useState<EstadoFrete>('nao_calculado');

  // Sem pagamento habilitado, o modal ainda abre — só que aí é só pra calcular o frete (ver
  // iniciarConclusao) — mas só faz sentido nisso quando dá pra calcular de verdade (temTransportadora)
  // e ainda não foi calculado; sem Transportadora, ou já calculado, não tem o que perguntar ali.
  const precisaCalcularFreteAntes = temTransportadora && estadoFrete !== 'calculado';

  const valorProdutos = itens.reduce((s, i) => s + i.preco * i.qtd, 0);
  const pesoTotalUsado = itens.reduce((s, i) => s + i.pesoUsado * i.qtd, 0);
  const freteBruto = freteFixo + pesoTotalUsado * freteKgEfetivo + (valorProdutos * fretePctEfetivo) / 100;
  const freteCalculado = itens.length === 0 ? 0 : Math.max(freteBruto, freteMinimo);
  const freteIncluidoNoTotal = temTransportadora && estadoFrete === 'calculado';
  // Desconto à vista entra só em cima dos produtos, nunca no frete.
  const valorProdutosComPagamento = pagamentoEscolhido?.tipo === 'avista' ? valorProdutos * (1 - pagamentoEscolhido.descontoPct / 100) : valorProdutos;
  const total = valorProdutos + (freteIncluidoNoTotal ? freteCalculado : 0);
  const totalComPagamento = valorProdutosComPagamento + (freteIncluidoNoTotal ? freteCalculado : 0);

  function alternarFrete() {
    // Alterna nao_calculado <-> calculado a cada clique.
    setEstadoFrete((atual) => (atual === 'calculado' ? 'nao_calculado' : 'calculado'));
  }

  function descreverFrete(): string {
    if (!temTransportadora) return 'a combinar (cotação à parte)';
    if (estadoFrete === 'calculado') return `R$ ${fmtR(freteCalculado)}`;
    return 'Retirada';
  }

  /**
   * "Concluir" — passa pelo ModalPagamento quando a Tabela tem pagamento habilitado (Pix/Boleto) OU
   * quando o frete ainda não foi calculado no carrinho (mesmo sem pagamento, esse modal ainda serve
   * pra calcular o frete antes de seguir); sem nenhum dos dois, vai direto pro resumo/composição do
   * WhatsApp (ver ModalObservacaoWhatsApp).
   */
  function iniciarConclusao() {
    if (pagamentoHabilitado || precisaCalcularFreteAntes) setPagamentoAberto(true);
    else setObservacaoWhatsAppAberta(true);
  }

  function confirmarPagamento(escolha: PagamentoEscolhido) {
    setPagamentoEscolhido(escolha);
    setPagamentoAberto(false);
    setObservacaoWhatsAppAberta(true);
  }

  /** "Continuar" no ModalPagamento sem pagamento habilitado (só a parte de calcular frete) — não escolhe forma de pagamento nenhuma, só avança pro resumo. */
  function continuarSemPagamento() {
    setPagamentoAberto(false);
    setObservacaoWhatsAppAberta(true);
  }

  function descricaoPagamento(): string | undefined {
    if (!pagamentoEscolhido) return undefined;
    if (pagamentoEscolhido.tipo === 'avista') {
      return pagamentoEscolhido.descontoPct > 0 ? `Pix (${pagamentoEscolhido.descontoPct}% de desconto nos produtos)` : 'Pix';
    }
    return `Boleto — ${pagamentoEscolhido.parcelas}x de R$ ${fmtR(pagamentoEscolhido.valorParcela)} (${prazoBoletoLabel(pagamentoEscolhido.parcelas, pagamentoEscolhido.intervaloDias)})`;
  }

  function itensParaPdf(): ItemOrcamentoPdf[] {
    return itens.map((i) => ({ nome: i.nome, qtd: i.qtd, precoUnitario: i.preco, subtotal: i.preco * i.qtd }));
  }

  /** "Enviar pedido" no resumo/composição — NÃO abre o WhatsApp ainda: guarda a mensagem composta e pergunta sobre o PDF primeiro (ver ModalOfertaPdf), no meio do caminho, antes de sair pro app do WhatsApp. */
  function iniciarEnvioPedido(mensagemFinal: string) {
    setMensagemPendente(mensagemFinal);
    setObservacaoWhatsAppAberta(false);
    setOfertaPdfAberta(true);
  }

  /**
   * Passo final — chamado pelas duas opções do ModalOfertaPdf (Salvar ou Não). Mostra "Enviando
   * pedido…" (ver ModalEnviandoPedido) cobrindo o tempo de gerar o PDF (quando `comPdf`) mais uma
   * pausa mínima visível, pra não abrir o WhatsApp "do nada" feito algo quebrado; só depois abre o
   * WhatsApp de fato com a mensagem guardada (ver iniciarEnvioPedido) e zera o carrinho.
   */
  async function finalizarEnvio(comPdf: boolean) {
    setOfertaPdfAberta(false);
    setEnviandoPedido(true);
    if (comPdf) await salvarPedidoPdf();
    await new Promise((resolve) => setTimeout(resolve, 900));
    if (whatsapp && mensagemPendente) window.open(linkWhatsApp(whatsapp, mensagemPendente), '_blank');
    setEnviandoPedido(false);
    onLimparCarrinho();
    onFechar();
  }

  function pedirCotacaoFrete() {
    if (!whatsapp) return;
    window.open(linkWhatsApp(whatsapp, montarMensagemCotacaoFrete(canalNome, itens)), '_blank');
  }

  /** Baixa o PDF do pedido (jsPDF de verdade) — parte do passo final (ver finalizarEnvio), que já espera essa geração terminar antes de abrir o WhatsApp. */
  async function salvarPedidoPdf() {
    const blob = await gerarOrcamentoPdfBlob(canalNome, itensParaPdf(), descreverFrete(), totalComPagamento, descricaoPagamento());
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Pedido ${canalNome}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  return (
    <div className="fixed inset-0 z-[210] flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[#e2e6ed] px-4 py-3.5">
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-[#1a2233]">Orçamento — {canalNome}</p>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                onFechar();
                onAbrirCalculadora();
              }}
              title="Calculadora de plantio"
              className="rounded-md p-1 text-[#67718a] hover:bg-[#f5f7fa]"
            >
              <Calculator size={18} />
            </button>
            <button type="button" onClick={onFechar} className="rounded-md p-1 text-[#67718a] hover:bg-[#f5f7fa]">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {itens.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#67718a]">Nenhum produto selecionado ainda — toque num card do catálogo pra adicionar aqui.</p>
          ) : (
            <div className="flex flex-col divide-y divide-[#e2e6ed]">
              {itens.map((item) => {
                const modoLabel = rotuloModoPlantio(item);
                return (
                  <div key={item.id} className="flex flex-col gap-1.5 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug text-[#1a2233]">
                          <NomeComDestaque nome={item.nome} />
                        </p>
                        {(item.fornecedorNome || modoLabel) && (
                          <div className="mt-0.5 flex items-center gap-1.5">
                            {item.fornecedorNome && <p className="truncate text-[10px] font-medium uppercase tracking-wide text-[#67718a]">{item.fornecedorNome}</p>}
                            {modoLabel &&
                              (temAmbosModos(item) ? (
                                <button
                                  type="button"
                                  onClick={() => onDefinirModo(item.id, modoEfetivoDoItem(item) === 'lanco' ? 'covas' : 'lanco')}
                                  title="Alternar entre A Lanço e Covas"
                                  className="shrink-0 rounded-full bg-[#c7ccd6] px-2 py-0.5 text-[10px] font-semibold text-white underline hover:bg-[#aab1c0]"
                                >
                                  {modoLabel}
                                </button>
                              ) : (
                                <span className="shrink-0 rounded-full bg-[#c7ccd6] px-2 py-0.5 text-[10px] font-semibold text-white">{modoLabel}</span>
                              ))}
                          </div>
                        )}
                      </div>
                      <button type="button" onClick={() => onAtualizarQtd(item.id, 0)} className="shrink-0 text-[11px] text-[#67718a] underline hover:text-[#c24444]">
                        remover
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
                );
              })}
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
                <button type="button" onClick={alternarFrete} className={`text-xs ${estadoFrete === 'calculado' ? 'num text-[#67718a] underline' : 'font-semibold text-[#0e9d74] underline'}`}>
                  {estadoFrete === 'calculado' ? `R$ ${fmtR(freteCalculado)}` : 'Calcular frete'}
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
            onClick={iniciarConclusao}
            className="w-full rounded-md bg-[#10233f] py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Concluir
          </button>
        </div>
      </div>

      {pagamentoAberto && (
        <ModalPagamento
          valorProdutos={valorProdutos}
          totalComFrete={total}
          estadoFrete={estadoFrete}
          temTransportadora={temTransportadora}
          whatsapp={whatsapp}
          onCalcularFrete={alternarFrete}
          onCotarFrete={pedirCotacaoFrete}
          pagamentoHabilitado={pagamentoHabilitado}
          avistaDescontoPct={pagamentoAvistaDescontoPct}
          boletoValorMinimo={pagamentoBoletoValorMinimo}
          boletoParcelasMax={pagamentoBoletoParcelasMax}
          onEscolher={confirmarPagamento}
          onContinuar={continuarSemPagamento}
          onFechar={() => setPagamentoAberto(false)}
        />
      )}
      {observacaoWhatsAppAberta && (
        <ModalObservacaoWhatsApp
          resumo={montarMensagemOrcamento(canalNome, itens, descreverFrete(), totalComPagamento, descricaoPagamento())}
          onEnviar={iniciarEnvioPedido}
          onFechar={() => setObservacaoWhatsAppAberta(false)}
        />
      )}
      {ofertaPdfAberta && (
        <ModalOfertaPdf onSalvar={() => void finalizarEnvio(true)} onFechar={() => void finalizarEnvio(false)} />
      )}
      {enviandoPedido && <ModalEnviandoPedido />}
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
 * Modo inicial de um item na Calculadora — usa o Modo de Plantio cadastrado em Parametrização pra
 * esse Cultivar+Processo (ver plantioModoPadrao/resolverModoPlantioPadrao) quando existir; sem
 * cadastro (ou "Linha", que essa calculadora pública não oferece — só Lanço/Covas, simplificação de
 * propósito, ver resolverPlantioParaProduto em calculoSemeadura.ts), cai no critério antigo: Lanço se
 * o item tiver dado de Lanço, senão Covas.
 */
function modoInicialDoItem(item: Pick<ItemCatalogo, 'plantioModoPadrao' | 'plantioKgHaLanco'>): ModoPlantio {
  if (item.plantioModoPadrao === 'lanco') return 'lanco';
  if (item.plantioModoPadrao === 'cova') return 'covas';
  return item.plantioKgHaLanco != null ? 'lanco' : 'covas';
}

/** Modo que vale AGORA pro item: o que o cliente escolheu e salvou no carrinho (item.modoEscolhido), ou o padrão cadastrado (modoInicialDoItem) quando ele nunca trocou. */
function modoEfetivoDoItem(item: ItemCarrinho): ModoPlantio {
  return item.modoEscolhido ?? modoInicialDoItem(item);
}

/** Taxa de semeadura (kg/ha) de um item num modo/corredor — núcleo repetido tanto na linha da Calculadora quanto no total de hectares calculável direto do carrinho (ver areaReversaDoItem), sem precisar abrir a Calculadora. */
function kgPorHaDoItem(item: Pick<ItemCatalogo, 'plantioKgHaLanco' | 'plantioSementesCovaBase' | 'plantioPms'>, modo: ModoPlantio, corredor: string): number | null {
  return modo === 'lanco'
    ? (item.plantioKgHaLanco ?? null)
    : item.plantioSementesCovaBase != null && item.plantioPms != null
      ? kgHaCovas(item.plantioSementesCovaBase, item.plantioPms, corredor)
      : null;
}

/**
 * Área (ha) que, no modo PADRÃO do item (ver modoInicialDoItem) e Corredor 50cm, corresponde à qtd
 * real já no carrinho — inverso de totalKg = Math.ceil(kgPorHa) × área (aproximado — arredondarSacos
 * usa margem de tolerância, não é o inverso exato de área->qtd). Calculável direto do carrinho, sem
 * abrir a Calculadora nenhuma vez — usado tanto pro valor INICIAL de cada linha (ver
 * LinhaCalculadoraPlantio) quanto pro total de hectares (ver totalAreaHa em CatalogoPublicoPage), que
 * assim fica sempre certo mesmo pra quem nunca abriu a Calculadora.
 */
function areaReversaDoItem(item: ItemCarrinho): number | null {
  const kgPorHa = kgPorHaDoItem(item, modoEfetivoDoItem(item), '50');
  if (kgPorHa === null || kgPorHa <= 0 || item.peso <= 0) return null;
  return Math.round(((item.qtd * item.peso) / Math.ceil(kgPorHa)) * 100) / 100;
}

/** Rótulo curto do modo de plantio EFETIVO do item (escolhido e salvo, ou padrão cadastrado) — tag discreta no carrinho (ver ModalOrcamento). null sem dado de plantio nenhum (produto sem laudo casando). */
function rotuloModoPlantio(item: ItemCarrinho): string | null {
  if (item.plantioKgHaLanco == null && item.plantioSementesCovaBase == null) return null;
  return modoEfetivoDoItem(item) === 'lanco' ? 'A Lanço' : 'Covas';
}

/** true = item tem dado dos DOIS modos (Lanço e Covas) — mesma condição de temOsDoisModos em LinhaCalculadoraPlantio; só nesse caso a tag do carrinho vira um link de alternância (ver ModalOrcamento). */
function temAmbosModos(item: ItemCarrinho): boolean {
  return item.plantioKgHaLanco != null && item.plantioSementesCovaBase != null && item.plantioPms != null;
}

/**
 * 1 produto marcado, dentro da calculadora — cálculo e estado (modo/corredor) 100% independentes dos
 * outros produtos marcados (ver ModalCalculadoraPlantio, que só empilha uma dessas por item do
 * carrinho). Sem trava nenhuma — Área/modo/Distância sempre editáveis (acesso à Calculadora já é só
 * pelo carrinho, não precisa mais desse cuidado). Área é a ÚNICA parte do estado que mora no
 * componente pai (`areasPorItem` em CatalogoPublicoPage) — undefined até o cliente digitar algo aqui;
 * enquanto isso, mostra a Área REVERSA (ver areaReversaDoItem) correspondente à qtd real do carrinho,
 * no modo atual (pode já não ser o padrão, se o cliente só trocou de aba sem digitar nada). Reporta o
 * Nº de embalagens calculado AO VIVO pro pai (ver onQtdCalculada) — só informativo, nunca escreve no
 * carrinho sozinho; isso só acontece no botão único "Atualizar carrinho" (ver ModalCalculadoraPlantio).
 * Mesma conta do Guia de Plantio interno (kg/ha), condição sempre "Média" (sem seletor aqui) e só 2
 * modos (A Lanço/Covas — nunca Milho/Sorgo com Sementes/cova editável nem modo Linha, ver
 * resolverPlantioParaProduto em calculoSemeadura.ts). Campos compactados (rótulos/paddings menores)
 * pra caber vários produtos empilhados sem rolagem excessiva.
 */
function LinhaCalculadoraPlantio({
  item,
  area,
  onAlterarArea,
  onQtdCalculada,
  onAreaCalculada,
  onModoCalculado,
}: {
  item: ItemCarrinho;
  /** undefined = cliente ainda não digitou nada aqui — mostra a Área reversa da qtd real (ver areaReversaDoItem) em vez de um valor guardado. */
  area: string | undefined;
  onAlterarArea: (valor: string) => void;
  /** Reporta o Nº de embalagens calculado AO VIVO (a partir da Área/modo atuais) pro pai — só pra habilitar o botão "Atualizar carrinho" quando difere da qtd real; nunca escreve no carrinho sozinho. */
  onQtdCalculada: (itemId: string, qtd: number | null) => void;
  /** Reporta a Área (ha) exibida AGORA (digitada ou reversa da qtd real) pro pai — soma o "Área total" da própria Calculadora, que assim acompanha o que está sendo digitado, diferente do "Área total" do Orçamento (esse sim só a qtd real, ver totalAreaHa em CatalogoPublicoPage). */
  onAreaCalculada: (itemId: string, area: number | null) => void;
  /** Reporta o modo (Lanço/Covas) selecionado AGORA pro pai — só pra habilitar "Atualizar carrinho" quando difere do modo efetivo já salvo (ver modoEfetivoDoItem) e, ao confirmar, salvar esse modo no carrinho. */
  onModoCalculado: (itemId: string, modo: ModoPlantio) => void;
}) {
  // Modo efetivo ATUAL do item (o que já está salvo no carrinho, ou o padrão cadastrado) — ponto de partida
  // da linha e referência pra saber se o cliente trocou de aba de verdade (ver `tocado` abaixo).
  const modoEfetivoAtual = modoEfetivoDoItem(item);
  const [modo, setModo] = useState<ModoPlantio>(modoEfetivoAtual);
  const [corredor, setCorredor] = useState('50');

  const temPlantio = item.plantioKgHaLanco != null || item.plantioSementesCovaBase != null;
  const temOsDoisModos = item.plantioKgHaLanco != null && item.plantioSementesCovaBase != null && item.plantioPms != null;

  const kgPorHa = kgPorHaDoItem(item, modo, corredor);

  // Sem edição própria ainda (`area` undefined), mostra a Área reversa da qtd real no modo ATUAL (não
  // necessariamente o padrão — o cliente pode trocar de aba só pra comparar, sem digitar nada) — assim
  // que digitar algo no campo, essa reversa nunca mais aparece, vira só o que o cliente escreveu.
  const areaReversaNoModoAtual = kgPorHa !== null && kgPorHa > 0 && item.peso > 0 ? String(Math.round(((item.qtd * item.peso) / Math.ceil(kgPorHa)) * 100) / 100) : null;
  const areaExibida = area ?? areaReversaNoModoAtual ?? '1';

  const areaNum = paraNumero(areaExibida);
  const totalKg = kgPorHa !== null && areaNum !== null && areaNum > 0 ? Math.ceil(kgPorHa) * areaNum : null;

  /** +/- só no modo A Lanço (ver botões abaixo) — passo de 0,5 ha, nunca abaixo de 0,5. Arredonda pro múltiplo de 0,5 mais próximo antes de somar, pra não acumular erro de ponto flutuante depois de vários cliques. */
  function ajustarArea(delta: number) {
    const atual = Math.round((areaNum ?? 0) * 2) / 2;
    onAlterarArea(String(Math.max(0.5, atual + delta)));
  }

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

  // "Tocado" = cliente já mexeu em algo aqui (Área, ou trocou modo/Corredor do que já está EFETIVAMENTE
  // salvo — não o padrão cru, senão reabrir a Calculadora com um modo já salvo diferente do padrão
  // acenderia o botão à toa) — enquanto não tocar em nada, reporta a própria qtd real (não o cálculo ao
  // vivo) pro pai: a Área reversa é só APROXIMADA (arredondarSacos usa margem de tolerância, não é o
  // inverso exato), então recalculando ela pra frente de novo o resultado podia sair um pouco diferente
  // da qtd real só por causa desse arredondamento — sem isso, o botão "Atualizar carrinho" (ver
  // ModalCalculadoraPlantio) apareceria "habilitado" (parecendo ter algo pendente) sem o cliente ter feito nada.
  const tocado = area !== undefined || modo !== modoEfetivoAtual || corredor !== '50';
  useEffect(() => {
    onQtdCalculada(item.id, tocado ? qtdEmbalagensCalculada : item.qtd);
  }, [item.id, item.qtd, tocado, qtdEmbalagensCalculada, onQtdCalculada]);

  // Reporta o modo selecionado AGORA (sempre, tocado ou não) — o pai compara com o efetivo já salvo pra
  // decidir se há algo pendente, e usa esse valor de verdade se "Atualizar carrinho" for clicado.
  useEffect(() => {
    onModoCalculado(item.id, modo);
  }, [item.id, modo, onModoCalculado]);

  // Área total DA CALCULADORA (ver totalAreaHaCalculadora em ModalCalculadoraPlantio) acompanha o que
  // está sendo digitado AGORA em cada linha — diferente da Área total do Orçamento, que só reflete a
  // qtd real do carrinho (ver totalAreaHa em CatalogoPublicoPage). null sem dado de plantio (produto
  // sem laudo casando não mostra campo de Área nenhum, não pode entrar na soma).
  useEffect(() => {
    onAreaCalculada(item.id, temPlantio ? areaNum : null);
  }, [item.id, temPlantio, areaNum, onAreaCalculada]);

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
                onClick={() => setModo(m)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${modo === m ? 'bg-[#10233f] text-white' : 'bg-white text-[#67718a]'}`}
              >
                {m === 'lanco' ? 'Lanço' : 'Covas'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={`grid gap-1.5 ${!temDadosCovas ? 'grid-cols-1' : modo === 'lanco' ? 'grid-cols-[1.3fr_1fr_1fr]' : 'grid-cols-3'}`}>
        <label className="block text-[10px] text-[#67718a]">
          Informa a área (ha)
          {modo === 'lanco' ? (
            // Só no modo A Lanço — no Covas não sobra espaço na lateral do campo (Dist. linhas/covas
            // ocupam ali do lado), fica só o campo manual mesmo.
            <div className="mt-0.5 flex items-center gap-1">
              <button
                type="button"
                onClick={() => ajustarArea(-0.5)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#e2e6ed] text-[#67718a] hover:bg-[#f5f7fa]"
              >
                −
              </button>
              <input
                type="number"
                inputMode="decimal"
                value={areaExibida}
                onChange={(e) => onAlterarArea(e.target.value)}
                className="num w-full min-w-0 flex-1 rounded-md border border-[#e2e6ed] bg-white px-1.5 py-1 text-center text-sm text-[#1a2233]"
              />
              <button
                type="button"
                onClick={() => ajustarArea(0.5)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#e2e6ed] text-[#67718a] hover:bg-[#f5f7fa]"
              >
                +
              </button>
            </div>
          ) : (
            <input
              type="number"
              inputMode="decimal"
              value={areaExibida}
              onChange={(e) => onAlterarArea(e.target.value)}
              className="num mt-0.5 w-full rounded-md border border-[#e2e6ed] bg-white px-2 py-1 text-sm text-[#1a2233]"
            />
          )}
        </label>
        {temDadosCovas && (
          <>
            <label className={`block text-[10px] text-[#67718a] ${modo !== 'covas' ? 'invisible' : ''}`}>
              Dist. linhas (cm)
              <input
                type="number"
                inputMode="decimal"
                value={corredor}
                onChange={(e) => setCorredor(e.target.value)}
                className="num mt-0.5 w-full rounded-md border border-[#e2e6ed] bg-white px-2 py-1 text-sm text-[#1a2233]"
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
        {totalKg !== null && (
          <div className="flex justify-between">
            <span className="text-[#67718a]">Quantidade necessária (kg)</span>
            <span className="num font-bold text-[#0e9d74]">{Math.ceil(totalKg)} kg</span>
          </div>
        )}
        {qtdEmbalagensCalculada !== null && (
          <div className="flex justify-between">
            <span className="text-[#67718a]">Qtd total em sacos</span>
            <span className="num font-semibold text-[#1a2233]">
              {qtdEmbalagensCalculada} ({Math.round(item.peso)}kg cada)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Calculadora de plantio do Catálogo Online — trabalha SEMPRE em cima da mesma seleção do carrinho
 * (marcar um produto na lista principal marca pro carrinho E pra calculadora, exatamente como um item
 * de carrinho): cada produto marcado ganha sua própria linha com cálculo 100% independente dos outros
 * (ver LinhaCalculadoraPlantio) — sem busca própria aqui dentro, pra adicionar mais um produto à conta
 * é só marcar mais um na tela principal. Sem trava nenhuma — cada linha calcula ao vivo, mas nada entra
 * no carrinho sozinho: existe UM botão só, "Atualizar carrinho", que manda de uma vez a qtd calculada
 * de CADA linha que estiver diferente da qtd real (ver qtdCalculadaPorItem/temAtualizacaoPendente) —
 * apagado (desabilitado) até ter alguma coisa pendente; ao clicar, já FECHA a Calculadora e volta pro
 * Orçamento em seguida (ver atualizarCarrinho), pra mostrar o carrinho já atualizado. Só desmarcar na
 * tela principal tira um produto daqui de vez (e do carrinho). Produto marcado sem laudo
 * correspondente aparece com aviso, sem campos. Só se abre a partir do Orçamento (ícone no título/link
 * "Área total", ver ModalOrcamento) — fechar aqui (X, fundo ou "Atualizar carrinho") sempre VOLTA pro
 * Orçamento, nunca só fecha solto (ver onFechar no render em CatalogoPublicoPage).
 */
function ModalCalculadoraPlantio({
  itens,
  areasPorItem,
  whatsapp,
  onAlterarArea,
  onDefinirQtd,
  onDefinirModo,
  onLimparAreasEditadas,
  onFechar,
}: {
  itens: ItemCarrinho[];
  areasPorItem: Map<string, string>;
  whatsapp: string | null;
  onAlterarArea: (itemId: string, valor: string) => void;
  onDefinirQtd: (itemId: string, qtd: number) => void;
  /** Salva no carrinho o modo (Lanço/Covas) escolhido na Calculadora — ver modoEfetivoDoItem/rotuloModoPlantio, que passam a refletir essa escolha. */
  onDefinirModo: (itemId: string, modo: ModoPlantio) => void;
  /** Chamado depois de "Atualizar carrinho" — limpa o rascunho de Área digitado, senão reabrir a Calculadora reportaria "tocado" de novo à toa (ver limparAreasEditadas em CatalogoPublicoPage). */
  onLimparAreasEditadas: (itemIds: string[]) => void;
  onFechar: () => void;
}) {
  // Nº de embalagens calculado AO VIVO por item (ver onQtdCalculada em LinhaCalculadoraPlantio) — só
  // pra decidir se "Atualizar carrinho" fica habilitado (algum item calculado difere da qtd real) e,
  // ao clicar, pra saber o que mandar pro carrinho de cada um.
  const [qtdCalculadaPorItem, setQtdCalculadaPorItem] = useState<Map<string, number | null>>(new Map());
  // Área (ha) exibida AGORA em cada linha (ver onAreaCalculada em LinhaCalculadoraPlantio) — só pro
  // "Área total" DESTA tela, que acompanha o que está sendo digitado ao vivo (diferente do "Área
  // total" do Orçamento, esse sim só a qtd real já no carrinho, ver totalAreaHa em CatalogoPublicoPage).
  const [areaCalculadaPorItem, setAreaCalculadaPorItem] = useState<Map<string, number | null>>(new Map());
  // Modo (Lanço/Covas) selecionado AGORA em cada linha (ver onModoCalculado em LinhaCalculadoraPlantio) —
  // junto com qtdCalculadaPorItem, decide se "Atualizar carrinho" fica habilitado e o que salvar.
  const [modoCalculadoPorItem, setModoCalculadoPorItem] = useState<Map<string, ModoPlantio>>(new Map());

  function registrarQtdCalculada(itemId: string, qtd: number | null) {
    setQtdCalculadaPorItem((prev) => (prev.get(itemId) === qtd ? prev : new Map(prev).set(itemId, qtd)));
  }

  function registrarAreaCalculada(itemId: string, area: number | null) {
    setAreaCalculadaPorItem((prev) => (prev.get(itemId) === area ? prev : new Map(prev).set(itemId, area)));
  }

  function registrarModoCalculado(itemId: string, modo: ModoPlantio) {
    setModoCalculadoPorItem((prev) => (prev.get(itemId) === modo ? prev : new Map(prev).set(itemId, modo)));
  }

  const totalAreaHaCalculadora = itens.reduce((soma, item) => soma + (areaCalculadaPorItem.get(item.id) ?? 0), 0);

  const temAtualizacaoPendente = itens.some((item) => {
    const calc = qtdCalculadaPorItem.get(item.id);
    const modoCalc = modoCalculadoPorItem.get(item.id);
    return (calc != null && calc !== item.qtd) || (modoCalc != null && modoCalc !== modoEfetivoDoItem(item));
  });

  function atualizarCarrinho() {
    itens.forEach((item) => {
      const calc = qtdCalculadaPorItem.get(item.id);
      if (calc != null && calc !== item.qtd) onDefinirQtd(item.id, calc);
      const modoCalc = modoCalculadoPorItem.get(item.id);
      if (modoCalc != null && modoCalc !== modoEfetivoDoItem(item)) onDefinirModo(item.id, modoCalc);
    });
    onLimparAreasEditadas(itens.map((item) => item.id));
    onFechar();
  }

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
                onQtdCalculada={registrarQtdCalculada}
                onAreaCalculada={registrarAreaCalculada}
                onModoCalculado={registrarModoCalculado}
              />
            ))
          )}

          {itens.length > 1 && totalAreaHaCalculadora > 0 && (
            <div className="flex justify-between rounded-md bg-[#eef1f5] px-2.5 py-1.5 text-xs font-semibold text-[#1a2233]">
              <span>Área total</span>
              <span className="num">{totalAreaHaCalculadora.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha</span>
            </div>
          )}

          {itens.length > 0 && (
            <button
              type="button"
              disabled={!temAtualizacaoPendente}
              onClick={atualizarCarrinho}
              className="w-full rounded-md bg-[#10233f] py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Atualizar carrinho
            </button>
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

  // Aba do navegador mostra "Catálogo Ceará Sementes" aqui (não o título genérico "ERP Ceará
  // Sementes" do resto do app) — volta ao normal ao sair da página.
  useEffect(() => {
    const tituloAnterior = document.title;
    document.title = 'Catálogo Ceará Sementes';
    return () => {
      document.title = tituloAnterior;
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
  // LinhaCalculadoraPlantio) só pra sobreviver ao produto trocar de linha/a Calculadora fechar e abrir
  // de novo; é só rascunho de edição, nunca aplicado até "Atualizar carrinho" (ver
  // limparAreasEditadas) — não alimenta o total de hectares de lugar nenhum (ver totalAreaHa,
  // calculado direto da qtd real do carrinho, e totalAreaHaCalculadora, ao vivo dentro da própria
  // Calculadora).
  const [areasPorItem, setAreasPorItem] = useState<Map<string, string>>(new Map());
  // Modo (Lanço/Covas) salvo por item via "Atualizar carrinho" na Calculadora — ausente = nunca
  // escolhido, usa o padrão cadastrado (ver modoInicialDoItem/modoEfetivoDoItem). Ao contrário de
  // areasPorItem (rascunho, some ao aplicar), esse fica valendo até o item ser desmarcado de vez.
  const [modoPorItem, setModoPorItem] = useState<Map<string, ModoPlantio>>(new Map());
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
    setModoPorItem((prev) => {
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

  /** Salva no carrinho o modo (Lanço/Covas) escolhido na Calculadora (ver ModalCalculadoraPlantio/atualizarCarrinho) — passa a valer pra rotuloModoPlantio/areaReversaDoItem/modoEfetivoDoItem até o item ser desmarcado de vez. */
  function definirModoCarrinho(itemId: string, modo: ModoPlantio) {
    setModoPorItem((prev) => new Map(prev).set(itemId, modo));
  }

  /** Chamado depois de "Atualizar carrinho" (ver ModalCalculadoraPlantio) — apaga o rascunho de Área digitado, senão reabrir a Calculadora reportaria essa Área de novo como "tocada" (ver `tocado` em LinhaCalculadoraPlantio) mesmo já tudo aplicado, deixando o botão parecendo ter algo pendente à toa. */
  function limparAreasEditadas(itemIds: string[]) {
    setAreasPorItem((prev) => {
      const proximo = new Map(prev);
      itemIds.forEach((id) => proximo.delete(id));
      return proximo;
    });
  }

  /** Zera o carrinho inteiro (produtos, áreas digitadas e modo escolhido) — chamado ao sair da tela de PDF do pedido (ver finalizarPedido em ModalOrcamento), que fecha o ciclo do pedido enviado. */
  function limparCarrinho() {
    setCarrinho(new Map());
    setAreasPorItem(new Map());
    setModoPorItem(new Map());
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
        return item ? { ...item, qtd, modoEscolhido: modoPorItem.get(id) ?? null } : null;
      })
      .filter((x): x is ItemCarrinho => x !== null);
  }, [carrinho, data, modoPorItem]);

  const itensNoCarrinho = useMemo(() => itensCarrinho.filter((i) => i.qtd > 0), [itensCarrinho]);

  // Soma da Área (ha) reversa (ver areaReversaDoItem) de cada produto que está de fato no pedido
  // (qtd>0) — calculada DIRETO da qtd real do carrinho, nunca de nada guardado em `areasPorItem`
  // (aquilo é só rascunho de edição dentro da Calculadora, nunca aplicado até "Atualizar carrinho"):
  // assim o total já aparece certo mesmo pra quem nunca abriu a Calculadora nenhuma vez. Mesmo total
  // mostrado no rodapé da Calculadora de plantio E no Orçamento (ver ModalOrcamento/ModalCalculadoraPlantio).
  const totalAreaHa = useMemo(() => itensNoCarrinho.reduce((soma, item) => soma + (areaReversaDoItem(item) ?? 0), 0), [itensNoCarrinho]);

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

      {/* Ícone que "flutua" de verdade (acompanha o scroll) — PDF fica no topbar (ver <header> acima)
          e rola junto com a página. Carrinho só aparece com item marcado; a Calculadora de plantio não
          tem ícone próprio na tela — acesso só de dentro do Orçamento (ícone no título + link "Área
          total", ver ModalOrcamento), pra não duplicar entrada. */}
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
          whatsapp={data.whatsapp}
          onAlterarArea={alterarArea}
          onDefinirQtd={definirQtdCarrinho}
          onDefinirModo={definirModoCarrinho}
          onLimparAreasEditadas={limparAreasEditadas}
          onFechar={() => {
            setCalculadoraAberta(false);
            setOrcamentoAberto(true);
          }}
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
          freteFixo={data.freteFixo}
          freteMinimo={data.freteMinimo}
          temTransportadora={data.temTransportadora}
          totalAreaHa={totalAreaHa}
          whatsapp={data.whatsapp}
          pagamentoHabilitado={data.pagamentoHabilitado}
          pagamentoAvistaDescontoPct={data.pagamentoAvistaDescontoPct}
          pagamentoBoletoValorMinimo={data.pagamentoBoletoValorMinimo}
          pagamentoBoletoParcelasMax={data.pagamentoBoletoParcelasMax}
          onAtualizarQtd={atualizarQtd}
          onAbrirCalculadora={() => setCalculadoraAberta(true)}
          onDefinirModo={definirModoCarrinho}
          onLimparCarrinho={limparCarrinho}
          onFechar={() => setOrcamentoAberto(false)}
        />
      )}
    </div>
  );
}
