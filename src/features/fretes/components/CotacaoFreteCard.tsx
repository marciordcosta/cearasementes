import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { NumeroSincronizado } from '@/components/ui/NumeroSincronizado';
import { TabToggle } from '@/components/ui/TabToggle';
import { calcularCanal, calcularPesoCubado, calcularPesoEfetivo } from '@/features/pricing/calculations';
import type { Canal, Categoria, Produto } from '@/features/pricing/types';
import { mensagemDeErro } from '@/lib/errors';
import { fmtBRL, fmtInt } from '@/lib/format';
import { calcularCustoRota, chegadaDoTrecho, cotarFrete, ordenarCotacoes } from '../calculations';
import { gerarEtiquetaFretePdf } from '../etiquetaFretePdf';
import { calcularRotaKm, geocodificarCidade, sugerirOrdemPorProximidade } from '../orsClient';
import type { ItemOrcamento, ModoCotacao, NotaEtiqueta, RotaParametros, RotaResultado, Transportadora } from '../types';
import { AutocompleteInput } from './AutocompleteInput';
import { RotaCidadesBuilder } from './RotaCidadesBuilder';

const NOTA_VAZIA: NotaEtiqueta = { nf: '', volumes: 1 };

interface CotacaoFreteCardProps {
  transportadoras: Transportadora[];
  produtos: Produto[];
  canais: Canal[];
  categorias: Categoria[];
  parametrosRota: RotaParametros;
  cidadesRotaCache: string[];
  onRotaCalculada?: () => void;
}

export interface CotacaoFreteCardHandle {
  limparTudo: () => void;
}

const campoClasse = 'w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)]';
const campoPequenoClasse = 'num rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 py-1 text-right text-sm text-[var(--color-text)]';

/** Os campos já vêm com o percentual calculado (não é um "part/total" cru) — só formata pro padrão pt-BR. */
function fmtPct1(valor: number): string {
  return `${valor.toFixed(1).replace('.', ',')}%`;
}

/**
 * kmTotal já é ida+volta (o cálculo do custo continua usando esse total) —
 * pra exibição, mostra só a ida: kmTotal menos o último trecho (que é sempre
 * "última cidade -> Base", ou seja, a volta). Funciona tanto pra rota de uma
 * cidade só quanto pra rota com várias.
 */
function kmDeIda(resultado: RotaResultado): number {
  const ultimoTrecho = resultado.trechos[resultado.trechos.length - 1];
  return resultado.kmTotal - (ultimoTrecho?.km ?? 0);
}

