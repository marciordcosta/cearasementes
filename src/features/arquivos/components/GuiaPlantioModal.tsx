import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Transportadora } from '@/features/fretes/types';
import { calcularCanal } from '@/features/pricing/calculations';
import type { Canal, Categoria, Produto } from '@/features/pricing/types';
import { fmtBRL } from '@/lib/format';
import { calcularCovasPorM2, calcularKgPorHectareNumero, calcularSementesPorCova, calcularSementesPorM2 } from '../calculoSemeadura';
import { gerarGuiaPlantioPdf } from '../guiaPlantioPdf';
import { calcularVC, paraNumero } from '../metricas';
import { grupoDoNome, normalizarNome, resolverMargemTolerancia, resolverModoPlantio, resolverPmsBaseTexto } from '../parametrizacaoProdutos';
import type { ArquivoLaudo, ChecklistPergunta, FatorPlantio, ManualPlantio, ProdutoParametrizacao } from '../types';
import { ChecklistCondicaoModal } from './ChecklistCondicaoModal';

interface GuiaPlantioModalProps {
  open: boolean;
  arquivos: ArquivoLaudo[];
  produtos: ProdutoParametrizacao[];
  fatores: FatorPlantio[];
  checklist: ChecklistPergunta[];
  manual: ManualPlantio | null;
  /** Laudo já vindo selecionado da grade de Arquivos — entra sozinho na pilha ao abrir. */
  laudoInicial: ArquivoLaudo | null;
  canaisPreco: Canal[];
  categoriasPreco: Categoria[];
  produtosPreco: Produto[];
  transportadoras: Transportadora[];
  onFechar: () => void;
}

type Modo = 'linha_cova' | 'lanco';
type Condicao = 'ideal' | 'media' | 'baixa';
/** Qual dos 2 espaçamentos (Cova, Corredor) NÃO foi editado por último — esse é recalculado a cada edição. */
type CampoEspacamento = 'cova' | 'corredor';

