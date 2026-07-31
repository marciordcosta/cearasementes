import type { FormaRegra, RegraConciliacao } from './regras';
import { rotuloCategoria, type ChaveRotuloCategoria, type FormaPagamento, type LancamentoBanco, type LancamentoSistema, type SugestoesConciliacao, type SugestoesConciliacaoInversa } from './types';
import {
  dentroDaJanelaUtil,
  extrairParcela,
  getCategoriaSistema,
  getSubtipoCartaoOfx,
  getSubtipoCartaoSistema,
  nomesSemelhantesFortes,
  normalizarNomeClienteOfx,
  parcelaCompativel,
  parseDataISO,
  removerAcentos,
  valoresIguais,
} from './utils';

type RegrasPorForma = Record<FormaRegra, RegraConciliacao>;

/**
 * Data usada pra comparar o lançamento do Sistema contra o Banco — pra CHEQUE
 * é o VENCIMENTO (o banco compensa nessa data, não na de recebimento), caindo
 * pra `data` quando o lançamento não tiver vencimento (import antigo, sem essa
 * coluna, ou outra forma de pagamento qualquer).
 */
function dataComparavelSistema(s: LancamentoSistema, categoria: FormaPagamento): string | null {
  return categoria === 'CHEQUE' ? (s.dataVencimento ?? s.data) : s.data;
}

/** Chave única de um par (Banco, Sistema) — usada tanto pra gravar quanto pra checar um descarte de sugestão (ver `conciliacao_sugestoes_descartadas`). */
export function chaveParDescarte(bancoId: string, sistemaId: string): string {
  return `${bancoId}|${sistemaId}`;
}

/**
 * Sugestões de conciliação pra UM lançamento do banco — porte de
 * buscarSugestoes() do conciliacao.js. Cada categoria é checada em ordem de
 * prioridade e a função retorna assim que encontra uma correspondência boa
 * o bastante (ex.: PIX com nome idêntico não continua checando "mesmo valor").
 *
 * Todos os limites numéricos (tolerância de valor, dias, tamanho mínimo de
 * nome) vêm de `regras` — parametrizável no modal de Regras de Conciliação,
 * em vez de fixos no código. Só 3 regras hoje: GENERICA (PIX/Cheque/
 * Rendimento/Outro, mesmo mecanismo pros 4), CARTAO (Débito e Crédito
 * compartilham a mesma regra) e BOLETO.
 *
 * `combinado` indica que `itemBanco` é a SOMA de vários lançamentos
 * selecionados juntos (mesma grade) — nesse caso o nome já não diz nada
 * (é a concatenação de descrições de origens diferentes), então a busca
 * ignora "nome parecido" e vale só o valor: só sugere se a soma bater com
 * algum valor do sistema.
 */