/** Simulador de cotação/orçamento de frete — porte do frete.html original, estendido com o modo "Orçamento" (produtos da Tabela de Preço + despesa extra). */
export const CotacaoFreteCard = forwardRef<CotacaoFreteCardHandle, CotacaoFreteCardProps>(function CotacaoFreteCard(
  { transportadoras, produtos, canais, categorias, parametrosRota, cidadesRotaCache, onRotaCalculada },
  ref,
) {
  // Cidade de destino — sempre uma lista (mesma UI do antigo modo "Rota"),
  // mesmo com 1 cidade só: 1 cidade = cotação por transportadora (como o
  // antigo "Cidade única"); 2+ cidades = Rota de Frota Própria (como hoje),
  // sem mais alternância manual entre os dois modos.
  const [cidades, setCidades] = useState<string[]>([]);
  const [modo, setModo] = useState<ModoCotacao | null>(null);

  // ---- Modo Digitação Direta ----
  const [peso, setPeso] = useState('');
  const [valor, setValor] = useState('');

  // ---- Modo Orçamento ----
  const [canalId, setCanalId] = useState('');
  const [itens, setItens] = useState<ItemOrcamento[]>([]);
  const [buscaProduto, setBuscaProduto] = useState('');

  // ---- Modo Etiquetas — NF(s) + volumes por cidade da lista acima; chaveado pelo texto da cidade
  // (não por índice) pra não perder os dados se a lista for reordenada nas setas ▲▼. ----
  const [notasPorCidade, setNotasPorCidade] = useState<Record<string, NotaEtiqueta[]>>({});

  // ---- Rota (Frota Própria) — peso/valor vêm do mesmo Direta/Orçamento acima, só o cálculo (km via API) e o resultado são específicos daqui ----
  const [rotaCalculando, setRotaCalculando] = useState(false);
  const [rotaErro, setRotaErro] = useState<string | null>(null);
  const [rotaResultado, setRotaResultado] = useState<RotaResultado | null>(null);
  const [sugerindoRota, setSugerindoRota] = useState(false);

  // ---- Comparativo com Frota Própria, na Cidade única — mesma conta da Rota, só que pra 1 cidade só (Base -> cidade -> Base).
  // Dispara sozinho quando o peso atinge o "Peso mínimo p/ comparativo automático" da Parametrização de Rota. ----
  const [comparativoFrota, setComparativoFrota] = useState<RotaResultado | null>(null);
  const [comparativoCalculando, setComparativoCalculando] = useState(false);
  const [comparativoErro, setComparativoErro] = useState<string | null>(null);
  const comparativoChaveRef = useRef<string | null>(null);

  const transportadoraPorId = useMemo(() => new Map(transportadoras.map((t) => [t.id, t])), [transportadoras]);
  const canal = canais.find((c) => c.id === canalId);

  // 2+ cidades = Rota de Frota Própria (sem transportadora, custo por km); 1 cidade só = cotação por transportadora, exatamente como o antigo "Cidade única".
  const ehRota = cidades.length >= 2;
  // Nome completo (com ", UF" se veio de sugestão) — usado pra geocodificar (Rota/comparativo), onde a UF ajuda a desambiguar.
  const cidadeUnica = cidades.length === 1 ? cidades[0] : null;
  // Só o nome da cidade (sem ", UF") — é assim que fica salvo em transportadora_prazos.cidade, então a UF tem que sair antes de comparar.
  const cidadeUnicaChave = cidadeUnica ? cidadeUnica.split(',')[0].trim() : null;

  const opcoesProdutos = useMemo(
    () => produtos.map((p) => ({ valor: p.nome })).sort((a, b) => a.valor.localeCompare(b.valor, 'pt-BR')),
    [produtos],
  );

  // Transportadoras que atendem a cidade digitada — aparece assim que a 1ª cidade é preenchida, antes de escolher o modo (some se virar Rota).
  const transportadorasCidade = useMemo(() => {
    if (!cidadeUnicaChave) return null;
    return cotarFrete(transportadoras, { cidade: cidadeUnicaChave, peso: 0, valorMercadoria: 0 });
  }, [transportadoras, cidadeUnicaChave]);

  const dadosItem = useCallback(
    (item: ItemOrcamento) => {
      const produto = produtos.find((p) => p.id === item.produtoId);
      if (!produto) return null;
      const categoria = categorias.find((c) => c.id === produto.categoriaId) ?? categorias[0];
      const valorTabela = canal ? calcularCanal(produto, canal, categoria, transportadoraPorId).preco : 0;
      const valorUnitario = item.valorManual ?? valorTabela;
      const pesoEfetivo = calcularPesoEfetivo(produto);
      const pesoCubado = calcularPesoCubado(produto.cubagem) !== null;
      return { produto, valorTabela, valorUnitario, pesoEfetivo, pesoCubado };
    },
    [produtos, canal, categorias, transportadoraPorId],
  );

  const resumoOrcamento = useMemo(() => {
    let totalItens = 0;
    let pesoTotal = 0;
    let valorTotalProdutos = 0;
    for (const item of itens) {
      const d = dadosItem(item);
      if (!d) continue;
      totalItens += item.quantidade;
      pesoTotal += d.pesoEfetivo * item.quantidade;
      valorTotalProdutos += d.valorUnitario * item.quantidade;
    }
    return { totalItens, pesoTotal, valorTotalProdutos };
  }, [itens, dadosItem]);

  // Peso/valor da carga — mesma lógica pros dois modos (Cidade única e Rota):
  // "Direta" é digitado à mão, "Orçamento" vem dos produtos escolhidos na Tabela de Preço.
  const pesoValorAtual = useMemo(() => {
    if (modo === 'direta') {
      const pesoNum = parseFloat(peso);
      const valorNum = parseFloat(valor);
      if (isNaN(pesoNum) || isNaN(valorNum)) return null;
      return { peso: pesoNum, valor: valorNum };
    }
    if (modo === 'orcamento') {
      if (itens.length === 0) return null;
      return { peso: resumoOrcamento.pesoTotal, valor: resumoOrcamento.valorTotalProdutos };
    }
    return null;
  }, [modo, peso, valor, itens.length, resumoOrcamento]);

  // Com 1 cidade só, libera escolher Direta/Orçamento se alguma transportadora atender ela; com 2+ (Rota), libera direto (não depende de transportadora nenhuma).
  const podeEscolherModo = ehRota || (transportadorasCidade !== null && transportadorasCidade.length > 0);

  const resultado = useMemo(() => {
    if (ehRota || !cidadeUnicaChave || !pesoValorAtual) return null;
    return ordenarCotacoes(cotarFrete(transportadoras, { cidade: cidadeUnicaChave, peso: pesoValorAtual.peso, valorMercadoria: pesoValorAtual.valor }));
  }, [ehRota, transportadoras, cidadeUnicaChave, pesoValorAtual]);

  /** Geocodifica Base + cidades (na ordem) e calcula km/dias/custo — usado tanto pelo botão "Calcular Rota" (várias cidades) quanto pelo comparativo automático da Cidade única (1 cidade só). */
  const calcularCustoRotaCompleta = useCallback(
    async (cidadesDaRota: string[], peso: number, valor: number): Promise<RotaResultado> => {
      const nomes = [parametrosRota.cidadeInicio, ...cidadesDaRota, parametrosRota.cidadeInicio];
      const coordPorNome = new Map<string, { lat: number; lon: number }>();
      for (const nome of new Set(nomes)) {
        coordPorNome.set(nome, await geocodificarCidade(nome));
      }
      const pontos = nomes.map((n) => coordPorNome.get(n)!);

      const { kmTotal, trechosKm } = await calcularRotaKm(pontos);
      let kmAcumulado = 0;
      const trechos = trechosKm.map((km, i) => {
        kmAcumulado += km;
        const chegada = chegadaDoTrecho(kmAcumulado, parametrosRota);
        return { de: nomes[i], para: nomes[i + 1], km, chegadaDia: chegada.dia, chegadaHorario: chegada.horario };
      });
      const custo = calcularCustoRota(kmTotal, parametrosRota, peso, valor);
      return { kmTotal, trechos, ...custo };
    },
    [parametrosRota],
  );

  async function calcularRota() {
    setRotaErro(null);
    setRotaResultado(null);

    if (!parametrosRota.cidadeInicio.trim()) {
      setRotaErro('Configure a "Cidade de início (Base)" na Parametrização de Rota antes de calcular.');
      return;
    }
    if (cidades.length === 0) {
      setRotaErro('Adicione ao menos uma cidade na rota.');
      return;
    }
    if (!pesoValorAtual) {
      setRotaErro('Preencha Peso total e Valor total da carga (Direta ou Orçamento, ao lado).');
      return;
    }

    setRotaCalculando(true);
    try {
      const resultado = await calcularCustoRotaCompleta(cidades, pesoValorAtual.peso, pesoValorAtual.valor);
      setRotaResultado(resultado);
      onRotaCalculada?.();
    } catch (e) {
      setRotaErro(mensagemDeErro(e, 'Falha ao calcular a rota.'));
    } finally {
      setRotaCalculando(false);
    }
  }

  /** Reordena as cidades pela heurística de vizinho mais próximo (linha reta, a partir da Base) — só sugere a ordem, quem confirma o custo de verdade é o "Calcular Frete" (km real de rodovia). */
  async function sugerirRota() {
    setRotaErro(null);
    if (!parametrosRota.cidadeInicio.trim()) {
      setRotaErro('Configure a "Cidade de início (Base)" na Parametrização de Rota antes de sugerir a rota.');
      return;
    }
    if (cidades.length < 2) return;

    setSugerindoRota(true);
    try {
      const coordBase = await geocodificarCidade(parametrosRota.cidadeInicio);
      const cidadesComCoord = await Promise.all(cidades.map(async (nome) => ({ nome, coord: await geocodificarCidade(nome) })));
      setCidades(sugerirOrdemPorProximidade(coordBase, cidadesComCoord));
    } catch (e) {
      setRotaErro(mensagemDeErro(e, 'Falha ao sugerir a rota.'));
    } finally {
      setSugerindoRota(false);
    }
  }

  // Comparativo automático com Frota Própria na Cidade única — só dispara quando o peso
  // atinge o "Peso mínimo p/ comparativo automático" configurado (0 = gatilho desligado).
  // Um pequeno atraso evita bater a API a cada tecla digitada, e só recalcula se a "chave"
  // (cidade+peso+valor) realmente mudou.
  useEffect(() => {
    const pesoMinimo = parametrosRota.pesoMinimoComparativo;
    if (ehRota || !cidadeUnica || !pesoValorAtual || !parametrosRota.cidadeInicio.trim() || pesoMinimo <= 0 || pesoValorAtual.peso < pesoMinimo) {
      comparativoChaveRef.current = null;
      setComparativoFrota(null);
      setComparativoErro(null);
      setComparativoCalculando(false);
      return;
    }

    const chave = `${cidadeUnica}|${pesoValorAtual.peso}|${pesoValorAtual.valor}|${parametrosRota.cidadeInicio}`;
    if (chave === comparativoChaveRef.current) return;

    let cancelado = false;
    const timeout = setTimeout(async () => {
      setComparativoCalculando(true);
      setComparativoErro(null);
      try {
        const resultado = await calcularCustoRotaCompleta([cidadeUnica], pesoValorAtual.peso, pesoValorAtual.valor);
        if (cancelado) return;
        comparativoChaveRef.current = chave;
        setComparativoFrota(resultado);
        onRotaCalculada?.();
      } catch (e) {
        if (cancelado) return;
        setComparativoErro(mensagemDeErro(e, 'Falha ao calcular o comparativo com frota própria.'));
      } finally {
        if (!cancelado) setComparativoCalculando(false);
      }
    }, 700);

    return () => {
      cancelado = true;
      clearTimeout(timeout);
    };
  }, [ehRota, cidadeUnica, pesoValorAtual, parametrosRota, calcularCustoRotaCompleta, onRotaCalculada]);

  function limparTudo() {
    setCidades([]);
    setModo(null);
    setPeso('');
    setValor('');
    setCanalId('');
    setItens([]);
    setBuscaProduto('');
    setNotasPorCidade({});
    setRotaResultado(null);
    setRotaErro(null);
    comparativoChaveRef.current = null;
    setComparativoFrota(null);
    setComparativoErro(null);
  }

  useImperativeHandle(ref, () => ({ limparTudo }));

  function adicionarItem(produtoId: string) {
    setItens((prev) => {
      const existente = prev.find((i) => i.produtoId === produtoId);
      if (existente) {
        return prev.map((i) => (i.produtoId === produtoId ? { ...i, quantidade: i.quantidade + 1 } : i));
      }
      return [...prev, { produtoId, quantidade: 1, valorManual: null }];
    });
  }

  function removerItem(produtoId: string) {
    setItens((prev) => prev.filter((i) => i.produtoId !== produtoId));
  }

  function atualizarQuantidade(produtoId: string, texto: string) {
    const n = parseInt(texto, 10);
    setItens((prev) => prev.map((i) => (i.produtoId === produtoId ? { ...i, quantidade: isNaN(n) ? 0 : n } : i)));
  }

  function normalizarQuantidadeMinima(produtoId: string, quantidadeAtual: number) {
    if (!quantidadeAtual || quantidadeAtual < 1) atualizarQuantidade(produtoId, '1');
  }

  function atualizarValorManual(produtoId: string, novoValor: number) {
    setItens((prev) => prev.map((i) => (i.produtoId === produtoId ? { ...i, valorManual: novoValor } : i)));
  }

  function restaurarValor(produtoId: string) {
    setItens((prev) => prev.map((i) => (i.produtoId === produtoId ? { ...i, valorManual: null } : i)));
  }

  function notasDaCidade(cidade: string): NotaEtiqueta[] {
    return notasPorCidade[cidade] ?? [NOTA_VAZIA];
  }

  function atualizarNota(cidade: string, indice: number, patch: Partial<NotaEtiqueta>) {
    setNotasPorCidade((prev) => {
      const atuais = prev[cidade] ?? [NOTA_VAZIA];
      return { ...prev, [cidade]: atuais.map((n, i) => (i === indice ? { ...n, ...patch } : n)) };
    });
  }

  function adicionarNota(cidade: string) {
    setNotasPorCidade((prev) => ({ ...prev, [cidade]: [...(prev[cidade] ?? [NOTA_VAZIA]), { nf: '', volumes: 1 }] }));
  }

  function removerNota(cidade: string, indice: number) {
    setNotasPorCidade((prev) => {
      const restantes = (prev[cidade] ?? [NOTA_VAZIA]).filter((_, i) => i !== indice);
      return { ...prev, [cidade]: restantes.length > 0 ? restantes : [NOTA_VAZIA] };
    });
  }

  /** Ignora NF em branco ou volumes ≤ 0 — não precisa validar antes, só não gera etiqueta pra linha vazia. */
  function imprimirEtiquetas() {
    const grupos = cidades
      .map((cidade) => ({ cidade, notas: notasDaCidade(cidade).filter((n) => n.nf.trim() && n.volumes > 0) }))
      .filter((g) => g.notas.length > 0);
    if (grupos.length === 0) return;
    gerarEtiquetaFretePdf(grupos);
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--color-text)]">Cotação de Frete</h3>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ---- Card 1: cidade, transportadoras, modo e resultado (ou Rota, se ativada) ---- */}
        <Card className="space-y-3 p-5">
          <RotaCidadesBuilder
            cidadeInicio={parametrosRota.cidadeInicio}
            cidades={cidades}
            onChangeCidades={setCidades}
            transportadoras={transportadoras}
            cidadesCache={cidadesRotaCache}
          />

          {!ehRota && transportadorasCidade !== null && (
            <div className="space-y-2 border-t border-[var(--color-line)] pt-3">
              {transportadorasCidade.length === 0 ? (
                <p className="text-sm text-[var(--color-text-soft)]">Nenhuma transportadora atende essa cidade.</p>
              ) : (
                <div>
                  <p className="mb-1 text-xs font-semibold text-[var(--color-text-soft)]">Transportadoras disponíveis para {cidadeUnica}:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {transportadorasCidade.map((t) => (
                      <span key={t.transportadoraId} className="rounded-full bg-[var(--color-page)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text)]">
                        {t.nome} — {t.uf}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {ehRota && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={sugerirRota} disabled={sugerindoRota || rotaCalculando}>
                {sugerindoRota ? 'Sugerindo…' : 'Sugerir Rota'}
              </Button>
              <Button variant="action" onClick={calcularRota} disabled={rotaCalculando || sugerindoRota || cidades.length === 0 || !pesoValorAtual}>
                {rotaCalculando ? 'Calculando…' : 'Calcular Frete'}
              </Button>
            </div>
          )}

          {!ehRota && resultado && (
            <div className="space-y-2 border-t border-[var(--color-line)] pt-3">
              <p className="text-xs font-semibold text-[var(--color-text-soft)]">Resultado do frete:</p>
              {resultado.length === 0 ? (
                <p className="text-sm text-[var(--color-text-soft)]">Nenhuma transportadora atende essa cidade.</p>
              ) : (
                resultado.slice(0, 5).map((r, indice) =>
                  indice === 0 ? (
                    <div key={r.transportadoraId} className="rounded-lg border-2 border-[var(--color-accent)] bg-good-soft px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="mr-2 rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#04241A]">Menor frete</span>
                          <span className="font-semibold text-[var(--color-navy)]">
                            {r.nome} — {r.uf}
                          </span>
                          <span className="ml-2 text-[var(--color-navy)] opacity-80">{typeof r.prazo === 'number' ? `${r.prazo}h úteis` : r.prazo}</span>
                        </div>
                        <span className="num text-lg font-bold text-[var(--color-navy)]">{fmtBRL.format(r.total)}</span>
                      </div>
                      <div className="mt-1 text-xs text-[var(--color-navy)] opacity-80">
                        {fmtPct1(r.pctValorCarga)} do valor da carga · {fmtBRL.format(r.custoPorKg)}/kg
                      </div>
                    </div>
                  ) : (
                    <div key={r.transportadoraId} className="rounded-lg bg-[var(--color-page)] px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-[var(--color-text)]">
                            {r.nome} — {r.uf}
                          </span>
                          <span className="ml-2 text-[var(--color-text-soft)]">{typeof r.prazo === 'number' ? `${r.prazo}h úteis` : r.prazo}</span>
                        </div>
                        <span className="num font-semibold text-[var(--color-text)]">{fmtBRL.format(r.total)}</span>
                      </div>
                      <div className="mt-1 text-xs text-[var(--color-text-soft)]">
                        {fmtPct1(r.pctValorCarga)} do valor da carga · {fmtBRL.format(r.custoPorKg)}/kg
                      </div>
                    </div>
                  ),
                )
              )}
            </div>
          )}

          {!ehRota &&
            cidadeUnica &&
            pesoValorAtual &&
            parametrosRota.pesoMinimoComparativo > 0 &&
            pesoValorAtual.peso >= parametrosRota.pesoMinimoComparativo && (
            <div className="space-y-1.5 border-t border-[var(--color-line)] pt-3">
              <p className="text-xs font-semibold text-[var(--color-text-soft)]">
                Comparativo — Frota Própria <span className="font-normal">(peso ≥ {fmtInt.format(parametrosRota.pesoMinimoComparativo)} kg)</span>:
              </p>
              {comparativoCalculando && <p className="text-sm text-[var(--color-text-soft)]">Calculando comparativo com frota própria…</p>}
              {comparativoErro && <p className="text-sm text-bad">{comparativoErro}</p>}
              {!comparativoCalculando && comparativoFrota && (
                <div className="rounded-lg bg-[var(--color-page)] px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-[var(--color-text)]">{parametrosRota.nomeTransporte || 'Frota Própria'}</span>
                      <span className="ml-2 text-[var(--color-text-soft)]">
                        {fmtInt.format(Math.round(kmDeIda(comparativoFrota)))} km (ida) · {comparativoFrota.diasViagem} dia{comparativoFrota.diasViagem === 1 ? '' : 's'}
                      </span>
                    </div>
                    <span className="num font-semibold text-[var(--color-text)]">{fmtBRL.format(comparativoFrota.valorFrete)}</span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-text-soft)]">
                    {fmtPct1(comparativoFrota.pctValorCarga)} do valor da carga · {fmtBRL.format(comparativoFrota.custoPorKg)}/kg
                    {resultado && resultado.length > 0 && (
                      <>
                        {' · '}
                        {comparativoFrota.valorFrete < resultado[0].total
                          ? `${fmtBRL.format(resultado[0].total - comparativoFrota.valorFrete)} mais barato que a transportadora`
                          : `${fmtBRL.format(comparativoFrota.valorFrete - resultado[0].total)} mais caro que a transportadora`}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {ehRota && rotaErro && <p className="text-sm text-bad">{rotaErro}</p>}

          {ehRota && rotaResultado && (
            <div className="space-y-2 border-t border-[var(--color-line)] pt-3">
              <p className="text-xs font-semibold text-[var(--color-text-soft)]">Resultado do frete:</p>
              <div className="rounded-lg border-2 border-[var(--color-accent)] bg-good-soft px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-[var(--color-navy)]">{parametrosRota.nomeTransporte || 'Frota Própria'}</span>
                    <span className="ml-2 text-[var(--color-navy)] opacity-80">
                      {fmtInt.format(Math.round(kmDeIda(rotaResultado)))} km (ida) · {rotaResultado.diasViagem} dia{rotaResultado.diasViagem === 1 ? '' : 's'}
                    </span>
                  </div>
                  <span className="num text-lg font-bold text-[var(--color-navy)]">{fmtBRL.format(rotaResultado.valorFrete)}</span>
                </div>
                <div className="mt-1 text-xs text-[var(--color-navy)] opacity-80">
                  {fmtPct1(rotaResultado.pctValorCarga)} do valor da carga · {fmtBRL.format(rotaResultado.custoPorKg)}/kg · saída às {parametrosRota.horarioInicio}
                </div>
              </div>

              <details className="text-xs text-[var(--color-text-soft)]">
                <summary className="cursor-pointer font-semibold">Ver trechos da rota</summary>
                <div className="mt-1.5 space-y-1">
                  {rotaResultado.trechos.map((t, i) => (
                    <p key={i}>
                      {t.de} → {t.para}: <span className="num font-medium text-[var(--color-text)]">{fmtInt.format(Math.round(t.km))} km</span> — chega no Dia{' '}
                      {t.chegadaDia}, ~{t.chegadaHorario}
                    </p>
                  ))}
                </div>
              </details>
            </div>
          )}
        </Card>

        {/* ---- Card 2: escolha do modo (Orçamento/Digitação Direta) + formulário correspondente ---- */}
        <Card className="space-y-3 p-5">
          {podeEscolherModo || cidades.length > 0 ? (
            <TabToggle
              value={modo ?? (podeEscolherModo ? 'orcamento' : 'etiquetas')}
              onChange={(v) => setModo(v)}
              options={[
                ...(podeEscolherModo
                  ? [
                      { value: 'orcamento' as const, label: 'Orçamento' },
                      { value: 'direta' as const, label: 'Digitação Direta' },
                    ]
                  : []),
                // Etiquetas não depende de nenhuma transportadora atender a cidade — é só rotulagem física do envio.
                ...(cidades.length > 0 ? [{ value: 'etiquetas' as const, label: 'Etiquetas' }] : []),
              ]}
            />
          ) : (
            <p className="text-sm text-[var(--color-text-soft)]">Adicione uma cidade de destino para escolher Orçamento ou Digitação Direta.</p>
          )}

          {podeEscolherModo && modo === 'direta' && (
            <div className="grid grid-cols-[auto_140px] items-center justify-start gap-x-3 gap-y-2.5">
              <label className="text-xs font-semibold text-[var(--color-text-soft)]">Peso (kg)</label>
              <input type="number" step="0.01" value={peso} onChange={(e) => setPeso(e.target.value)} className={`num ${campoClasse}`} />

              <label className="text-xs font-semibold text-[var(--color-text-soft)]">Valor mercadoria (R$)</label>
              <input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} className={`num ${campoClasse}`} />
            </div>
          )}

          {podeEscolherModo && modo === 'orcamento' && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Escolher Tabela</label>
                <select value={canalId} onChange={(e) => setCanalId(e.target.value)} className={`max-w-xs ${campoClasse}`}>
                  <option value="" className="text-[var(--color-text)]">— Selecione a Tabela de Preço —</option>
                  {canais.map((c) => (
                    <option key={c.id} value={c.id} className="text-[var(--color-text)]">
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>

              {!canalId ? (
                <p className="text-sm text-[var(--color-text-soft)]">Escolha uma Tabela de Preço para adicionar produtos.</p>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Adicionar Produto</label>
                    <AutocompleteInput
                      value={buscaProduto}
                      onChangeTexto={setBuscaProduto}
                      opcoes={opcoesProdutos}
                      onSelecionar={(nome) => {
                        const encontrado = produtos.find((p) => p.nome === nome);
                        if (encontrado) adicionarItem(encontrado.id);
                        setBuscaProduto('');
                      }}
                      placeholder="Digite o nome do produto…"
                      className={`max-w-md ${campoClasse}`}
                    />
                  </div>

                  {itens.length > 0 && (
                    <div className="space-y-1.5">
                      {itens.map((item) => {
                        const d = dadosItem(item);
                        if (!d) return null;
                        const manual = item.valorManual !== null;
                        return (
                          <div key={item.produtoId} className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-line)] bg-[var(--color-page)] px-2.5 py-1.5 text-sm">
                            <span className="min-w-[140px] flex-1 truncate font-semibold text-[var(--color-text)]">{d.produto.nome}</span>
                            <span
                              className="num w-24 shrink-0 text-right text-[var(--color-text-soft)]"
                              title={d.pesoCubado ? `Peso cubado (cubagem: ${d.produto.cubagem})` : undefined}
                            >
                              {d.pesoEfetivo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg{d.pesoCubado ? ' 📦' : ''}
                            </span>
                            <div className="flex shrink-0 items-center gap-1">
                              <NumeroSincronizado
                                valor={d.valorUnitario}
                                onCommit={(val) => atualizarValorManual(item.produtoId, val)}
                                className={`w-24 rounded border px-1.5 py-1 text-right text-sm num ${manual ? 'price-input-manual border-warn bg-warn-soft text-[var(--color-navy)]' : 'border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-text)]'}`}
                              />
                              <button
                                type="button"
                                onClick={() => restaurarValor(item.produtoId)}
                                title="Voltar ao preço da tabela"
                                tabIndex={-1}
                                className={`shrink-0 text-[var(--color-text-soft)] hover:text-[var(--color-text)] ${manual ? 'visible' : 'invisible'}`}
                              >
                                ↺
                              </button>
                            </div>
                            <input
                              type="number"
                              min="1"
                              value={item.quantidade || ''}
                              onChange={(e) => atualizarQuantidade(item.produtoId, e.target.value)}
                              onBlur={() => normalizarQuantidadeMinima(item.produtoId, item.quantidade)}
                              title="Quantidade"
                              className={`w-16 shrink-0 ${campoPequenoClasse}`}
                            />
                            <button type="button" onClick={() => removerItem(item.produtoId)} title="Remover item" className="shrink-0 text-[var(--color-text-soft)] hover:text-bad">
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {itens.length > 0 && (
                    <div className="grid grid-cols-3 gap-3 rounded-md bg-[var(--color-page)] p-3 text-sm">
                      <div>
                        <p className="text-xs text-[var(--color-text-soft)]">Total de Itens</p>
                        <p className="num font-semibold text-[var(--color-text)]">{fmtInt.format(resumoOrcamento.totalItens)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--color-text-soft)]">Peso Total</p>
                        <p className="num font-semibold text-[var(--color-text)]">{resumoOrcamento.pesoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} kg</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--color-text-soft)]">Valor Total dos Produtos</p>
                        <p className="num font-semibold text-[var(--color-text)]">{fmtBRL.format(resumoOrcamento.valorTotalProdutos)}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {modo === 'etiquetas' && cidades.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-text-soft)]">
                Pra cada cidade, informe a(s) NF(s) e a quantidade de volumes — sai 1 etiqueta por volume (ex.: 50 volumes = etiquetas "1/50" a "50/50").
              </p>
              {cidades.map((cidade, indiceCidade) => (
                <div key={`${cidade}_${indiceCidade}`} className="space-y-2 rounded-md border border-[var(--color-line)] p-3">
                  <p className="text-sm font-semibold text-[var(--color-text)]">
                    {indiceCidade + 1}. {cidade}
                  </p>
                  <div className="space-y-1.5">
                    {notasDaCidade(cidade).map((nota, indiceNota) => (
                      <div key={indiceNota} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="NF"
                          value={nota.nf}
                          onChange={(e) => atualizarNota(cidade, indiceNota, { nf: e.target.value })}
                          className={`max-w-[160px] ${campoClasse}`}
                        />
                        <input
                          type="number"
                          min={1}
                          placeholder="Volumes"
                          value={nota.volumes || ''}
                          onChange={(e) => atualizarNota(cidade, indiceNota, { volumes: parseInt(e.target.value, 10) || 0 })}
                          title="Quantidade de volumes"
                          className={`w-24 ${campoPequenoClasse}`}
                        />
                        <button
                          type="button"
                          onClick={() => removerNota(cidade, indiceNota)}
                          title="Remover NF"
                          className="shrink-0 text-[var(--color-text-soft)] hover:text-bad"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" onClick={() => adicionarNota(cidade)}>
                    + Adicionar NF
                  </Button>
                </div>
              ))}
              <Button variant="primary" onClick={imprimirEtiquetas}>
                🏷️ Imprimir Etiquetas
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
});