interface ItemGuia {
  laudoId: string;
  area: string;
  /** Modo de plantio — individual por item (produtos diferentes na mesma pilha podem ter modos diferentes). */
  modo: Modo;
  /** Só usados quando modo === 'linha_cova'. Cova (cm) e Corredor (cm) são ligados: fixados o alvo de
   * sementes/m² e a Sementes/cova (digitada manualmente, nunca automática), sobra 1 grau de liberdade —
   * editar um dos 2 espaçamentos recalcula o outro sozinho. */
  cova: string;
  corredor: string;
  /** Sempre manual — nunca recalculado sozinho. Só aceita número inteiro ≥ 1; enquanto inválido, os espaçamentos ficam bloqueados. */
  sementesCova: string;
  /** Qual dos 2 espaçamentos foi editado por último — o outro é recalculado. */
  ultimoCampoEspacamento: CampoEspacamento;
  /** null = segue a condição global do cabeçalho; setado = o card foi ajustado à parte e não acompanha mais o cabeçalho. */
  condicaoOverride: Condicao | null;
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

/**
 * Pill de condição por card — um botão (não um <select> nativo) pra ficar com a
 * MESMA cara dos pills de A Lanço/Covas (altura, fonte e centralização idênticas,
 * sem as inconsistências de padding/centralização que um <select> nativo tem entre
 * navegadores). Azul quando o card tem a condição ajustada à parte do cabeçalho.
 */
function SeletorCondicaoItem({ valor, ajustada, onEscolher }: { valor: Condicao; ajustada: boolean; onEscolher: (v: Condicao) => void }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('click', fechar);
    return () => document.removeEventListener('click', fechar);
  }, [aberto]);

  const rotulo = OPCOES_CONDICAO.find((o) => o.valor === valor)?.rotulo ?? '';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title={ajustada ? 'Condição ajustada só para este produto' : 'Condição de plantio — segue o cabeçalho, ajuste aqui pra fixar só neste produto'}
        className={`inline-flex h-5 items-center gap-0.5 rounded-full border px-1.5 text-[10px] font-medium ${
          ajustada ? 'border-blue-600 bg-blue-600 text-white' : 'border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-text-soft)] hover:text-[var(--color-text)]'
        }`}
      >
        {rotulo}
        <span className="text-[8px]">▾</span>
      </button>
      {aberto && (
        <div className="absolute top-[calc(100%+4px)] right-0 z-[70] min-w-[76px] overflow-hidden rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] shadow-xl">
          {OPCOES_CONDICAO.map((o) => (
            <button
              key={o.valor}
              type="button"
              onClick={() => {
                setAberto(false);
                onEscolher(o.valor);
              }}
              className={`block w-full px-2.5 py-1.5 text-left text-xs hover:bg-[var(--color-page)] ${
                o.valor === valor ? 'font-semibold text-[var(--color-text)]' : 'text-[var(--color-text-soft)]'
              }`}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function fatorDe(fatores: FatorPlantio[], chave: string): number {
  return paraNumero(fatores.find((f) => f.chave === chave)?.fator ?? null) ?? 1;
}

function formatarCovas(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

/**
 * Arredonda o total de sacos por MARGEM de tolerância (cadastrada por grupo
 * em Parametrização, 25% se não cadastrado) em vez do arredondamento padrão
 * (0,5): até essa % de saco faltando ainda arredonda pra baixo (compra
 * menos), acima arredonda pra cima. Sempre no mínimo 1 saco quando há
 * alguma demanda de verdade (senão "faltar pouco" pra completar o PRIMEIRO
 * saco resultaria em 0 sacos, o que não faz sentido — tem que comprar pelo
 * menos 1 pra ter semente nenhuma).
 */
function arredondarSacos(quociente: number, margemFracao: number): number {
  const inteiros = Math.floor(quociente);
  const fracao = quociente - inteiros;
  const sacos = fracao > margemFracao ? inteiros + 1 : inteiros;
  return quociente > 0 ? Math.max(sacos, 1) : 0;
}

/** Sementes/cova é sempre digitada manualmente — só é válida como número inteiro ≥ 1 (sem casas decimais). Enquanto inválida, os espaçamentos ficam bloqueados. */
function sementesCovaValida(valorTexto: string): number | null {
  const n = paraNumero(valorTexto);
  return n !== null && n >= 1 && Number.isInteger(n) ? n : null;
}

/**
 * Recalcula o espaçamento (Cova ou Corredor) que NÃO foi editado por último,
 * a partir do alvo de Sementes/m² e da Sementes/cova (digitada manualmente,
 * fixa) — editar um dos 2 espaçamentos recalcula o outro sozinho, mantendo
 * Cova × Corredor constante. Usado tanto ao editar Cova/Corredor quanto
 * quando o alvo muda sozinho (condição, modo ou a própria Sementes/cova).
 * Os espaçamentos automáticos sempre saem em número inteiro (cm).
 */
function derivarEspacamento(sementesPorM2: number, sementesCova: number, item: Pick<ItemGuia, 'cova' | 'corredor' | 'ultimoCampoEspacamento'>): Partial<ItemGuia> | null {
  const produtoAlvo = (10000 * sementesCova) / sementesPorM2; // Cova × Corredor (cm²), fixo enquanto Sementes/cova e o alvo não mudarem
  if (item.ultimoCampoEspacamento === 'cova') {
    const cova = paraNumero(item.cova);
    if (cova === null || cova <= 0) return null;
    return { corredor: String(Math.round(produtoAlvo / cova)) };
  }
  const corredor = paraNumero(item.corredor);
  if (corredor === null || corredor <= 0) return null;
  return { cova: String(Math.round(produtoAlvo / corredor)) };
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

/**
 * Casa o produto do laudo com um produto da Tabela de Preço pelo GRUPO (1ª +
 * 3ª palavra, ver grupoDoNome) — mesmo critério usado em Parametrização.
 * Necessário porque a Tabela de Preço às vezes traz o nome científico no
 * meio ("Andropogon Gayanus Planaltina") que o laudo não tem ("Andropogon
 * Planaltina") — comparar o nome cru, sem reduzir, nunca batia.
 */
function encontrarProdutoPreco(nomeProduto: string, produtosPreco: Produto[]): Produto | null {
  const alvo = normalizarNome(grupoDoNome(nomeProduto));
  return produtosPreco.find((p) => normalizarNome(grupoDoNome(p.nome)) === alvo) ?? null;
}

/** PMS do lote (se digitado) ou, em branco, o PMS base do produto na Parametrização — como texto cru (ex.: "4,5"), pra exibir igual foi cadastrado. */
function pmsDoLaudo(laudo: Pick<ArquivoLaudo, 'nomeProduto' | 'pms'>, produtos: ProdutoParametrizacao[]): string | null {
  return laudo.pms || resolverPmsBaseTexto(laudo.nomeProduto, produtos);
}

/**
 * Guia de Plantio — busca ancorada na Tabela de Preço (catálogo real, nome
 * garantido): o operador digita uma palavra-chave, o sistema acha os
 * produtos da Tabela de Preço que batem e, pra cada um, lista os laudos
 * (lote + validade) cujo nome casa EXATAMENTE com o daquele produto. Produto
 * sem nenhum laudo aparece mesmo assim, com aviso — sinaliza que o laudo
 * está com um nome diferente do cadastrado lá, em vez de simplesmente sumir.
 * Escolher um lote empilha um resultado, cada um com sua própria área — dá
 * pra montar o plano de plantio de vários produtos diferentes na mesma
 * sessão, um "x" no canto tira um resultado da pilha sem mexer nos outros.
 *
 * Referência do cálculo é sempre a Densidade (Parametrização de Produtos):
 * Sementes/m² = Densidade ÷ Germinação final (VC%/teste × Sobrevivência% ×
 * Fatores de Modo/Condição) — não depende de PMS nem de área. PMS só entra
 * DEPOIS, pra converter Sementes/m² em kg/ha (peso). Sem PMS, kg/ha, Peso,
 * Sacos e Valor ficam pendentes, mas Sementes/m²/cova continuam saindo.
 *
 * Peso do saco e Valor vêm os dois da Tabela de Preço (módulo Precificação),
 * casando o produto do laudo pelo nome com um produto cadastrado lá.
 */
export function GuiaPlantioModal({
  open,
  arquivos,
  produtos,
  fatores,
  checklist,
  manual,
  laudoInicial,
  canaisPreco,
  categoriasPreco,
  produtosPreco,
  transportadoras,
  onFechar,
}: GuiaPlantioModalProps) {
  const [condicao, setCondicao] = useState<Condicao>('media');
  const [condicaoOrigem, setCondicaoOrigem] = useState<'manual' | 'checklist'>('manual');
  const [checklistAberto, setChecklistAberto] = useState(false);
  const [canalId, setCanalId] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [itens, setItens] = useState<ItemGuia[]>([]);
  const [confirmarImpressaoAberto, setConfirmarImpressaoAberto] = useState(false);
  const [setaResumoOffset, setSetaResumoOffset] = useState<number | null>(null);
  const resumoContainerRef = useRef<HTMLDivElement>(null);
  const condicaoBotaoRefs = useRef<Partial<Record<Condicao, HTMLButtonElement>>>({});

  const fatorCondicao = fatorDe(fatores, condicao);
  const resumoCondicao = fatores.find((f) => f.chave === condicao)?.resumo ?? null;

  // Reposiciona a setinha do resumo por cima do pill da condição selecionada (Baixa/Média/Ideal) —
  // recalcula ao trocar a condição, ao reabrir o modal ou quando o resumo aparece/some.
  useEffect(() => {
    const botao = condicaoBotaoRefs.current[condicao];
    const container = resumoContainerRef.current;
    if (!botao || !container) {
      setSetaResumoOffset(null);
      return;
    }
    const botaoRect = botao.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    setSetaResumoOffset(botaoRect.left - containerRect.left + botaoRect.width / 2);
  }, [condicao, resumoCondicao, open]);

  /** Condição efetiva do card: o override dele, se tiver ajustado; senão, segue a condição global do cabeçalho. */
  function condicaoDoItem(item: Pick<ItemGuia, 'condicaoOverride'>): Condicao {
    return item.condicaoOverride ?? condicao;
  }
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

  // Busca ancorada na Tabela de Preço (catálogo real, com peso e valor) — não
  // nos laudos (nome livre, sem garantia nenhuma). Pra cada produto cujo nome
  // bate com a palavra-chave, lista os laudos que casam com o mesmo GRUPO
  // (1ª + 3ª palavra, ver grupoDoNome — mesmo critério da Parametrização: a
  // Tabela de Preço às vezes traz o nome científico no meio, "Andropogon
  // Gayanus Planaltina", que o laudo não tem, "Andropogon Planaltina");
  // produto sem nenhum laudo aparece mesmo assim, com aviso — sinaliza que o
  // laudo desse produto está com um nome diferente do cadastrado lá.
  const gruposFiltrados = useMemo(() => {
    const termo = normalizarNome(busca);
    if (!termo) return [];
    return produtosPreco
      .filter((p) => normalizarNome(p.nome).includes(termo))
      .map((produto) => ({
        produto,
        laudos: arquivos
          .filter((a) => normalizarNome(grupoDoNome(a.nomeProduto)) === normalizarNome(grupoDoNome(produto.nome)))
          .sort((a, b) => validadeParaOrdenacao(b.validade) - validadeParaOrdenacao(a.validade)),
      }))
      .sort((a, b) => a.produto.nome.localeCompare(b.produto.nome))
      .slice(0, 6);
  }, [arquivos, produtosPreco, busca]);

  function selecionar(a: ArquivoLaudo) {
    setItens((prev) => {
      if (prev.some((it) => it.laudoId === a.id)) return prev;
      // Modo padrão vem da Parametrização (Cova ou Lanço, cadastrado por
      // grupo) — só o ponto de partida do item, o operador ainda troca à
      // vontade depois de adicionado (pills "A Lanço"/"Covas" no card).
      const modoPadrao: Modo = resolverModoPlantio(a.nomeProduto, produtos) === 'cova' ? 'linha_cova' : 'lanco';
      const fatorModo = fatorDe(fatores, modoPadrao);
      const sementesPorM2Inicial = calcularSementesPorM2(a, produtos, fatorModo, fatorCondicao);
      const covasPorM2Inicial = calcularCovasPorM2(50, 50);
      const sementesCovaInicial = calcularSementesPorCova(sementesPorM2Inicial, covasPorM2Inicial);
      return [
        ...prev,
        {
          laudoId: a.id,
          // Começa em 1 ha (não zerado) — só pra já sair mostrando os
          // totais calculados; o operador ajusta a área de verdade em
          // seguida.
          area: '1',
          modo: modoPadrao,
          cova: '50',
          corredor: '50',
          sementesCova: sementesCovaInicial === null ? '' : String(Math.round(sementesCovaInicial)),
          ultimoCampoEspacamento: 'corredor',
          condicaoOverride: null,
        },
      ];
    });
    setBusca('');
    setBuscaAberta(false);
  }

  // Veio da grade de Arquivos com um laudo já escolhido (botão "Guia de Plantio" com 1 selecionado) — entra sozinho na pilha ao abrir.
  useEffect(() => {
    if (open && laudoInicial) selecionar(laudoInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, laudoInicial]);

  function removerItem(laudoId: string) {
    setItens((prev) => prev.filter((it) => it.laudoId !== laudoId));
  }

  function atualizarItem(laudoId: string, patch: Partial<ItemGuia>) {
    setItens((prev) => prev.map((it) => (it.laudoId === laudoId ? { ...it, ...patch } : it)));
  }

  /**
   * Cova (cm) e Corredor (cm) são ligados: fixados o alvo de Sementes/m² e a
   * Sementes/cova (sempre digitada manualmente), sobra 1 grau de liberdade —
   * editar um dos 2 espaçamentos recalcula o outro sozinho.
   */
  function atualizarEspacamento(laudo: ArquivoLaudo, item: ItemGuia, campo: CampoEspacamento, valorTexto: string) {
    const patch: Partial<ItemGuia> = { [campo]: valorTexto, ultimoCampoEspacamento: campo };
    const sementesCova = sementesCovaValida(item.sementesCova);
    if (sementesCova !== null) {
      const fatorModo = fatorDe(fatores, item.modo);
      const fatorCondicaoItem = fatorDe(fatores, condicaoDoItem(item));
      const sementesPorM2 = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicaoItem);
      if (sementesPorM2 !== null && sementesPorM2 > 0) {
        const itemAtualizado = { ...item, [campo]: valorTexto, ultimoCampoEspacamento: campo };
        const derivadoPatch = derivarEspacamento(sementesPorM2, sementesCova, itemAtualizado);
        if (derivadoPatch) Object.assign(patch, derivadoPatch);
      }
    }
    atualizarItem(item.laudoId, patch);
  }

  /**
   * Área (ha) e Total de sacos são ligados nos dois modos: kg/ha e peso do
   * saco são fixos (Parametrização e Tabela de Preço), então dá pra ir dos
   * sacos pra área tão bem quanto o contrário — editar Total de sacos
   * recalcula a Área que produz exatamente essa quantidade. Área continua
   * sendo a única fonte de verdade guardada no estado (Sacos é sempre
   * derivado dela pra exibir, ver calcularResultado) — diferente de
   * Cova/Corredor, não precisa de um 2º campo guardado nem de saber "qual
   * foi editado por último".
   */
  function atualizarSacos(item: ItemGuia, valorTexto: string, kgPorHa: number | null, pesoSaco: number | null) {
    const valorLimpo = valorTexto.replace(/\D/g, '');
    if (valorLimpo === '') {
      atualizarItem(item.laudoId, { area: '' });
      return;
    }
    if (kgPorHa === null || kgPorHa <= 0 || pesoSaco === null || pesoSaco <= 0) return;
    const sacosDigitados = parseInt(valorLimpo, 10);
    const areaNova = (sacosDigitados * pesoSaco) / kgPorHa;
    atualizarItem(item.laudoId, { area: areaNova > 0 ? String(Math.round(areaNova * 100) / 100) : '' });
  }

  /** Sementes/cova é sempre manual — nunca recalculada sozinha; só dispara o recálculo do espaçamento que já estava "de fora". Só aceita dígitos (número inteiro). */
  function atualizarSementesCova(laudo: ArquivoLaudo, item: ItemGuia, valorTexto: string) {
    const valorLimpo = valorTexto.replace(/\D/g, '');
    const patch: Partial<ItemGuia> = { sementesCova: valorLimpo };
    const sementesCova = sementesCovaValida(valorLimpo);
    if (sementesCova !== null) {
      const fatorModo = fatorDe(fatores, item.modo);
      const fatorCondicaoItem = fatorDe(fatores, condicaoDoItem(item));
      const sementesPorM2 = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicaoItem);
      if (sementesPorM2 !== null && sementesPorM2 > 0) {
        const derivadoPatch = derivarEspacamento(sementesPorM2, sementesCova, item);
        if (derivadoPatch) Object.assign(patch, derivadoPatch);
      }
    }
    atualizarItem(item.laudoId, patch);
  }

  /** Trocar o modo (A Lanço ⇄ Covas) também muda o alvo de Sementes/m² (fator de perda diferente) — recalcula o espaçamento derivado na hora, junto com a troca. */
  function mudarModo(laudo: ArquivoLaudo, item: ItemGuia, modo: Modo) {
    const patch: Partial<ItemGuia> = { modo };
    const sementesCova = sementesCovaValida(item.sementesCova);
    if (modo === 'linha_cova' && sementesCova !== null) {
      const fatorModo = fatorDe(fatores, modo);
      const fatorCondicaoItem = fatorDe(fatores, condicaoDoItem(item));
      const sementesPorM2 = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicaoItem);
      if (sementesPorM2 !== null && sementesPorM2 > 0) {
        const derivadoPatch = derivarEspacamento(sementesPorM2, sementesCova, item);
        if (derivadoPatch) Object.assign(patch, derivadoPatch);
      }
    }
    atualizarItem(item.laudoId, patch);
  }

  /** O operador ajustou a condição só desse card (menu de escolha) — passa a ignorar o cabeçalho global e recalcula na hora. */
  function mudarCondicaoItem(laudo: ArquivoLaudo, item: ItemGuia, condicaoNova: Condicao) {
    const patch: Partial<ItemGuia> = { condicaoOverride: condicaoNova };
    const sementesCova = sementesCovaValida(item.sementesCova);
    if (item.modo === 'linha_cova' && sementesCova !== null) {
      const fatorModo = fatorDe(fatores, item.modo);
      const fatorCondicaoNovo = fatorDe(fatores, condicaoNova);
      const sementesPorM2 = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicaoNovo);
      if (sementesPorM2 !== null && sementesPorM2 > 0) {
        const derivadoPatch = derivarEspacamento(sementesPorM2, sementesCova, item);
        if (derivadoPatch) Object.assign(patch, derivadoPatch);
      }
    }
    atualizarItem(item.laudoId, patch);
  }

  // A condição de plantio muda o fator de perda e, com ele, o alvo de Sementes/m² —
  // sem isso, o espaçamento derivado ficaria com o valor antigo até o operador tocar
  // nele de novo. Só afeta cards que ainda seguem o cabeçalho — os que têm
  // condicaoOverride setado ficam de fora (já foram ajustados à parte).
  useEffect(() => {
    setItens((prev) => {
      let mudou = false;
      const proximos = prev.map((item) => {
        if (item.modo !== 'linha_cova' || item.condicaoOverride !== null) return item;
        const sementesCova = sementesCovaValida(item.sementesCova);
        if (sementesCova === null) return item;
        const laudo = arquivos.find((a) => a.id === item.laudoId);
        if (!laudo) return item;
        const fatorModo = fatorDe(fatores, item.modo);
        const sementesPorM2 = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicao);
        if (sementesPorM2 === null || sementesPorM2 <= 0) return item;
        const patch = derivarEspacamento(sementesPorM2, sementesCova, item);
        if (!patch) return item;
        const chave = Object.keys(patch)[0] as keyof ItemGuia;
        if (patch[chave] === item[chave]) return item;
        mudou = true;
        return { ...item, ...patch };
      });
      return mudou ? proximos : prev;
    });
  }, [fatorCondicao, fatores, produtos, arquivos]);

  function fecharTudo() {
    setBusca('');
    setItens([]);
    onFechar();
  }

  function calcularResultado(laudo: ArquivoLaudo, item: ItemGuia) {
    const fatorModo = fatorDe(fatores, item.modo);
    const fatorCondicaoItem = fatorDe(fatores, condicaoDoItem(item));
    const kgPorHa = calcularKgPorHectareNumero(laudo, produtos, fatorModo, fatorCondicaoItem);
    const sementesPorM2 = calcularSementesPorM2(laudo, produtos, fatorModo, fatorCondicaoItem);
    const areaNum = paraNumero(item.area);
    const pesoTotal = kgPorHa !== null && areaNum !== null && areaNum > 0 ? kgPorHa * areaNum : null;
    const pesoSaco = pesoSacoDoProduto(laudo.nomeProduto);
    // Arredonda por margem de tolerância (Parametrização, 25% padrão) — não
    // por 0,5 nem sempre pra cima (Math.ceil antigo virava 1 saco a mais só
    // por faltar 1kg, um exagero em compras maiores).
    const margemTolerancia = resolverMargemTolerancia(laudo.nomeProduto, produtos);
    const sacos = pesoTotal !== null && pesoSaco !== null && pesoSaco > 0 ? arredondarSacos(pesoTotal / pesoSaco, margemTolerancia / 100) : null;
    const precoSaco = precoSacoDoProduto(laudo.nomeProduto);
    const valorTotal = sacos !== null && precoSaco !== null ? sacos * precoSaco : null;
    // Custo por hectare = preço por kg (valor unit. ÷ peso do saco) × taxa de semeadura (kg/ha) — quanto custa plantar 1 ha, direto (não depende da área digitada).
    const custoPorHa = precoSaco !== null && pesoSaco !== null && pesoSaco > 0 && kgPorHa !== null ? (precoSaco / pesoSaco) * kgPorHa : null;
    // Peso total REAL (o que efetivamente se compra/pesa) = sacos (arredondados) × peso do saco — diferente do
    // "Total previsto/necessário" (teórico, continuo) porque só dá pra comprar saco inteiro.
    const pesoTotalReal = sacos !== null && pesoSaco !== null ? sacos * pesoSaco : null;
    const covasPorM2 = item.modo === 'linha_cova' ? calcularCovasPorM2(paraNumero(item.cova), paraNumero(item.corredor)) : null;
    const sementesPorCova = calcularSementesPorCova(sementesPorM2, covasPorM2);
    return { kgPorHa, pesoTotal, pesoTotalReal, pesoSaco, sacos, valorTotal, custoPorHa, sementesPorCova, sementesPorM2, precoSaco, covasPorM2 };
  }

  function motivoSemSacos(pesoSaco: number | null): string {
    return pesoSaco === null ? 'Produto não encontrado na Tabela de Preço, ou sem peso cadastrado lá' : '';
  }

  function motivoSemValor(sacos: number | null): string {
    if (!canalId) return 'Escolha uma Tabela de Preço pra calcular o valor';
    if (sacos === null) return 'Produto sem peso cadastrado na Tabela de Preço';
    return 'Produto não encontrado na Tabela de Preço (confira se o nome bate)';
  }

  // Soma dos cards empilhados — só entra na soma o que deu pra calcular (sacos/peso/valor nulos são ignorados, não zerados).
  const resumoGeral = itens.reduce(
    (acc, item) => {
      const laudo = arquivos.find((a) => a.id === item.laudoId);
      if (!laudo) return acc;
      const r = calcularResultado(laudo, item);
      return {
        totalSacos: acc.totalSacos + (r.sacos ?? 0),
        totalPeso: acc.totalPeso + (r.pesoTotalReal ?? 0),
        totalValor: acc.totalValor + (r.valorTotal ?? 0),
      };
    },
    { totalSacos: 0, totalPeso: 0, totalValor: 0 },
  );

  function imprimir(comManual: boolean) {
    const linhas = itens.flatMap((item) => {
      const laudo = arquivos.find((a) => a.id === item.laudoId);
      if (!laudo) return [];
      const r = calcularResultado(laudo, item);
      const modoLabel = OPCOES_MODO.find((o) => o.valor === item.modo)?.rotulo ?? '';
      const condicaoLabel = OPCOES_CONDICAO.find((o) => o.valor === condicaoDoItem(item))?.rotulo ?? '';
      return [
        {
          nomeProduto: laudo.nomeProduto,
          lote: laudo.lote,
          condicaoLabel,
          modoLabel,
          area: item.area ? `${item.area} ha` : '—',
          taxaSemeadura: r.kgPorHa === null ? '—' : `${Math.ceil(r.kgPorHa)} kg/ha`,
          totalPrevisto: r.pesoTotal === null ? '—' : `${Math.ceil(r.pesoTotal)} kg`,
          custoPorHa: r.custoPorHa === null ? '—' : fmtBRL.format(r.custoPorHa),
          totalSacos: r.sacos === null ? '—' : `${r.sacos} sacos`,
          valorTotal: r.valorTotal === null ? '—' : fmtBRL.format(r.valorTotal),
          sementesOuCovasLabel: item.modo === 'linha_cova' ? 'Covas/m²' : null,
          sementesOuCovasValor: item.modo === 'linha_cova' ? (r.covasPorM2 === null ? '—' : formatarCovas(r.covasPorM2)) : null,
          espacamento: item.modo === 'linha_cova' ? `${item.cova || '—'}×${item.corredor || '—'} cm` : null,
          sementesPorCova: item.modo === 'linha_cova' ? (r.sementesPorCova === null ? '—' : String(Math.round(r.sementesPorCova))) : null,
        },
      ];
    });
    gerarGuiaPlantioPdf(
      linhas,
      {
        totalSacos: `${resumoGeral.totalSacos} sacos`,
        totalPeso: `${Math.ceil(resumoGeral.totalPeso)} kg`,
        totalValor: fmtBRL.format(resumoGeral.totalValor),
      },
      manual,
      comManual,
    );
  }

  const mostrandoSugestoes = buscaAberta && gruposFiltrados.length > 0;
  const mostrandoSemResultado = buscaAberta && busca.trim().length > 0 && gruposFiltrados.length === 0;
  // O painel de sugestões é `absolute` e não entra no fluxo normal — sem essa
  // reserva, o modal (que cresce só pelo conteúdo em fluxo) fica baixo demais
  // e o `overflow-y-auto` do próprio Modal corta o painel por cima.
  const alturaReservada = mostrandoSugestoes
    ? Math.min(
        gruposFiltrados.reduce((acc, g) => acc + 24 + Math.max(g.laudos.length, 1) * 40, 0),
        320,
      ) + 8
    : mostrandoSemResultado
      ? 44
      : 0;

  return (
    <Modal
      open={open}
      title="Guia de Plantio"
      onClose={fecharTudo}
      widthClassName="max-w-[640px]"
      heightClassName="max-h-[92vh]"
      footer={
        itens.length > 0 ? (
          <div className="flex w-full items-center justify-between gap-3">
            <p className="text-xs text-[var(--color-text-soft)]">
              <span className="font-semibold text-[var(--color-text)]">{resumoGeral.totalSacos}</span> sacos ·{' '}
              <span className="font-semibold text-[var(--color-text)]">{Math.ceil(resumoGeral.totalPeso)} kg</span> ·{' '}
              <span className="font-semibold text-[var(--color-text)]">{fmtBRL.format(resumoGeral.totalValor)}</span>
            </p>
            <Button variant="outline" onClick={() => (manual ? setConfirmarImpressaoAberto(true) : imprimir(false))}>
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
            {OPCOES_CONDICAO.map((o) => {
              const selecionada = condicao === o.valor;
              const viaChecklist = selecionada && condicaoOrigem === 'checklist';
              return (
                <button
                  key={o.valor}
                  ref={(el) => {
                    condicaoBotaoRefs.current[o.valor] = el ?? undefined;
                  }}
                  type="button"
                  onClick={() => {
                    setCondicao(o.valor);
                    setCondicaoOrigem('manual');
                  }}
                  title={viaChecklist ? 'Definida pelo checklist' : undefined}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                    viaChecklist
                      ? 'bg-blue-600 text-white'
                      : selecionada
                        ? 'bg-[var(--color-accent)] text-white'
                        : 'bg-[var(--color-page)] text-[var(--color-text-soft)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {o.rotulo}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setChecklistAberto(true)}
              title="Checklist de diagnóstico de campo"
              className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-soft)] hover:text-[var(--color-text)]"
            >
              ☑ Checklist
            </button>
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

        {resumoCondicao && (
          <div ref={resumoContainerRef} className="relative mt-1.5 rounded-md bg-[var(--color-page)] p-2">
            {setaResumoOffset !== null && (
              <span
                aria-hidden
                style={{ left: setaResumoOffset }}
                className="absolute -top-1.5 h-3 w-3 -translate-x-1/2 rotate-45 bg-[var(--color-page)]"
              />
            )}
            <p className="relative text-xs text-[var(--color-text-soft)]">{resumoCondicao}</p>
          </div>
        )}

        <div className="relative">
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setBuscaAberta(true);
            }}
            onFocus={() => setBuscaAberta(true)}
            onBlur={() => setTimeout(() => setBuscaAberta(false), 120)}
            placeholder="Buscar produto na Tabela de Preço..."
            autoComplete="off"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
          />
          {buscaAberta && gruposFiltrados.length > 0 && (
            <div className="absolute z-30 mt-1 max-h-[320px] w-full overflow-y-auto rounded-md border border-[var(--color-line)] bg-[var(--color-surface)]/95 shadow-lg backdrop-blur-sm">
              {gruposFiltrados.map((grupo) => {
                const precoSaco = precoSacoDoProduto(grupo.produto.nome);
                return (
                  <div key={grupo.produto.id} className="border-b border-[var(--color-line)] py-1 last:border-b-0">
                    <p className="truncate px-3 py-1 text-sm font-semibold text-[var(--color-text)]" title={grupo.produto.nome}>
                      {grupo.produto.nome}
                    </p>
                    {grupo.laudos.length === 0 ? (
                      <p className="px-3 pb-1.5 text-xs text-[var(--color-text-soft)]">Nenhum laudo encontrado com esse nome — confira se o nome bate com a Tabela de Preço.</p>
                    ) : (
                      grupo.laudos.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selecionar(a)}
                          className="flex w-full flex-col px-3 py-1 pl-4 text-left text-xs text-[var(--color-text-soft)] hover:bg-[var(--color-accent)]/15 hover:text-[var(--color-text)]"
                        >
                          Lote {a.lote ?? '—'} · Val. {a.validade ?? '—'}
                          {precoSaco !== null && ` · ${fmtBRL.format(precoSaco)}/saco`}
                        </button>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {buscaAberta && busca.trim() && gruposFiltrados.length === 0 && (
            <div className="absolute z-30 mt-1 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)]/95 px-3 py-2 text-xs text-[var(--color-text-soft)] shadow-lg">
              Nenhum produto encontrado na Tabela de Preço com esse nome.
            </div>
          )}
        </div>
        {alturaReservada > 0 && <div style={{ height: alturaReservada }} aria-hidden />}

        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {itens.map((item) => {
            const laudo = arquivos.find((a) => a.id === item.laudoId);
            if (!laudo) return null;
            const r = calcularResultado(laudo, item);
            return (
              <div key={item.laudoId} className="relative overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-page)] p-2.5">
                <button
                  type="button"
                  onClick={() => removerItem(item.laudoId)}
                  title="Remover esse resultado"
                  className="absolute right-2.5 top-2.5 text-bad hover:opacity-70"
                >
                  ✕
                </button>
                <div className="-mx-2.5 -mt-2.5 rounded-t-lg bg-slate-700 px-2.5 pt-2.5 pb-2">
                  <div className="pr-6">
                    <p className="truncate text-sm font-semibold text-white">{laudo.nomeProduto}</p>
                    <p className="truncate text-[10px] text-slate-300" title={`Lote ${laudo.lote ?? '—'} · VC ${calcularVC(laudo)} · PMS ${pmsDoLaudo(laudo, produtos) ?? '—'}`}>
                      Lote {laudo.lote ?? '—'} · VC {calcularVC(laudo)} · PMS {pmsDoLaudo(laudo, produtos) ?? '—'}
                      {r.precoSaco !== null && ` · ${fmtBRL.format(r.precoSaco)}/saco`}
                    </p>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-0.5">
                      {OPCOES_MODO.map((o) => (
                        <button
                          key={o.valor}
                          type="button"
                          onClick={() => mudarModo(laudo, item, o.valor)}
                          className={`inline-flex h-5 items-center rounded-full px-1.5 text-[10px] font-medium transition ${
                            item.modo === o.valor ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-text-soft)] hover:text-[var(--color-text)]'
                          }`}
                        >
                          {o.rotulo}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-300">Condição:</span>
                      <SeletorCondicaoItem valor={condicaoDoItem(item)} ajustada={item.condicaoOverride !== null} onEscolher={(v) => mudarCondicaoItem(laudo, item, v)} />
                    </div>
                  </div>
                </div>

                <div className="mt-1.5 flex flex-wrap items-end gap-1.5">
                  <div>
                    <p className="text-[10px] text-[var(--color-text-soft)]">Área (ha)</p>
                    <input
                      value={item.area}
                      onChange={(e) => atualizarItem(item.laudoId, { area: e.target.value })}
                      inputMode="decimal"
                      className="w-16 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)]"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--color-text-soft)]">Total de sacos</p>
                    <input
                      value={r.sacos === null ? '' : String(r.sacos)}
                      onChange={(e) => atualizarSacos(item, e.target.value, r.kgPorHa, r.pesoSaco)}
                      disabled={r.kgPorHa === null || r.pesoSaco === null}
                      inputMode="numeric"
                      title={
                        r.kgPorHa === null || r.pesoSaco === null
                          ? 'Precisa do kg/ha (Densidade/Sobrevivência) e do peso do saco (Tabela de Preço) pra ligar com a Área'
                          : 'Ligado com Área (ha) — editar recalcula a área pra essa quantidade de sacos'
                      }
                      className="w-16 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  {item.modo === 'linha_cova' &&
                    (() => {
                      const espacamentoBloqueado = sementesCovaValida(item.sementesCova) === null;
                      return (
                        <>
                          {/* Quebra a linha aqui de propósito — Distância/Corredor/Sementes-cova/Covas-m² sempre numa linha própria, embaixo de Área/Total de sacos, independente de largura disponível. */}
                          <div className="basis-full" />
                          <div>
                            <p className="text-[10px] text-[var(--color-text-soft)]">Distância (cm)</p>
                            <input
                              value={item.cova}
                              onChange={(e) => atualizarEspacamento(laudo, item, 'cova', e.target.value)}
                              disabled={espacamentoBloqueado}
                              inputMode="decimal"
                              title={espacamentoBloqueado ? 'Informe a quantidade de sementes por cova (número inteiro ≥ 1) pra liberar o espaçamento' : 'Ligado com Corredor — editar um recalcula o outro'}
                              className="w-14 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </div>
                          <div>
                            <p className="text-[10px] text-[var(--color-text-soft)]">Corredor (cm)</p>
                            <input
                              value={item.corredor}
                              onChange={(e) => atualizarEspacamento(laudo, item, 'corredor', e.target.value)}
                              disabled={espacamentoBloqueado}
                              inputMode="decimal"
                              title={espacamentoBloqueado ? 'Informe a quantidade de sementes por cova (número inteiro ≥ 1) pra liberar o espaçamento' : 'Ligado com Cova — editar um recalcula o outro'}
                              className="w-14 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </div>
                          <div>
                            <p className="text-[10px] text-[var(--color-text-soft)]">Sementes/cova</p>
                            <input
                              value={item.sementesCova}
                              onChange={(e) => atualizarSementesCova(laudo, item, e.target.value)}
                              inputMode="numeric"
                              title="Quantidade de sementes por cova (número inteiro ≥ 1) — sempre digitada manualmente; os espaçamentos se ajustam sozinhos"
                              className="w-14 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-xs text-[var(--color-text)]"
                            />
                          </div>
                          <div>
                            <p className="text-[10px] text-[var(--color-text-soft)]">Covas/m²</p>
                            <p className="border border-transparent px-1.5 py-1 text-xs font-medium text-[var(--color-text)]">
                              {r.covasPorM2 === null ? '—' : formatarCovas(r.covasPorM2)}
                            </p>
                          </div>
                        </>
                      );
                    })()}
                </div>

                {r.kgPorHa === null && r.sementesPorM2 === null ? (
                  <p className="mt-1.5 text-xs text-[var(--color-text-soft)]">
                    Faltam dados pra calcular esse lote — confira Densidade, Índice de Sobrevivência (ou teste de campo) na Parametrização de Produtos.
                  </p>
                ) : (
                  <div className="mt-1.5 grid grid-cols-2 items-center gap-x-2 gap-y-1 border-t border-[var(--color-line)] pt-1.5 text-xs">
                    {r.kgPorHa === null && (
                      <p className="col-span-2 pb-0.5 text-[10px] text-[var(--color-text-soft)]">
                        Sem PMS cadastrado — Taxa, Total, Custo, Valor e Investimento ficam pendentes; sementes seguem calculadas por Densidade e Germinação.
                      </p>
                    )}
                    <p className="whitespace-nowrap border-b border-[var(--color-line)] pb-1 text-[var(--color-text-soft)]">Taxa de Semeadura</p>
                    <p className="border-b border-[var(--color-line)] pb-1 text-right font-medium text-[var(--color-text)]">
                      {r.kgPorHa === null ? '—' : `${Math.ceil(r.kgPorHa)} kg/ha`}
                    </p>

                    <p className="whitespace-nowrap border-b border-[var(--color-line)] pb-1 text-[var(--color-text-soft)]">Total necessário (kg)</p>
                    <p className="border-b border-[var(--color-line)] pb-1 text-right font-medium text-[var(--color-text)]">
                      {r.pesoTotal === null ? '—' : `${Math.ceil(r.pesoTotal)} kg`}
                    </p>

                    <p className="whitespace-nowrap border-b border-[var(--color-line)] pb-1 text-[var(--color-text-soft)]">Custo por ha (R$)</p>
                    <p className="border-b border-[var(--color-line)] pb-1 text-right font-medium text-[var(--color-text)]">
                      {r.custoPorHa === null ? '—' : fmtBRL.format(r.custoPorHa)}
                    </p>

                    <p className="whitespace-nowrap border-b border-[var(--color-line)] pb-1 text-[var(--color-text-soft)]">Total de sacos</p>
                    <p
                      className="border-b border-[var(--color-line)] pb-1 text-right font-medium text-[var(--color-text)]"
                      title={r.sacos === null ? motivoSemSacos(r.pesoSaco) : undefined}
                    >
                      {r.sacos === null ? '—' : `${r.sacos} sacos`}
                    </p>

                    <p className="whitespace-nowrap text-[var(--color-text-soft)]">Investimento</p>
                    <p className="text-right font-semibold text-[var(--color-text)]" title={r.valorTotal === null ? motivoSemValor(r.sacos) : undefined}>
                      {r.valorTotal === null ? '—' : fmtBRL.format(r.valorTotal)}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ChecklistCondicaoModal
        open={checklistAberto}
        checklist={checklist}
        fatores={fatores}
        onFechar={() => setChecklistAberto(false)}
        onConfirmar={(chave) => {
          setCondicao(chave as Condicao);
          setCondicaoOrigem('checklist');
          setChecklistAberto(false);
        }}
      />
      <Modal
        open={confirmarImpressaoAberto}
        title="Imprimir Guia de Plantio"
        onClose={() => setConfirmarImpressaoAberto(false)}
        widthClassName="max-w-[420px]"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmarImpressaoAberto(false);
                imprimir(false);
              }}
            >
              Só os resultados
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirmarImpressaoAberto(false);
                imprimir(true);
              }}
            >
              Incluir Manual de Plantio
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-text)]">Deseja imprimir também o Manual de Plantio junto com os resultados?</p>
      </Modal>
    </Modal>
  );
}
