import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { NumeroSincronizado } from '@/components/ui/NumeroSincronizado';
import { TabToggle } from '@/components/ui/TabToggle';
import { calcularCanal, calcularPesoCubado, calcularPesoEfetivo } from '@/features/pricing/calculations';
import type { Canal, Categoria, Produto } from '@/features/pricing/types';
import { mensagemDeErro } from '@/lib/errors';
import { fmtBRL, fmtInt } from '@/lib/format';
import { calcularCustoRota, chegadaDoTrecho, cidadesDasTransportadoras, cotarFrete, ordenarCotacoes } from '../calculations';
import { calcularRotaKm, geocodificarCidade } from '../orsClient';
import type { ItemOrcamento, ModoCotacao, RotaParametros, RotaResultado, Transportadora } from '../types';
import { AutocompleteInput } from './AutocompleteInput';
import { RotaCidadesBuilder } from './RotaCidadesBuilder';

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
  const [usarRota, setUsarRota] = useState(false);
  const [cidade, setCidade] = useState('');
  const [modo, setModo] = useState<ModoCotacao | null>(null);

  // ---- Modo Digitação Direta ----
  const [peso, setPeso] = useState('');
  const [valor, setValor] = useState('');

  // ---- Modo Orçamento ----
  const [canalId, setCanalId] = useState('');
  const [itens, setItens] = useState<ItemOrcamento[]>([]);
  const [buscaProduto, setBuscaProduto] = useState('');

  // ---- Rota (Frota Própria) — peso/valor vêm do mesmo Direta/Orçamento acima, só o cálculo (km via API) e o resultado são específicos daqui ----
  const [cidadesRota, setCidadesRota] = useState<string[]>([]);
  const [rotaCalculando, setRotaCalculando] = useState(false);
  const [rotaErro, setRotaErro] = useState<string | null>(null);
  const [rotaResultado, setRotaResultado] = useState<RotaResultado | null>(null);

  // ---- Comparativo com Frota Própria, na Cidade única — mesma conta da Rota, só que pra 1 cidade só (Base -> cidade -> Base).
  // Dispara sozinho quando o peso atinge o "Peso mínimo p/ comparativo automático" da Parametrização de Rota. ----
  const [comparativoFrota, setComparativoFrota] = useState<RotaResultado | null>(null);
  const [comparativoCalculando, setComparativoCalculando] = useState(false);
  const [comparativoErro, setComparativoErro] = useState<string | null>(null);
  const comparativoChaveRef = useRef<string | null>(null);

  const transportadoraPorId = useMemo(() => new Map(transportadoras.map((t) => [t.id, t])), [transportadoras]);
  const canal = canais.find((c) => c.id === canalId);

  // Cada cidade aparece com a UF da transportadora que a atende — ajuda a
  // diferenciar cidades de nomes iguais em estados diferentes.
  const cidadesAtendidas = useMemo(() => cidadesDasTransportadoras(transportadoras), [transportadoras]);

  const opcoesProdutos = useMemo(
    () => produtos.map((p) => ({ valor: p.nome })).sort((a, b) => a.valor.localeCompare(b.valor, 'pt-BR')),
    [produtos],
  );

  // Transportadoras que atendem a cidade digitada — aparece assim que a cidade é preenchida, antes de escolher o modo.
  const transportadorasCidade = useMemo(() => {
    if (!cidade.trim()) return null;
    return cotarFrete(transportadoras, { cidade: cidade.trim(), peso: 0, valorMercadoria: 0 });
  }, [transportadoras, cidade]);

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

  // Pra Cidade única, só libera escolher Direta/Orçamento se alguma transportadora atender a cidade; pra Rota, libera direto (não depende de transportadora nenhuma).
  const podeEscolherModo = usarRota || (transportadorasCidade !== null && transportadorasCidade.length > 0);

  const resultado = useMemo(() => {
    if (usarRota || !cidade.trim() || !pesoValorAtual) return null;
    return ordenarCotacoes(cotarFrete(transportadoras, { cidade: cidade.trim(), peso: pesoValorAtual.peso, valorMercadoria: pesoValorAtual.valor }));
  }, [usarRota, transportadoras, cidade, pesoValorAtual]);

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
    if (cidadesRota.length === 0) {
      setRotaErro('Adicione ao menos uma cidade na rota.');
      return;
    }
    if (!pesoValorAtual) {
      setRotaErro('Preencha Peso total e Valor total da carga (Direta ou Orçamento, ao lado).');
      return;
    }

    setRotaCalculando(true);
    try {
      const resultado = await calcularCustoRotaCompleta(cidadesRota, pesoValorAtual.peso, pesoValorAtual.valor);
      setRotaResultado(resultado);
      onRotaCalculada?.();
    } catch (e) {
      setRotaErro(mensagemDeErro(e, 'Falha ao calcular a rota.'));
    } finally {
      setRotaCalculando(false);
    }
  }

  // Comparativo automático com Frota Própria na Cidade única — só dispara quando o peso
  // atinge o "Peso mínimo p/ comparativo automático" configurado (0 = gatilho desligado).
  // Um pequeno atraso evita bater a API a cada tecla digitada, e só recalcula se a "chave"
  // (cidade+peso+valor) realmente mudou.
  useEffect(() => {
    const pesoMinimo = parametrosRota.pesoMinimoComparativo;
    if (usarRota || !cidade.trim() || !pesoValorAtual || !parametrosRota.cidadeInicio.trim() || pesoMinimo <= 0 || pesoValorAtual.peso < pesoMinimo) {
      comparativoChaveRef.current = null;
      setComparativoFrota(null);
      setComparativoErro(null);
      setComparativoCalculando(false);
      return;
    }

    const chave = `${cidade.trim()}|${pesoValorAtual.peso}|${pesoValorAtual.valor}|${parametrosRota.cidadeInicio}`;
    if (chave === comparativoChaveRef.current) return;

    let cancelado = false;
    const timeout = setTimeout(async () => {
      setComparativoCalculando(true);
      setComparativoErro(null);
      try {
        const resultado = await calcularCustoRotaCompleta([cidade.trim()], pesoValorAtual.peso, pesoValorAtual.valor);
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
  }, [usarRota, cidade, pesoValorAtual, parametrosRota, calcularCustoRotaCompleta, onRotaCalculada]);

  function limparTudo() {
    setUsarRota(false);
    setCidade('');
    setModo(null);
    setPeso('');
    setValor('');
    setCanalId('');
    setItens([]);
    setBuscaProduto('');
    setCidadesRota([]);
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

  return (
    <Card className="space-y-3 p-5">
      <h3 className="text-sm font-semibold text-[var(--color-text)]">Cotação de Frete</h3>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ---- Coluna 1: cidade, transportadoras, modo e resultado (ou Rota, se ativada) ---- */}
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-[var(--color-text-soft)]">Cidade de destino</label>
              <TabToggle
                value={usarRota ? 'rota' : 'unica'}
                onChange={(v) => setUsarRota(v === 'rota')}
                options={[
                  { value: 'unica', label: 'Cidade única' },
                  { value: 'rota', label: 'Rota (múltiplas cidades)' },
                ]}
              />
            </div>
            {!usarRota && (
              <AutocompleteInput value={cidade} onChangeTexto={setCidade} opcoes={cidadesAtendidas} placeholder="Ex.: Sobral" className={`max-w-md ${campoClasse}`} />
            )}
          </div>

          {usarRota && (
            <RotaCidadesBuilder
              cidadeInicio={parametrosRota.cidadeInicio}
              cidades={cidadesRota}
              onChangeCidades={setCidadesRota}
              transportadoras={transportadoras}
              cidadesCache={cidadesRotaCache}
            />
          )}

          {!usarRota && transportadorasCidade !== null && (
            <div className="space-y-2 border-t border-[var(--color-line)] pt-3">
              {transportadorasCidade.length === 0 ? (
                <p className="text-sm text-[var(--color-text-soft)]">Nenhuma transportadora atende essa cidade.</p>
              ) : (
                <div>
                  <p className="mb-1 text-xs font-semibold text-[var(--color-text-soft)]">Transportadoras disponíveis para {cidade}:</p>
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

          {podeEscolherModo && (
            <div className={usarRota ? '' : 'border-t border-[var(--color-line)] pt-3'}>
              <TabToggle
                value={modo ?? 'orcamento'}
                onChange={(v) => setModo(v)}
                options={[
                  { value: 'orcamento', label: 'Orçamento' },
                  { value: 'direta', label: 'Digitação Direta' },
                ]}
              />
            </div>
          )}

          {usarRota && (
            <Button variant="action" onClick={calcularRota} disabled={rotaCalculando || cidadesRota.length === 0 || !pesoValorAtual}>
              {rotaCalculando ? 'Calculando rota…' : 'Calcular Rota'}
            </Button>
          )}

          {!usarRota && resultado && (
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

          {!usarRota &&
            cidade.trim() &&
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

          {usarRota && rotaErro && <p className="text-sm text-bad">{rotaErro}</p>}

          {usarRota && rotaResultado && (
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
        </div>

        {/* ---- Coluna 2: formulário do modo escolhido (Direta ou Orçamento) ---- */}
        <div>
          {podeEscolherModo && modo === 'direta' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Peso (kg)</label>
                <input type="number" step="0.01" value={peso} onChange={(e) => setPeso(e.target.value)} className={`num ${campoClasse}`} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--color-text-soft)]">Valor mercadoria (R$)</label>
                <input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} className={`num ${campoClasse}`} />
              </div>
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
        </div>
      </div>
    </Card>
  );
});