function buscarSugestoesPorTag(itemBanco: LancamentoBanco, sistema: LancamentoSistema[], regras: RegrasPorForma, combinado = false, descartes: Set<string> = new Set()): SugestoesConciliacao {
  const tipoOfx = itemBanco.formaPagamento;
  const valorOfxAbs = Math.abs(itemBanco.valor);
  const dataOfx = itemBanco.data || null;

  // Propositalmente NÃO exclui `s.conciliado` aqui (diferente da conciliação
  // automática, que nunca toca num registro já ligado): se uma regra bateria
  // com um lançamento já conciliado (ou pré-conciliado), a sugestão mostra
  // ele mesmo assim, mas sinalizado — pode ter sido uma conciliação errada,
  // e o usuário precisa ver isso pra poder desfazer.
  const sistemaFiltradoPorTipo = sistema.filter((s) => {
    if (s.desativado) return false;
    if (descartes.has(chaveParDescarte(itemBanco.id, s.id))) return false;
    if (getCategoriaSistema(s.formaPagamentoRaw) !== tipoOfx) return false;
    const vOfx = itemBanco.valor;
    const vSys = s.valor;
    if (vOfx < 0 && vSys >= 0) return false;
    if (vOfx > 0 && vSys <= 0) return false;
    return true;
  });

  const resp: SugestoesConciliacao = {};

  // ---- PIX: valor exato primeiro (como qualquer forma); se não bater,
  // procura por nome parecido — e, só entre esses candidatos de nome
  // parecido (nunca com PIX de outro cliente), tenta achar uma soma que bata
  // com o valor. Restringir a combinação por nome evita o risco de somar PIX
  // de clientes diferentes que só coincidem em valor (comum com valores
  // "redondos", tipo 60 + 840 = 900). ----
  if (tipoOfx === 'PIX' && !combinado) {
    const regraGenerica = regras.GENERICA;
    const nomeOfx = normalizarNomeClienteOfx(itemBanco.descricao);
    // Quando há vários candidatos de mesmo valor (comum em PIX de valor
    // "redondo"), o de nome parecido com o do OFX vem primeiro dentro de
    // cada categoria — desempata sem precisar de uma categoria separada.
    const nomeBate = (s: LancamentoSistema) =>
      !!nomeOfx && nomesSemelhantesFortes(nomeOfx, removerAcentos(s.cliente || '').toLowerCase(), regraGenerica.nomeMinContido ?? 8, regraGenerica.nomeMinSobrenome ?? 5);
    const porNomeParecido = (a: LancamentoSistema, b: LancamentoSistema) => Number(nomeBate(b)) - Number(nomeBate(a));

    const mesmoValorTodos = sistemaFiltradoPorTipo.filter((s) => valoresIguais(Math.abs(s.valor), valorOfxAbs, regraGenerica.toleranciaValor));
    // "Mesma data" é cravado (data idêntica) — a tolerância de dias só decide
    // até quando um candidato de data DIFERENTE ainda aparece na busca (em vez
    // de ficar de fora por completo), nunca "empresta" pra mesma data.
    resp.mesmaData = mesmoValorTodos.filter((s) => dataOfx && s.data === dataOfx).sort(porNomeParecido);
    const outraData = mesmoValorTodos.filter((s) => {
      if (dataOfx && s.data === dataOfx) return false;
      if (!dataOfx || !s.data) return true;
      return diasCorridosEntre(s.data, dataOfx) <= regraGenerica.toleranciaDias;
    });
    // Direção: banco depois do sistema = pago posteriormente (atrasado); banco
    // antes do sistema = pago antecipado. Sem data de um dos lados pra saber a
    // direção, cai no bucket "posteriormente" por padrão (só pra não sumir).
    resp.pagoPosteriormente = outraData.filter((s) => !dataOfx || !s.data || diasComSinalBancoMenosSistema(dataOfx, s.data) > 0).sort(porNomeParecido);
    resp.pagoAntecipado = outraData.filter((s) => dataOfx && s.data && diasComSinalBancoMenosSistema(dataOfx, s.data) < 0).sort(porNomeParecido);
    if (mesmoValorTodos.length > 0) return resp;

    if (!nomeOfx) return resp;
    const candidatosNome = sistemaFiltradoPorTipo.filter(nomeBate);
    resp.mesmoNome = candidatosNome;
    if (candidatosNome.length > 1) {
      const ordenada = [...candidatosNome].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
      const combinacao = combinacaoExata(ordenada, valorOfxAbs, regraGenerica.toleranciaValor);
      if (combinacao && combinacao.length > 1) resp.combinacaoPix = combinacao;
    }
    return resp;
  }

  // ---- BOLETO: título pago dentro da janela de dias úteis (regra), valor exato OU soma de vários títulos ----
  // O extrato do BB traz o boleto recebível (Cobrança) AGREGADO — 1 linha por
  // dia somando todos os títulos liquidados naquele dia — então, diferente
  // do Cartão (Stone já vem 1 linha por venda), aqui a combinação continua
  // sendo o caminho normal, não uma exceção.
  if (tipoOfx === 'BOLETO') {
    const regraBoleto = regras.BOLETO;
    const diasMax = regraBoleto.diasUteisMax ?? 3;
    if (!dataOfx) return resp;

    // Corre pros dois lados: o cliente pode pagar depois OU antes da data
    // registrada no Sistema (recebimento antecipado é normal), então não dá
    // pra exigir só um sentido — mesma ideia do Cartão.
    const candidatos = sistemaFiltradoPorTipo.filter((s) => s.data && dentroDaJanelaUtil(s.data, dataOfx, diasMax));

    // Dentro da janela de dias úteis, mas ainda separa data IDÊNTICA de
    // "dentro da janela mas outra data" — senão um título pago 1 dia útil
    // depois (às vezes 2-3 dias corridos, com fim de semana no meio) aparecia
    // rotulado como "Mesma data" mesmo tendo data visivelmente diferente.
    const dentroDaTolerancia = candidatos.filter((s) => valoresIguais(Math.abs(s.valor), valorOfxAbs, regraBoleto.toleranciaValor));
    if (dentroDaTolerancia.length > 0) {
      resp.mesmaData = dentroDaTolerancia.filter((s) => s.data === dataOfx);
      const outraData = dentroDaTolerancia.filter((s) => s.data !== dataOfx);
      resp.pagoPosteriormente = outraData.filter((s) => diasComSinalBancoMenosSistema(dataOfx, s.data!) > 0);
      resp.pagoAntecipado = outraData.filter((s) => diasComSinalBancoMenosSistema(dataOfx, s.data!) < 0);
      return resp;
    }

    const porData = new Map<string, LancamentoSistema[]>();
    candidatos.forEach((s) => {
      const lista = porData.get(s.data!) ?? [];
      lista.push(s);
      porData.set(s.data!, lista);
    });

    for (const lista of porData.values()) {
      const ordenada = [...lista].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
      const combinacao = combinacaoExata(ordenada, valorOfxAbs, regraBoleto.toleranciaValor);
      if (combinacao && combinacao.length > 1) {
        resp.combinacaoBoleto = combinacao;
        return resp;
      }
    }
    return resp;
  }

  // ---- Demais formas (exceto cartão): mesmo valor (com tolerância da regra), e nome parecido (mesmo mecanismo do PIX) ----
  if (tipoOfx !== 'CARTAO') {
    const regraForma = regras.GENERICA;
    const mesmoValorTodos = sistemaFiltradoPorTipo.filter((s) => valoresIguais(Math.abs(s.valor), valorOfxAbs, regraForma.toleranciaValor));
    resp.mesmaData = mesmoValorTodos.filter((s) => dataOfx && dataComparavelSistema(s, tipoOfx) === dataOfx);
    // Fora da mesma data só entra dentro da tolerância de dias da regra (pra
    // CHEQUE, contada em torno do vencimento) — sem isso, qualquer diferença de
    // data (mesmo anos) aparecia como sugestão. Direção: banco depois do
    // sistema = pago posteriormente (atrasado); antes = pago antecipado.
    const outraData = mesmoValorTodos.filter((s) => {
      const dataComp = dataComparavelSistema(s, tipoOfx);
      if (dataOfx && dataComp === dataOfx) return false;
      if (!dataOfx || !dataComp) return true;
      return diasCorridosEntre(dataComp, dataOfx) <= regraForma.toleranciaDias;
    });
    resp.pagoPosteriormente = outraData.filter((s) => {
      const dataComp = dataComparavelSistema(s, tipoOfx);
      return !dataOfx || !dataComp || diasComSinalBancoMenosSistema(dataOfx, dataComp) > 0;
    });
    resp.pagoAntecipado = outraData.filter((s) => {
      const dataComp = dataComparavelSistema(s, tipoOfx);
      return dataOfx && dataComp && diasComSinalBancoMenosSistema(dataOfx, dataComp) < 0;
    });

    // PIX não-combinado já retornou no bloco próprio acima — só chega aqui
    // combinado, e combinado não compara nome (ver comentário no topo da função).
    if (tipoOfx !== 'PIX' && !combinado) {
      const nomeOfx = normalizarNomeClienteOfx(itemBanco.descricao);
      resp.mesmoNome = sistemaFiltradoPorTipo.filter(
        (s) => !!nomeOfx && nomesSemelhantesFortes(nomeOfx, removerAcentos(s.cliente || '').toLowerCase(), regraForma.nomeMinContido ?? 8, regraForma.nomeMinSobrenome ?? 5),
      );
    }
    return resp;
  }

  // ---- CARTÃO: 1 card só (Débito e Crédito compartilham a regra) — valor
  // dentro da tolerância (usa o valor bruto quando conhecido, Stone; senão o
  // valor líquido direto, BB), dentro da janela de dias úteis. Sem estimativa
  // de taxa por faixa de % (removida — difícil de acertar e obsoleta hoje,
  // Stone já traz o bruto exato). BB praticamente não gera candidato aqui
  // (só "Compra com Cartão", despesa da empresa, sem contraparte no Sistema
  // mesmo) — cai pra conciliação manual, que é o esperado.
  if (!dataOfx) return resp;
  const subtipoOfx = getSubtipoCartaoOfx(itemBanco.descricao);
  if (!subtipoOfx) return resp;

  const regraCartao = regras.CARTAO;
  const diasMax = regraCartao.diasUteisMax ?? 1;

  // Cartão corre pros dois lados (antes ou depois da data), até o máximo de dias úteis.
  const candidatos = sistemaFiltradoPorTipo.filter((s) => {
    if (!s.data) return false;
    if (getSubtipoCartaoSistema(s.formaPagamentoRaw) !== subtipoOfx) return false;
    return dentroDaJanelaUtil(s.data, dataOfx, diasMax);
  });

  const alvo = itemBanco.valorBrutoCartao ?? valorOfxAbs;
  const candidatosComValor = candidatos.filter((s) => valoresIguais(Math.abs(s.valor), alvo, regraCartao.toleranciaValor));

  // Mesmo valor pode ser de VÁRIAS parcelas diferentes (parcelas iguais de
  // vendas parceladas costumam ter o mesmo valor) — a parcela (X/Y) desempata:
  // só entra na lista principal quem bate com a mesma parcela do Banco (ou
  // não tem parcela informada nos dois lados pra comparar); o resto vai pra
  // uma categoria à parte, pro usuário decidir se aceita mesmo assim.
  const parcelaOfx = extrairParcela(itemBanco.descricao);
  resp.parcelaDivergente = candidatosComValor.filter((s) => !parcelaCompativel(parcelaOfx, extrairParcela(s.documento)));
  const compativeis = candidatosComValor.filter((s) => parcelaCompativel(parcelaOfx, extrairParcela(s.documento)));
  // Mesma separação do Boleto: dentro da janela de dias úteis não é a mesma
  // coisa que mesma data — Sexta x Segunda é 1 dia útil de distância, mas são
  // datas visivelmente diferentes.
  resp.mesmaData = compativeis.filter((s) => s.data === dataOfx);
  const outraData = compativeis.filter((s) => s.data !== dataOfx);
  resp.pagoPosteriormente = outraData.filter((s) => diasComSinalBancoMenosSistema(dataOfx, s.data!) > 0);
  resp.pagoAntecipado = outraData.filter((s) => diasComSinalBancoMenosSistema(dataOfx, s.data!) < 0);
  return resp;
}

