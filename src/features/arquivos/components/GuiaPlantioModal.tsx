import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Transportadora } from '@/features/fretes/types';
import { calcularCanal } from '@/features/pricing/calculations';
import type { Canal, Categoria, Produto } from '@/features/pricing/types';
import { fmtBRL } from '@/lib/format';
import { calcularCovasPorM2, calcularKgPorHectareNumero, calcularSementesPorCova, calcularSementesPorM2 } from '../calculoSemeadura';
import { gerarGuiaPlantioPdf } from '../guiaPlantioPdf';
import { paraNumero } from '../metricas';
import type { ArquivoLaudo, FatorPlantio, ProdutoParametrizacao } from '../types';

interface GuiaPlantioModalProps {
  open: boolean;
  arquivos: ArquivoLaudo[];
  produtos: ProdutoParametrizacao[];
  fatores: FatorPlantio[];
  canaisPreco: Canal[];
  categoriasPreco: Categoria[];
  produtosPreco: Produto[];
  transportadoras: Transportadora[];
  onFechar: () => void;
}

type Modo = 'linha_cova' | 'lanco';
type Condicao = 'ideal' | 'media' | 'baixa';

interface ItemGuia {
  laudoId: string;
  area: string;
  /** Modo de plantio — individual por item (produtos diferentes na mesma pilha podem ter modos diferentes). */
  modo: Modo;
  /** Só usados quando modo === 'linha_cova' — espaçamento entre covas na linha e do corredor entre linhas, em cm. */
  cova: string;
  corredor: string;
}

const OPCOES_MODO: { valor: Modo; rotulo: string }[] = [
  { valor: 'lanco', rotulo: 'A Lanço' },
  { valor: 'linha_cova', rotulo: 'Covas' },
];

const OPCOES_CONDICAO: { valor: Condicao; rotulo: string }[] = [
  { valor: 'baixa', rotulo: 'Baixa' },
  { valor: 'media', rotulo: 'Média' },
  { valor: 'ideal', rotulo: 'Ideal' },
];

function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

function fatorDe(fatores: FatorPlantio[], chave: string): number {
  return paraNumero(fatores.find((f) => f.chave === chave)?.fator ?? null) ?? 1;
}