/**
 * Sugestões de conciliação pra UM lançamento do banco — busca por tag
 * (buscarSugestoesPorTag) e, ao final, acrescenta a rede de segurança de
 * "mesmo valor, recebimento diferente" (não combinado — não faz sentido
 * comparar valor de um item que já é a soma de vários com uma tag alheia).
 */
export function buscarSugestoes(
  itemBanco: LancamentoBanco,
  sistema: LancamentoSistema[],
  regras: RegrasPorForma,
  combinado = false,
  descartes: Set<string> = new Set(),
): SugestoesConciliacao {
  const resp = buscarSugestoesPorTag(itemBanco, sistema, regras, combinado, descartes);
  if (!combinado) {
    const recebimentoDiferente = buscarRecebimentoDiferente(itemBanco, sistema, resp, regras, descartes);
    if (recebimentoDiferente.length > 0) resp.recebimentoDiferente = recebimentoDiferente;
  }
  return resp;
}

/** Resolve a regra aplicável a uma forma de pagamento — reaproveitado na rede de segurança de recebimento diferente. */
function regraDaForma(forma: FormaPagamento, regras: RegrasPorForma): RegraConciliacao {
  if (forma === 'CARTAO') return regras.CARTAO;
  if (forma === 'BOLETO') return regras.BOLETO;
  return regras.GENERICA;
}

/**
 * Testa se duas datas estão dentro da janela de dias da FORMA DE ORIGEM da
 * busca — usado só pela rede de segurança "Forma de recebimento divergente"
 * (buscarRecebimentoDiferente/...Inverso). Antes usava sempre a tolerância
 * do card genérico (30 dias), não importa a forma real — um Cartão (janela
 * de 1 dia útil) buscava recebimentos até 30 dias de distância, trazendo
 * candidato longe demais pra fazer sentido. Cartão/Boleto contam em dias
 * ÚTEIS (mesma unidade da própria janela deles); Genérica conta em dias
 * corridos.
 */
function dentroDaJanelaDaForma(forma: FormaPagamento, regraOrigem: RegraConciliacao, dataA: string, dataB: string): boolean {
  if (forma === 'CARTAO' || forma === 'BOLETO') return dentroDaJanelaUtil(dataA, dataB, regraOrigem.diasUteisMax ?? 3);
  return diasCorridosEntre(dataA, dataB) <= regraOrigem.toleranciaDias;
}

function diasCorridosEntre(dataA: string, dataB: string): number {
  const ms = Math.abs(parseDataISO(dataA).getTime() - parseDataISO(dataB).getTime());
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * Dias corridos entre duas datas, COM sinal: positivo quando `dataBanco` é
 * depois de `dataSistema` (pagamento posterior/atrasado), negativo quando é
 * antes (pagamento antecipado). Usado pra decidir a direção das categorias
 * `pagoPosteriormente`/`pagoAntecipado` (rótulo exibido varia por direção da
 * busca, ver `rotuloCategoria` em types.ts) — a regra de sinal é sempre a
 * mesma (banco depois do sistema = posterior), não importa qual dos dois
 * lados é o item fixo da busca.
 */
function diasComSinalBancoMenosSistema(dataBanco: string, dataSistema: string): number {
  const ms = parseDataISO(dataBanco).getTime() - parseDataISO(dataSistema).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * Rede de segurança: procura por mesmo valor em TODO o Sistema, sem exigir
 * que a tag (forma de pagamento) bata — cobre o caso de um lançamento
 * cadastrado com a forma errada no Sistema (erro de digitação/categorização
 * do usuário), que hoje nunca aparece em nenhuma categoria porque a busca
 * normal já filtra por tag antes de olhar o valor. Só entra aqui quem NÃO
 * ficou em nenhuma categoria anterior (evita duplicar o mesmo candidato em
 * duas listas) — sempre por último, ordenado por data.
 */
function buscarRecebimentoDiferente(
  itemBanco: LancamentoBanco,
  sistema: LancamentoSistema[],
  resp: SugestoesConciliacao,
  regras: RegrasPorForma,
  descartes: Set<string> = new Set(),
): LancamentoSistema[] {
  const regraOrigem = regraDaForma(itemBanco.formaPagamento, regras);
  const alvo = itemBanco.valorBrutoCartao ?? Math.abs(itemBanco.valor);

  const idsJaSugeridos = new Set<string>();
  (Object.keys(resp) as (keyof SugestoesConciliacao)[]).forEach((chave) => resp[chave]?.forEach((item) => idsJaSugeridos.add(item.id)));

  const candidatos = sistema.filter((s) => {
    if (s.desativado || idsJaSugeridos.has(s.id)) return false;
    if (descartes.has(chaveParDescarte(itemBanco.id, s.id))) return false;
    // Mesmo "recebimento diferente" (forma errada) nunca cruza sinal — uma
    // saída (PIX Enviado, valor negativo) nunca é candidato de uma entrada, e
    // vice-versa, senão o valor absoluto igual (comum, ex.: dois PIX de
    // R$600 em sentidos opostos) vira sugestão errada.
    if (itemBanco.valor < 0 && s.valor >= 0) return false;
    if (itemBanco.valor > 0 && s.valor <= 0) return false;
    // "Recebimento diferente" é categoria diferente de verdade (PIX, Boleto,
    // Cheque...) — Cartão com Cartão que só ficou de fora por causa da data
    // ou do subtipo (Débito/Crédito) não é isso, e não deve aparecer aqui.
    if (getCategoriaSistema(s.formaPagamentoRaw) === itemBanco.formaPagamento) return false;
    // A janela de dias é a da PRÓPRIA forma de origem (Cartão busca só ±1 dia útil, Boleto ±3 dias úteis, PIX/Cheque/Outros 30 dias corridos).
    if (!s.data || !dentroDaJanelaDaForma(itemBanco.formaPagamento, regraOrigem, s.data, itemBanco.data)) return false;
    return valoresIguais(Math.abs(s.valor), alvo, regraOrigem.toleranciaValor);
  });
  return [...candidatos].sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''));
}

/**
 * Limite de segurança pro backtracking de combinações — sem isso, um dia com
 * muitos títulos/PIX parecidos faz a busca explorar ~2^n combinações e trava
 * a aba do navegador (percebido como "demora a marcar o checkbox", já que o
 * useMemo de sugestões roda no meio do mesmo render). Atingir o limite conta
 * como "não achou combinação nenhuma" — mais seguro do que arriscar
 * interpretar um resultado parcial como definitivo.
 */
const MAX_NOS_BUSCA_COMBINACAO = 200_000;

/** Backtracking: subconjunto de `lista` cuja soma absoluta bate com `alvo`, dentro da `tolerancia` da regra. Genérico (não só LancamentoSistema) pra dar pra rodar também sobre lançamentos do Banco, na busca invertida. Poda por soma restante (nem tudo que falta alcança o alvo) — sem isso, um dia com muitos títulos parecidos faria a busca explorar ~2^n combinações. */
function combinacaoExata<T extends { valor: number }>(lista: T[], alvo: number, tolerancia: number): T[] | null {
  const valoresAbs = lista.map((item) => Math.abs(item.valor));
  const n = valoresAbs.length;
  const somaRestante = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) somaRestante[i] = somaRestante[i + 1] + valoresAbs[i];

  let nos = 0;
  function backtrack(i: number, soma: number, usados: T[]): T[] | null {
    if (++nos > MAX_NOS_BUSCA_COMBINACAO) return null;
    if (valoresIguais(soma, alvo, tolerancia)) return usados;
    if (i >= n || soma > alvo + tolerancia || soma + somaRestante[i] < alvo - tolerancia) return null;
    const com = backtrack(i + 1, soma + valoresAbs[i], [...usados, lista[i]]);
    if (com) return com;
    return backtrack(i + 1, soma, usados);
  }
  return backtrack(0, 0, []);
}

/**
 * Lançamento sintético representando a SOMA de vários selecionados — usado
 * quando o usuário escolhe buscar sugestões pelo valor total de N itens
 * marcados de uma vez, em vez de cada um isoladamente. Mantém data/forma de
 * pagamento do último selecionado (o mais recente marcado).
 */
export function itemBancoCombinado(itens: LancamentoBanco[]): LancamentoBanco {
  const ultimo = itens[itens.length - 1];
  return {
    ...ultimo,
    valor: itens.reduce((soma, b) => soma + b.valor, 0),
    descricao: itens.map((b) => b.descricao).filter(Boolean).join(' + '),
  };
}

/** Espelho de itemBancoCombinado — usado quando o usuário marca vários lançamentos do Sistema de uma vez (busca invertida) e escolhe buscar pelo valor somado. */
export function itemSistemaCombinado(itens: LancamentoSistema[]): LancamentoSistema {
  const ultimo = itens[itens.length - 1];
  return {
    ...ultimo,
    valor: itens.reduce((soma, s) => soma + s.valor, 0),
    cliente: itens.map((s) => s.cliente).filter(Boolean).join(' + '),
  };
}

/**
 * Sugestões de conciliação pra UM lançamento do SISTEMA — espelho de
 * buscarSugestoes(), mas buscando candidatos no BANCO (OFX) em vez do
 * Sistema. A comparação é a mesma (tolerância de valor, janela de dias,
 * nome), só invertendo quem é o lado fixo e a direção de data/valor onde há
 * assimetria (cartão, boleto).
 *
 * `combinado`: mesmo motivo de buscarSugestoes — quando `itemSistema` é a
 * soma de vários selecionados juntos, ignora "nome parecido" e busca só por valor.
 */