function formatarCovas(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

/** Validade no formato "MM/AAAA" (texto livre, digitado pelo operador) — convertida num número comparável (ano×12+mês). Sem validade cadastrada vai pro fim da lista. */
function validadeParaOrdenacao(validade: string | null): number {
  const partes = (validade ?? '').split('/');
  if (partes.length !== 2) return -Infinity;
  const mes = Number(partes[0]);
  const ano = Number(partes[1]);
  if (!Number.isFinite(mes) || !Number.isFinite(ano)) return -Infinity;
  return ano * 12 + mes;
}

/** Casa o produto do laudo com um produto da Tabela de Preço pelo nome (mesmo padrão de normalização usado em parametrizacaoProdutos.ts). */
function encontrarProdutoPreco(nomeProduto: string, produtosPreco: Produto[]): Produto | null {
  const alvo = normalizarBusca(nomeProduto);
  return produtosPreco.find((p) => normalizarBusca(p.nome) === alvo) ?? null;
}

/**
 * Guia de Plantio — busca um produto por vez (o sistema procura o nome nos
 * laudos e lista os lotes que batem, com a validade) e empilha um resultado
 * pra cada um, cada um com sua própria área — dá pra montar o plano de
 * plantio de vários produtos diferentes na mesma sessão, um "x" no canto
 * tira um resultado da pilha sem mexer nos outros.
 *
 * Peso do saco e Valor vêm os dois da Tabela de Preço (módulo Precificação),
 * casando o produto do laudo pelo nome com um produto cadastrado lá — não
 * tem campo de peso na Parametrização de Produtos (seria duplicado, a
 * Tabela de Preço já tem). O peso (Sacos necessários) não depende de
 * escolher uma Tabela; o Valor (preço com margem/imposto/frete do canal)
 * precisa de uma Tabela escolhida. Sem produto encontrado com esse nome na
 * Tabela, os dois ficam pendentes.
 */
export function GuiaPlantioModal({ open, arquivos, produtos, fatores, canaisPreco, categoriasPreco, produtosPreco, transportadoras, onFechar }: GuiaPlantioModalProps) {
  const [condicao, setCondicao] = useState<Condicao>('media');
  const [canalId, setCanalId] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [itens, setItens] = useState<ItemGuia[]>([]);

  const fatorCondicao = fatorDe(fatores, condicao);
  const canalSelecionado = canaisPreco.find((c) => c.id === canalId) ?? null;
  const transportadoraPorId = useMemo(() => new Map(transportadoras.map((t) => [t.id, t])), [transportadoras]);

  /** Peso do pacote (kg) já cadastrado na Tabela de Preço — não depende de Tabela/canal escolhido, só de achar o produto pelo nome. */
  function pesoSacoDoProduto(nomeProduto: string): number | null {
    const produtoPreco = encontrarProdutoPreco(nomeProduto, produtosPreco);
    return produtoPreco && produtoPreco.peso > 0 ? produtoPreco.peso : null;
  }

  function precoSacoDoProduto(nomeProduto: string): number | null {
    if (!canalSelecionado) return null;
    const produtoPreco = encontrarProdutoPreco(nomeProduto, produtosPreco);
    if (!produtoPreco) return null;
    const categoria = categoriasPreco.find((c) => c.id === produtoPreco.categoriaId) ?? categoriasPreco[0];
    if (!categoria) return null;
    return calcularCanal(produtoPreco, canalSelecionado, categoria, transportadoraPorId).preco;
  }

  const opcoesFiltradas = useMemo(() => {
    const termo = normalizarBusca(busca);
    if (!termo) return [];
    return arquivos
      .filter((a) => normalizarBusca(a.nomeProduto).includes(termo))
      .sort((a, b) => validadeParaOrdenacao(b.validade) - validadeParaOrdenacao(a.validade))
      .slice(0, 8);
  }, [arquivos, busca]);

  function selecionar(a: ArquivoLaudo) {
    setItens((prev) => (prev.some((it) => it.laudoId === a.id) ? prev : [...prev, { laudoId: a.id, area: '', modo: 'lanco', cova: '50', corredor: '50' }]));
    setBusca('');
    setBuscaAberta(false);
  }

  function removerItem(laudoId: string) {
    setItens((prev) => prev.filter((it) => it.laudoId !== laudoId));
  }

  function atualizarItem(laudoId: string, patch: Partial<ItemGuia>) {
    setItens((prev) => prev.map((it) => (it.laudoId === laudoId ? { ...it, ...patch } : it)));
  }

  function fecharTudo() {
    setBusca('');
    setItens([]);
    onFechar();
  }

  function calcularResultado(laudo: ArquivoLaudo, item: ItemGuia) {
    const fatorModo = fatorDe(fatores, item.modo);
    const kgPorHa = calcularKgPorHectareNumero(laudo, produtos, fatorModo, fatorCondicao);
    const areaNum = paraNumero(item.area);
    const pesoTotal = kgPorHa !== null && areaNum !== null && areaNum > 0 ? kgPorHa * areaNum : null;
    const pesoSaco = pesoSacoDoProduto(laudo.nomeProduto);
    const sacos = pesoTotal !== null && pesoSaco !== null ? Math.ceil(pesoTotal / pesoSaco) : null;
    const precoSaco = precoSacoDoProduto(laudo.nomeProduto);
    const valorTotal = sacos !== null && precoSaco !== null ? sacos * precoSaco : null;
    const covasPorM2 = item.modo === 'linha_cova' ? calcularCovasPorM2(paraNumero(item.cova), paraNumero(item.corredor)) : null;
    // Sementes por cova/m² usam o peso TEÓRICO (taxa × área, sem arredondar pra saco
    // inteiro) — é uma instrução de plantio (quantas sementes por ponto), não uma
    // quantidade de compra; arredondar pra saco aqui infla o número artificialmente
    // (o excedente do saco não é "mais semente por cova", é sobra no depósito).
    const sementesPorCova = calcularSementesPorCova(laudo, produtos, pesoTotal, areaNum, covasPorM2, fatorModo, fatorCondicao);
    const sementesPorM2 = calcularSementesPorM2(laudo, produtos, pesoTotal, areaNum, fatorModo, fatorCondicao);
    return { kgPorHa, pesoTotal, pesoSaco, sacos, valorTotal, sementesPorCova, sementesPorM2, precoSaco, covasPorM2 };
  }

  function motivoSemSacos(pesoSaco: number | null): string {
    return pesoSaco === null ? 'Produto não encontrado na Tabela de Preço, ou sem peso cadastrado lá' : '';
  }

  function motivoSemValor(precoSaco: number | null, sacos: number | null): string {
    if (!canalId) return 'Escolha uma Tabela de Preço pra calcular o valor';
    if (precoSaco === null) return 'Produto não encontrado na Tabela de Preço (confira se o nome bate)';
    if (sacos === null) return 'Produto sem peso cadastrado na Tabela de Preço';
    return '';
  }

  // Soma dos cards empilhados — só entra na soma o que deu pra calcular (sacos/peso/valor nulos são ignorados, não zerados).
  const resumoGeral = itens.reduce(
    (acc, item) => {
      const laudo = arquivos.find((a) => a.id === item.laudoId);
      if (!laudo) return acc;
      const r = calcularResultado(laudo, item);
      return {
        totalSacos: acc.totalSacos + (r.sacos ?? 0),
        totalPeso: acc.totalPeso + (r.pesoTotal ?? 0),
        totalValor: acc.totalValor + (r.valorTotal ?? 0),
      };
    },
    { totalSacos: 0, totalPeso: 0, totalValor: 0 },
  );

  function imprimir() {
    const linhas = itens.flatMap((item) => {
      const laudo = arquivos.find((a) => a.id === item.laudoId);
      if (!laudo) return [];
      const r = calcularResultado(laudo, item);
      const modoLabel = OPCOES_MODO.find((o) => o.valor === item.modo)?.rotulo ?? '';
      return [
        {
          nomeProduto: laudo.nomeProduto,
          lote: laudo.lote,
          modoLabel,
          area: item.area || '—',
          taxaSemeadura: r.kgPorHa === null ? '—' : `${Math.ceil(r.kgPorHa)} kg/ha`,
          sacos: r.sacos === null ? '—' : `${r.sacos} sacos`,
          pesoTotal: r.pesoTotal === null ? '—' : `${Math.ceil(r.pesoTotal)} kg`,
          valorUnit: r.precoSaco === null ? '—' : fmtBRL.format(r.precoSaco),
          valorTotal: r.valorTotal === null ? '—' : fmtBRL.format(r.valorTotal),
          espacamento: item.modo === 'linha_cova' ? `${item.cova || '—'}×${item.corredor || '—'} cm` : null,
          covasPorM2: item.modo === 'linha_cova' ? (r.covasPorM2 === null ? '—' : formatarCovas(r.covasPorM2)) : null,
          sementesLabel: item.modo === 'linha_cova' ? 'Sementes por cova' : 'Sementes por m²',
          sementesValor:
            item.modo === 'linha_cova'
              ? r.sementesPorCova === null
                ? '—'
                : String(Math.round(r.sementesPorCova))
              : r.sementesPorM2 === null
                ? '—'
                : String(Math.round(r.sementesPorM2)),
        },
      ];
    });
    gerarGuiaPlantioPdf(linhas, {
      totalSacos: `${resumoGeral.totalSacos} sacos`,
      totalPeso: `${Math.ceil(resumoGeral.totalPeso)} kg`,
      totalValor: fmtBRL.format(resumoGeral.totalValor),
    });
  }

  const mostrandoSugestoes = buscaAberta && opcoesFiltradas.length > 0;
  const mostrandoSemResultado = buscaAberta && busca.trim().length > 0 && opcoesFiltradas.length === 0;
  // O painel de sugestões é `absolute` e não entra no fluxo normal — sem essa
  // reserva, o modal (que cresce só pelo conteúdo em fluxo) fica baixo demais
  // e o `overflow-y-auto` do próprio Modal corta o painel por cima.
  const alturaReservada = mostrandoSugestoes ? Math.min(opcoesFiltradas.length * 60, 280) + 8 : mostrandoSemResultado ? 44 : 0;

  return (
    <Modal
      open={open}
      title="Guia de Plantio"
      onClose={fecharTudo}
      widthClassName="max-w-[780px]"
      footer={
        itens.length > 0 ? (
          <div className="flex w-full items-center justify-between gap-3">
            <p className="text-xs text-[var(--color-text-soft)]">
              <span className="font-semibold text-[var(--color-text)]">{resumoGeral.totalSacos}</span> sacos ·{' '}
              <span className="font-semibold text-[var(--color-text)]">{Math.ceil(resumoGeral.totalPeso)} kg</span> ·{' '}
              <span className="font-semibold text-[var(--color-text)]">{fmtBRL.format(resumoGeral.totalValor)}</span>
            </p>
            <Button variant="outline" onClick={imprimir}>
              Imprimir
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[var(--color-text-soft)]">Condição do plantio:</span>
            {OPCOES_CONDICAO.map((o) => (
              <button
                key={o.valor}
                type="button"
                onClick={() => setCondicao(o.valor)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  condicao === o.valor ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-page)] text-[var(--color-text-soft)] hover:text-[var(--color-text)]'
                }`}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[var(--color-text-soft)]">Tabela:</span>
            <select
              value={canalId}
              onChange={(e) => setCanalId(e.target.value)}
              className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)]"
            >
              <option value="" className="text-[var(--color-text)]">
                — sem valor —
              </option>
              {canaisPreco.map((c) => (
                <option key={c.id} value={c.id} className="text-[var(--color-text)]">
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative">
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setBuscaAberta(true);
            }}
            onFocus={() => setBuscaAberta(true)}
            onBlur={() => setTimeout(() => setBuscaAberta(false), 120)}
            placeholder="Buscar produto..."
            autoComplete="off"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
          />
          {buscaAberta && opcoesFiltradas.length > 0 && (
            <div className="absolute z-30 mt-1 max-h-[280px] w-full overflow-y-auto rounded-md border border-[var(--color-line)] bg-[var(--color-surface)]/95 shadow-lg backdrop-blur-sm">
              {opcoesFiltradas.map((a) => {
                const precoSaco = precoSacoDoProduto(a.nomeProduto);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selecionar(a)}
                    className="flex w-full flex-col px-3 py-1.5 text-left text-sm text-[var(--color-text)] hover:bg-[var(--color-accent)]/15"
                  >
                    <span>{a.nomeProduto}</span>
                    <span className="text-xs text-[var(--color-text-soft)]">
                      Lote {a.lote ?? '—'} · Val. {a.validade ?? '—'}
                      {precoSaco !== null && ` · ${fmtBRL.format(precoSaco)}/saco`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {buscaAberta && busca.trim() && opcoesFiltradas.length === 0 && (
            <div className="absolute z-30 mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)]/95 px-3 py-2 text-xs text-[var(--color-text-soft)] shadow-lg">
              Nenhum lote encontrado com esse nome.
            </div>
          )}
        </div>
        {alturaReservada > 0 && <div style={{ height: alturaReservada }} aria-hidden />}

        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {itens.map((item) => {
            const laudo = arquivos.find((a) => a.id === item.laudoId);
            if (!laudo) return null;
            const r = calcularResultado(laudo, item);
            return (
              <div key={item.laudoId} className="relative space-y-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-page)] p-2.5">
                <button
                  type="button"
                  onClick={() => removerItem(item.laudoId)}
                  title="Remover esse resultado"
                  className="absolute right-2.5 top-2.5 text-bad hover:opacity-70"
                >
                  ✕
                </button>
                <div className="pr-6">
                  <p className="truncate text-sm font-semibold text-[var(--color-text)]">{laudo.nomeProduto}</p>
                  <p className="text-[10px] text-[var(--color-text-soft)]">Lote {laudo.lote ?? '—'}</p>
                </div>

                <div className="flex items-center gap-0.5">
                  {OPCOES_MODO.map((o) => (
                    <button
                      key={o.valor}
                      type="button"
                      onClick={() => atualizarItem(item.laudoId, { modo: o.valor })}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium transition ${
                        item.modo === o.valor ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-text-soft)] hover:text-[var(--color-text)]'
                      }`}
                    >
                      {o.rotulo}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <div>
                    <p className="text-[10px] text-[var(--color-text-soft)]">Área (ha)</p>
                    <input
                      value={item.area}
                      onChange={(e) => atualizarItem(item.laudoId, { area: e.target.value })}
                      inputMode="decimal"
                      className="w-16 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)]"
                    />
                  </div>
                  {item.modo === 'linha_cova' && (
                    <>
                      <div>
                        <p className="text-[10px] text-[var(--color-text-soft)]">Cova (cm)</p>
                        <input
                          value={item.cova}
                          onChange={(e) => atualizarItem(item.laudoId, { cova: e.target.value })}
                          inputMode="decimal"
                          className="w-14 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)]"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] text-[var(--color-text-soft)]">Corredor (cm)</p>
                        <input
                          value={item.corredor}
                          onChange={(e) => atualizarItem(item.laudoId, { corredor: e.target.value })}
                          inputMode="decimal"
                          className="w-14 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)]"
                        />
                      </div>
                    </>
                  )}
                </div>

                {r.kgPorHa === null && r.sementesPorM2 === null ? (
                  <p className="text-xs text-[var(--color-text-soft)]">
                    Faltam dados pra calcular esse lote — confira PMS, Densidade, Índice de Sobrevivência (ou teste de campo) na Parametrização de Produtos.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 border-t border-[var(--color-line)] pt-1.5 text-sm">
                    {r.kgPorHa === null && (
                      <p className="col-span-2 text-[10px] text-[var(--color-text-soft)]">
                        Sem PMS cadastrado — Taxa, Peso, Sacos e Valor ficam pendentes; sementes seguem calculadas por Densidade e Germinação.
                      </p>
                    )}
                    <div>
                      <p className="text-[10px] text-[var(--color-text-soft)]">Taxa de semeadura</p>
                      <p className="font-medium text-[var(--color-text)]">{r.kgPorHa === null ? '—' : `${Math.ceil(r.kgPorHa)} kg/ha`}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--color-text-soft)]">Sacos necessários</p>
                      <p className="font-medium text-[var(--color-text)]" title={r.sacos === null ? motivoSemSacos(r.pesoSaco) : undefined}>
                        {r.sacos === null ? '—' : `${r.sacos} sacos`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--color-text-soft)]">Peso total</p>
                      <p className="font-medium text-[var(--color-text)]">{r.pesoTotal === null ? '—' : `${Math.ceil(r.pesoTotal)} kg`}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--color-text-soft)]">Valor unit. (saco)</p>
                      <p className="font-medium text-[var(--color-text)]" title={r.precoSaco === null ? motivoSemValor(r.precoSaco, r.sacos) : undefined}>
                        {r.precoSaco === null ? '—' : fmtBRL.format(r.precoSaco)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--color-text-soft)]">Valor total</p>
                      <p className="font-medium text-[var(--color-text)]" title={r.valorTotal === null ? motivoSemValor(r.precoSaco, r.sacos) : undefined}>
                        {r.valorTotal === null ? '—' : fmtBRL.format(r.valorTotal)}
                      </p>
                    </div>
                    {item.modo === 'linha_cova' ? (
                      <>
                        <div>
                          <p className="text-[10px] text-[var(--color-text-soft)]">Espaçamento</p>
                          <p className="font-medium text-[var(--color-text)]">
                            {item.cova || '—'}×{item.corredor || '—'} cm
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[var(--color-text-soft)]">Sementes por cova</p>
                          <p className="font-medium text-[var(--color-text)]">{r.sementesPorCova === null ? '—' : Math.round(r.sementesPorCova)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[var(--color-text-soft)]">Covas por m²</p>
                          <p className="font-medium text-[var(--color-text)]">{r.covasPorM2 === null ? '—' : formatarCovas(r.covasPorM2)}</p>
                        </div>
                      </>
                    ) : (
                      <div>
                        <p className="text-[10px] text-[var(--color-text-soft)]">Sementes por m²</p>
                        <p className="font-medium text-[var(--color-text)]">{r.sementesPorM2 === null ? '—' : Math.round(r.sementesPorM2)}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