function buscarSugestoesInversoPorTag(
  itemSistema: LancamentoSistema,
  banco: LancamentoBanco[],
  regras: RegrasPorForma,
  combinado = false,
  descartes: Set<string> = new Set(),
): SugestoesConciliacaoInversa {
  const tipoSistema = getCategoriaSistema(itemSistema.formaPagamentoRaw);
  const valorSisAbs = Math.abs(itemSistema.valor);
  const dataSis = dataComparavelSistema(itemSistema, tipoSistema) || null;

  // Mesmo motivo de buscarSugestoes: não exclui já conciliado, só desativado
  // — mostra sinalizado (pode ter sido uma conciliação errada) em vez de
  // esconder.
  const bancoFiltradoPorTipo = banco.filter((b) => {
    if (b.desativado) return false;
    if (descartes.has(chaveParDescarte(b.id, itemSistema.id))) return false;
    if (b.formaPagamento !== tipoSistema) return false;
    const vSis = itemSistema.valor;
    const vBanco = b.valor;
    if (vSis < 0 && vBanco >= 0) return false;
    if (vSis > 0 && vBanco <= 0) return false;
    return true;
  });

  const resp: SugestoesConciliacaoInversa = {};
  const nomeSis = removerAcentos(itemSistema.cliente || '').toLowerCase() || null;

  // ---- PIX: valor exato primeiro; se não bater, procura OFX com nome
  // parecido — e, só entre esses, tenta achar uma soma que bata com o valor
  // (mesmo motivo do sentido Banco→Sistema: nunca soma nomes diferentes). ----
  if (tipoSistema === 'PIX' && !combinado) {
    const regraGenerica = regras.GENERICA;
    // Mesmo desempate do sentido Banco→Sistema: candidato de nome parecido
    // com o do Sistema vem primeiro dentro de cada categoria de mesmo valor.
    const nomeBate = (b: LancamentoBanco) => {
      if (!nomeSis) return false;
      const nomeB = normalizarNomeClienteOfx(b.descricao);
      return nomeB ? nomesSemelhantesFortes(nomeB, nomeSis, regraGenerica.nomeMinContido ?? 8, regraGenerica.nomeMinSobrenome ?? 5) : false;
    };
    const porNomeParecido = (a: LancamentoBanco, b: LancamentoBanco) => Number(nomeBate(b)) - Number(nomeBate(a));

    const mesmoValorTodos = bancoFiltradoPorTipo.filter((b) => valoresIguais(Math.abs(b.valor), valorSisAbs, regraGenerica.toleranciaValor));
    // "Mesma data" é cravado (data idêntica) — a tolerância de dias só decide
    // até quando um candidato de data DIFERENTE ainda aparece na busca (em vez
    // de ficar de fora por completo), nunca "empresta" pra mesma data.
    resp.mesmaData = mesmoValorTodos.filter((b) => dataSis && b.data === dataSis).sort(porNomeParecido);
    const outraData = mesmoValorTodos.filter((b) => {
      if (dataSis && b.data === dataSis) return false;
      if (!dataSis || !b.data) return true;
      return diasCorridosEntre(b.data, dataSis) <= regraGenerica.toleranciaDias;
    });
    // Direção sempre a mesma, não importa qual lado é o fixo: banco depois do
    // sistema = pago posteriormente; banco antes do sistema = pago antecipado.
    resp.pagoPosteriormente = outraData.filter((b) => !dataSis || !b.data || diasComSinalBancoMenosSistema(b.data, dataSis) > 0).sort(porNomeParecido);
    resp.pagoAntecipado = outraData.filter((b) => dataSis && b.data && diasComSinalBancoMenosSistema(b.data, dataSis) < 0).sort(porNomeParecido);
    if (mesmoValorTodos.length > 0) return resp;

    if (!nomeSis) return resp;
    const candidatosNome = bancoFiltradoPorTipo.filter(nomeBate);
    resp.mesmoNome = candidatosNome;
    if (candidatosNome.length > 1) {
      const ordenada = [...candidatosNome].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
      const combinacao = combinacaoExata(ordenada, valorSisAbs, regraGenerica.toleranciaValor);
      if (combinacao && combinacao.length > 1) resp.combinacaoPix = combinacao;
    }
    return resp;
  }

  // ---- BOLETO: OFX pago dentro da janela de dias úteis (nos dois sentidos — recebimento antecipado é normal), valor exato OU soma de vários lançamentos do banco ----
  if (tipoSistema === 'BOLETO') {
    const regraBoleto = regras.BOLETO;
    const diasMax = regraBoleto.diasUteisMax ?? 3;
    if (!dataSis) return resp;

    const candidatos = bancoFiltradoPorTipo.filter((b) => dentroDaJanelaUtil(dataSis, b.data, diasMax));

    // Mesma separação do sentido Banco→Sistema: dentro da janela não é o
    // mesmo que mesma data.
    const dentroDaTolerancia = candidatos.filter((b) => valoresIguais(Math.abs(b.valor), valorSisAbs, regraBoleto.toleranciaValor));
    if (dentroDaTolerancia.length > 0) {
      resp.mesmaData = dentroDaTolerancia.filter((b) => b.data === dataSis);
      const outraData = dentroDaTolerancia.filter((b) => b.data !== dataSis);
      resp.pagoPosteriormente = outraData.filter((b) => diasComSinalBancoMenosSistema(b.data, dataSis) > 0);
      resp.pagoAntecipado = outraData.filter((b) => diasComSinalBancoMenosSistema(b.data, dataSis) < 0);
      return resp;
    }

    const porData = new Map<string, LancamentoBanco[]>();
    candidatos.forEach((b) => {
      const lista = porData.get(b.data) ?? [];
      lista.push(b);
      porData.set(b.data, lista);
    });

    for (const lista of porData.values()) {
      const ordenada = [...lista].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
      const combinacao = combinacaoExata(ordenada, valorSisAbs, regraBoleto.toleranciaValor);
      if (combinacao && combinacao.length > 1) {
        resp.combinacaoBoleto = combinacao;
        return resp;
      }
    }
    return resp;
  }

  // ---- Demais formas (exceto cartão): mesmo valor (com tolerância da regra), e nome parecido (mesmo mecanismo do PIX) ----
  if (tipoSistema !== 'CARTAO') {
    const regraForma = regras.GENERICA;
    const mesmoValorTodos = bancoFiltradoPorTipo.filter((b) => valoresIguais(Math.abs(b.valor), valorSisAbs, regraForma.toleranciaValor));
    resp.mesmaData = mesmoValorTodos.filter((b) => dataSis && b.data === dataSis);
    // "Outra data" só entra dentro da tolerância de busca da regra (dataSis já
    // é o vencimento pra CHEQUE — ver definição acima). Mesma direção sempre:
    // banco depois do sistema = pago posteriormente; antes = pago antecipado.
    const outraData = mesmoValorTodos.filter((b) => {
      if (dataSis && b.data === dataSis) return false;
      if (!dataSis || !b.data) return true;
      return diasCorridosEntre(b.data, dataSis) <= regraForma.toleranciaDias;
    });
    resp.pagoPosteriormente = outraData.filter((b) => !dataSis || !b.data || diasComSinalBancoMenosSistema(b.data, dataSis) > 0);
    resp.pagoAntecipado = outraData.filter((b) => dataSis && b.data && diasComSinalBancoMenosSistema(b.data, dataSis) < 0);

    if (tipoSistema !== 'PIX' && !combinado) {
      resp.mesmoNome = bancoFiltradoPorTipo.filter((b) => {
        const nomeB = normalizarNomeClienteOfx(b.descricao);
        return !!nomeB && nomesSemelhantesFortes(nomeB, nomeSis, regraForma.nomeMinContido ?? 8, regraForma.nomeMinSobrenome ?? 5);
      });
    }
    return resp;
  }

  // ---- CARTÃO invertido: 1 card só (Débito e Crédito) — mesmo mecanismo de valor+dias, só invertendo quem é o lado fixo ----
  if (!dataSis) return resp;
  const subtipoSistema = getSubtipoCartaoSistema(itemSistema.formaPagamentoRaw);
  if (!subtipoSistema) return resp;

  const regraCartao = regras.CARTAO;
  const diasMax = regraCartao.diasUteisMax ?? 1;

  // Cartão corre pros dois lados (antes ou depois da data), até o máximo de dias úteis.
  const candidatos = bancoFiltradoPorTipo.filter((b) => {
    if (getSubtipoCartaoOfx(b.descricao) !== subtipoSistema) return false;
    return dentroDaJanelaUtil(dataSis, b.data, diasMax);
  });

  const candidatosComValor = candidatos.filter((b) => valoresIguais(b.valorBrutoCartao ?? Math.abs(b.valor), valorSisAbs, regraCartao.toleranciaValor));

  const parcelaSis = extrairParcela(itemSistema.documento);
  resp.parcelaDivergente = candidatosComValor.filter((b) => !parcelaCompativel(parcelaSis, extrairParcela(b.descricao)));
  const compativeis = candidatosComValor.filter((b) => parcelaCompativel(parcelaSis, extrairParcela(b.descricao)));
  resp.mesmaData = compativeis.filter((b) => b.data === dataSis);
  const outraData = compativeis.filter((b) => b.data !== dataSis);
  resp.pagoPosteriormente = outraData.filter((b) => diasComSinalBancoMenosSistema(b.data, dataSis) > 0);
  resp.pagoAntecipado = outraData.filter((b) => diasComSinalBancoMenosSistema(b.data, dataSis) < 0);
  return resp;
}

/** Espelho de buscarRecebimentoDiferente pro sentido invertido (Sistema fixo, candidatos vêm do Banco). */
function buscarRecebimentoDiferenteInverso(
  itemSistema: LancamentoSistema,
  banco: LancamentoBanco[],
  resp: SugestoesConciliacaoInversa,
  regras: RegrasPorForma,
  descartes: Set<string> = new Set(),
): LancamentoBanco[] {
  if (!itemSistema.data) return [];
  const dataSis = itemSistema.data;
  const categoriaSis = getCategoriaSistema(itemSistema.formaPagamentoRaw);
  const regraOrigem = regraDaForma(categoriaSis, regras);
  const alvo = Math.abs(itemSistema.valor);

  const idsJaSugeridos = new Set<string>();
  (Object.keys(resp) as (keyof SugestoesConciliacaoInversa)[]).forEach((chave) => resp[chave]?.forEach((item) => idsJaSugeridos.add(item.id)));

  const candidatos = banco.filter((b) => {
    if (b.desativado || idsJaSugeridos.has(b.id)) return false;
    if (descartes.has(chaveParDescarte(b.id, itemSistema.id))) return false;
    // Mesmo motivo do sentido Banco→Sistema: "recebimento diferente" nunca
    // cruza sinal (entrada nunca casa com saída, só por valor absoluto igual).
    if (itemSistema.valor < 0 && b.valor >= 0) return false;
    if (itemSistema.valor > 0 && b.valor <= 0) return false;
    if (b.formaPagamento === categoriaSis) return false;
    // A janela de dias é a da PRÓPRIA forma de origem (ver dentroDaJanelaDaForma).
    if (!dentroDaJanelaDaForma(categoriaSis, regraOrigem, b.data, dataSis)) return false;
    const valorComparavel = b.valorBrutoCartao ?? Math.abs(b.valor);
    return valoresIguais(valorComparavel, alvo, regraOrigem.toleranciaValor);
  });
  return [...candidatos].sort((a, b) => a.data.localeCompare(b.data));
}

/** Espelho de buscarSugestoes pro sentido invertido (Sistema → Banco). */
export function buscarSugestoesInverso(
  itemSistema: LancamentoSistema,
  banco: LancamentoBanco[],
  regras: RegrasPorForma,
  combinado = false,
  descartes: Set<string> = new Set(),
): SugestoesConciliacaoInversa {
  const resp = buscarSugestoesInversoPorTag(itemSistema, banco, regras, combinado, descartes);
  if (!combinado) {
    const recebimentoDiferente = buscarRecebimentoDiferenteInverso(itemSistema, banco, resp, regras, descartes);
    if (recebimentoDiferente.length > 0) resp.recebimentoDiferente = recebimentoDiferente;
  }
  return resp;
}

export interface GrupoParaConciliar {
  bancoIds: string[];
  sistemaIds: string[];
}

/**
 * Conciliação 100% automática — porte de conciliacaoAutomatica(). Mais
 * conservadora que buscarSugestoes(): só liga automaticamente quando existe
 * exatamente UM candidato sem ambiguidade. Nunca exige NF (a pré-conciliação
 * já cobre lançamentos sem NF, de forma mais simples e visível). Casos
 * ambíguos ficam pra conciliação manual, guiada pelas sugestões de
 * buscarSugestoes().
 */
export async function conciliacaoAutomatica(
  banco: LancamentoBanco[],
  sistema: LancamentoSistema[],
  regras: RegrasPorForma,
  onProgresso?: (feitos: number, total: number) => void,
  descartes: Set<string> = new Set(),
): Promise<GrupoParaConciliar[]> {
  const grupos: GrupoParaConciliar[] = [];
  const sistemaJaUsado = new Set<string>();

  // Pré-computa categoria e nome normalizado de cada lançamento do Sistema
  // UMA VEZ só, antes do loop — sem isso, cada lançamento pendente do Banco
  // (podem ser centenas) recalculava a categoria (normalização de string,
  // Unicode) e a comparação de nome pra TODOS os milhares de registros do
  // Sistema, do zero, travando a aba por vários segundos/minutos.
  const sistemaPorCategoria = new Map<string, LancamentoSistema[]>();
  const nomeNormalizadoPorId = new Map<string, string>();
  for (const s of sistema) {
    const categoria = getCategoriaSistema(s.formaPagamentoRaw);
    const lista = sistemaPorCategoria.get(categoria) ?? [];
    lista.push(s);
    sistemaPorCategoria.set(categoria, lista);
    nomeNormalizadoPorId.set(s.id, removerAcentos(s.cliente || '').toLowerCase());
  }

  const ofxPendentes = banco.filter((b) => !b.conciliado && !b.desativado);

  for (let i = 0; i < ofxPendentes.length; i++) {
    // Cede o controle pro navegador a cada lote — sem isso, mesmo já rápido,
    // a thread principal fica presa do início ao fim e a aba parece travada
    // (o Chrome chega a avisar "página sem resposta"). Também é o que deixa
    // a barra de progresso atualizar de verdade, em vez de pular de 0% a 100%.
    if (i % 25 === 0) {
      onProgresso?.(i, ofxPendentes.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const ofx = ofxPendentes[i];
    const tipo = ofx.formaPagamento;
    const valorOfxAbs = Math.abs(ofx.valor);
    const dataOfx = ofx.data;
    if (!dataOfx) continue;

    // Boleto tem regra própria (janela de dias úteis, igual às sugestões) —
    // trata à parte, antes do "balaio genérico" de PIX/Cheque/etc., que só
    // considera mesma data.
    if (tipo === 'BOLETO') {
      const regraBoleto = regras.BOLETO;
      const diasMax = regraBoleto.diasUteisMax ?? 3;

      const candidatosBoleto = (sistemaPorCategoria.get('BOLETO') ?? []).filter((s) => {
        if (s.conciliado || s.desativado || sistemaJaUsado.has(s.id)) return false;
        if (descartes.has(chaveParDescarte(ofx.id, s.id))) return false;
        if (!s.data) return false;
        if (Math.sign(s.valor) !== Math.sign(ofx.valor)) return false;
        return dentroDaJanelaUtil(s.data, dataOfx, diasMax);
      });

      const valorExato = candidatosBoleto.filter((s) => valoresIguais(Math.abs(s.valor), valorOfxAbs, regraBoleto.toleranciaValor));
      if (valorExato.length === 1) {
        grupos.push({ bancoIds: [ofx.id], sistemaIds: [valorExato[0].id] });
        sistemaJaUsado.add(valorExato[0].id);
        continue;
      }
      if (valorExato.length > 1) continue; // ambíguo — fica pra conciliação manual

      // Nenhum título sozinho bate — tenta combinação (soma de vários), já
      // que o BB traz o boleto recebível agregado (1 linha por dia). Só
      // concilia se existir exatamente 1 combinação válida (sem ambiguidade).
      const porDataBoleto = new Map<string, LancamentoSistema[]>();
      candidatosBoleto.forEach((s) => {
        const lista = porDataBoleto.get(s.data!) ?? [];
        lista.push(s);
        porDataBoleto.set(s.data!, lista);
      });

      const combinacoesValidasBoleto: LancamentoSistema[][] = [];
      for (const lista of porDataBoleto.values()) {
        const ordenada = [...lista].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
        combinacoesTodasExatas(ordenada, valorOfxAbs, regraBoleto.toleranciaValor).forEach((c) => combinacoesValidasBoleto.push(c));
      }

      if (combinacoesValidasBoleto.length === 1) {
        const ids = combinacoesValidasBoleto[0].map((s) => s.id);
        grupos.push({ bancoIds: [ofx.id], sistemaIds: ids });
        ids.forEach((id) => sistemaJaUsado.add(id));
      }
      continue;
    }

    // PIX: se não bater sozinho, tenta somar — mas só entre os candidatos de
    // NOME parecido (nunca com PIX de clientes diferentes, mesmo que a soma
    // bata por coincidência de valor — valores "redondos" tipo 60+840=900
    // aparecem fácil entre PIX de gente diferente).
    if (tipo === 'PIX') {
      const regraGenerica = regras.GENERICA;
      const candidatosPix = (sistemaPorCategoria.get('PIX') ?? []).filter((s) => {
        if (s.conciliado || s.desativado || sistemaJaUsado.has(s.id)) return false;
        if (descartes.has(chaveParDescarte(ofx.id, s.id))) return false;
        if (!s.data) return false;
        if (Math.sign(s.valor) !== Math.sign(ofx.valor)) return false;
        return true;
      });

      const valorExato = candidatosPix.filter((s) => s.data === dataOfx && valoresIguais(Math.abs(s.valor), valorOfxAbs, regraGenerica.toleranciaValor));
      if (valorExato.length === 1) {
        grupos.push({ bancoIds: [ofx.id], sistemaIds: [valorExato[0].id] });
        sistemaJaUsado.add(valorExato[0].id);
        continue;
      }
      if (valorExato.length > 1) continue; // ambíguo — fica pra conciliação manual

      const nomeOfx = normalizarNomeClienteOfx(ofx.descricao);
      if (!nomeOfx) continue;
      const candidatosNome = candidatosPix.filter((s) =>
        nomesSemelhantesFortes(nomeOfx, nomeNormalizadoPorId.get(s.id) ?? '', regraGenerica.nomeMinContido ?? 8, regraGenerica.nomeMinSobrenome ?? 5),
      );

      const porDataPix = new Map<string, LancamentoSistema[]>();
      candidatosNome.forEach((s) => {
        const lista = porDataPix.get(s.data!) ?? [];
        lista.push(s);
        porDataPix.set(s.data!, lista);
      });

      const combinacoesValidasPix: LancamentoSistema[][] = [];
      for (const lista of porDataPix.values()) {
        const ordenada = [...lista].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
        combinacoesTodasExatas(ordenada, valorOfxAbs, regraGenerica.toleranciaValor).forEach((c) => combinacoesValidasPix.push(c));
      }

      if (combinacoesValidasPix.length === 1) {
        const ids = combinacoesValidasPix[0].map((s) => s.id);
        grupos.push({ bancoIds: [ofx.id], sistemaIds: ids });
        ids.forEach((id) => sistemaJaUsado.add(id));
      }
      continue;
    }

    if (tipo !== 'CARTAO') {
      const regraForma = regras.GENERICA;
      const candidatosValidos = (sistemaPorCategoria.get(tipo) ?? []).filter((s) => {
        if (s.conciliado || s.desativado || sistemaJaUsado.has(s.id)) return false;
        if (descartes.has(chaveParDescarte(ofx.id, s.id))) return false;
        const dataComparavel = dataComparavelSistema(s, tipo);
        if (!dataComparavel) return false;
        if (Math.sign(s.valor) !== Math.sign(ofx.valor)) return false;
        return dataComparavel === dataOfx && valoresIguais(Math.abs(s.valor), valorOfxAbs, regraForma.toleranciaValor);
      });
      if (candidatosValidos.length === 1) {
        grupos.push({ bancoIds: [ofx.id], sistemaIds: [candidatosValidos[0].id] });
        sistemaJaUsado.add(candidatosValidos[0].id);
      }
      continue;
    }

    const subtipoOfx = getSubtipoCartaoOfx(ofx.descricao);
    if (!subtipoOfx) continue;
    const regraCartao = regras.CARTAO;
    const diasMax = regraCartao.diasUteisMax ?? 1;

    const candidatosBase = (sistemaPorCategoria.get('CARTAO') ?? []).filter((s) => {
      if (s.conciliado || s.desativado || sistemaJaUsado.has(s.id)) return false;
      if (descartes.has(chaveParDescarte(ofx.id, s.id))) return false;
      if (!s.data) return false;
      if (Math.sign(s.valor) !== Math.sign(ofx.valor)) return false;
      return true;
    });

    // Cartão: 1 candidato só, sem ambiguidade — usa o bruto quando conhecido
    // (Stone), senão o valor líquido direto (BB, raro chegar aqui de verdade).
    // Não soma mais vários lançamentos do Sistema pra fechar sozinho — o
    // arquivo (Stone) já traz 1 lançamento por venda, então cada recebimento
    // do banco corresponde a UMA venda só, nunca a uma combinação.
    const alvo = ofx.valorBrutoCartao ?? valorOfxAbs;
    const parcelaOfx = extrairParcela(ofx.descricao);
    // Cartão corre pros dois lados (antes ou depois da data), até o máximo de dias úteis.
    const candidatosJanela = candidatosBase.filter((s) => {
      if (getSubtipoCartaoSistema(s.formaPagamentoRaw) !== subtipoOfx) return false;
      return dentroDaJanelaUtil(s.data!, dataOfx, diasMax);
    });

    const valorExato = candidatosJanela.filter((s) => valoresIguais(Math.abs(s.valor), alvo, regraCartao.toleranciaValor));
    // Parcelas iguais de uma venda parcelada costumam ter o mesmo valor —
    // a automática só fecha sozinha quando a parcela (X/Y) também bate
    // (ou não dá pra saber, de um dos dois lados), nunca só pelo valor.
    const valorExatoMesmaParcela = valorExato.filter((s) => parcelaCompativel(parcelaOfx, extrairParcela(s.documento)));
    if (valorExatoMesmaParcela.length === 1) {
      grupos.push({ bancoIds: [ofx.id], sistemaIds: [valorExatoMesmaParcela[0].id] });
      sistemaJaUsado.add(valorExatoMesmaParcela[0].id);
    }
  }

  onProgresso?.(ofxPendentes.length, ofxPendentes.length);
  return grupos;
}

/** Todas as combinações (não só a primeira) cuja soma bate exatamente com o alvo (dentro da tolerância) — usado só na conciliação automática de Boleto, pra exigir ausência de ambiguidade. Poda por soma restante e desiste assim que acha a 2ª combinação válida (só precisa saber que já é ambíguo). Mesmo limite de segurança de nós que combinacaoExata. */
function combinacoesTodasExatas(lista: LancamentoSistema[], alvo: number, tolerancia: number): LancamentoSistema[][] {
  const valoresAbs = lista.map((s) => Math.abs(s.valor));
  const n = valoresAbs.length;
  const somaRestante = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) somaRestante[i] = somaRestante[i + 1] + valoresAbs[i];

  const validas: LancamentoSistema[][] = [];
  let nos = 0;
  let interrompida = false;

  function backtrack(i: number, soma: number, usados: LancamentoSistema[]) {
    if (validas.length > 1 || interrompida) return;
    if (++nos > MAX_NOS_BUSCA_COMBINACAO) {
      interrompida = true;
      return;
    }
    if (usados.length > 1 && valoresIguais(soma, alvo, tolerancia)) validas.push(usados);
    if (validas.length > 1 || i >= n || soma > alvo + tolerancia || soma + somaRestante[i] < alvo - tolerancia) return;
    backtrack(i + 1, soma + valoresAbs[i], [...usados, lista[i]]);
    backtrack(i + 1, soma, usados);
  }

  backtrack(0, 0, []);
  return interrompida ? [] : validas;
}

/**
 * Reclassifica, a partir dos dados já persistidos (valor, data, parcela,
 * nome), qual categoria de sugestão bateu numa conciliação já feita — usado
 * só pra MOSTRAR essa informação no registro conciliado do Banco, não
 * influencia a conciliação em si. Como usa as regras ATUAIS (tolerância,
 * nome), o rótulo pode mudar se a regra for editada depois da conciliação —
 * é só informativo, não fica "congelado" no momento em que a conciliação
 * aconteceu (diferente do aviso de divergência, que é gravado).
 */
export function classificarCriterioConciliado(
  itensBanco: LancamentoBanco[],
  itensSistema: LancamentoSistema[],
  regras: RegrasPorForma,
  rotulos: Partial<Record<ChaveRotuloCategoria, string>> = {},
): string {
  if (itensBanco.length === 0) return '—';
  const itemBanco = itensBanco[0];
  if (itemBanco.origem === 'manual') return 'Lançamento manual (sem contraparte real no Banco)';
  if (itensSistema.length === 0) return '—';

  if (itensBanco.length > 1 || itensSistema.length > 1) {
    return rotuloCategoria(itemBanco.formaPagamento === 'PIX' ? 'combinacaoPix' : 'combinacaoBoleto', 'banco', rotulos);
  }

  const s = itensSistema[0];
  const tipo = itemBanco.formaPagamento;
  const dataComp = dataComparavelSistema(s, tipo);
  const mesmaData = !!itemBanco.data && dataComp === itemBanco.data;
  const valorBancoAbs = Math.abs(itemBanco.valor);
  const valorSisAbs = Math.abs(s.valor);

  // Boleto e Cartão já são "casados" pela própria janela de dias úteis —
  // tudo que bate cai em "Mesma data", nunca posterior/antecipado (ver mesma
  // regra em buscarSugestoesPorTag).
  if (tipo === 'CARTAO') {
    const alvo = itemBanco.valorBrutoCartao ?? valorBancoAbs;
    if (!valoresIguais(valorSisAbs, alvo, regras.CARTAO.toleranciaValor)) return 'Conciliado manualmente';
    const parcelaOfx = extrairParcela(itemBanco.descricao);
    const parcelaSis = extrairParcela(s.documento);
    if (!parcelaCompativel(parcelaOfx, parcelaSis)) return rotuloCategoria('parcelaDivergente', 'banco', rotulos);
    return rotuloCategoria('mesmaData', 'banco', rotulos);
  }

  if (tipo === 'BOLETO') {
    if (valoresIguais(valorSisAbs, valorBancoAbs, regras.BOLETO.toleranciaValor)) return rotuloCategoria('mesmaData', 'banco', rotulos);
    return 'Conciliado manualmente';
  }

  // Direção sempre a mesma: banco depois do sistema = pago posteriormente; antes = pago antecipado.
  const rotuloPorData = () => {
    if (mesmaData) return rotuloCategoria('mesmaData', 'banco', rotulos);
    if (!itemBanco.data || !dataComp) return rotuloCategoria('mesmaData', 'banco', rotulos);
    return rotuloCategoria(itemBanco.data > dataComp ? 'pagoPosteriormente' : 'pagoAntecipado', 'banco', rotulos);
  };

  const regraGenerica = regras.GENERICA;
  if (tipo === 'PIX') {
    if (valoresIguais(valorSisAbs, valorBancoAbs, regraGenerica.toleranciaValor)) return rotuloPorData();
    const nomeOfx = normalizarNomeClienteOfx(itemBanco.descricao);
    if (nomeOfx && nomesSemelhantesFortes(nomeOfx, removerAcentos(s.cliente || '').toLowerCase(), regraGenerica.nomeMinContido ?? 8, regraGenerica.nomeMinSobrenome ?? 5)) {
      return rotuloCategoria('mesmoNome', 'banco', rotulos);
    }
    return 'Conciliado manualmente';
  }

  if (valoresIguais(valorSisAbs, valorBancoAbs, regraGenerica.toleranciaValor)) return rotuloPorData();
  return 'Conciliado manualmente';
}
