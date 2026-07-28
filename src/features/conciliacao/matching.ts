import type { FormaRegra, RegraConciliacao } from './regras';
import type { FormaPagamento, LancamentoBanco, LancamentoSistema, SugestoesConciliacao, SugestoesConciliacaoInversa } from './types';
import {
  diasUteisAte,
  diffDiasUteis,
  extrairParcela,
  getCategoriaSistema,
  getSubtipoCartaoOfx,
  getSubtipoCartaoSistema,
  nomesSemelhantesFortes,
  normalizarNomeClienteOfx,
  parcelaCompativel,
  removerAcentos,
  valoresExatamenteIguais,
  valoresIguais,
} from './utils';

type RegrasPorForma = Record<FormaRegra, RegraConciliacao>;

/** Regra usada apenas por RENDIMENTO/OUTRO — essas duas formas não são parametrizáveis hoje (fora da lista pedida), mantém o comportamento antigo de igualdade exata. */
const REGRA_GENERICA_SEM_PARAMETRIZACAO: RegraConciliacao = {
  formaPagamento: 'CHEQUE',
  toleranciaValor: 0,
  diasUteisMin: null,
  diasUteisMax: null,
  taxaMinPercentual: null,
  taxaMaxPercentual: null,
  nomeMinContido: null,
  nomeMinSobrenome: null,
  exigirNfAutomatica: true,
};

function regraParaFormaGenerica(tipo: Exclude<FormaPagamento, 'CARTAO' | 'BOLETO'>, regras: RegrasPorForma): RegraConciliacao {
  if (tipo === 'PIX') return regras.PIX;
  if (tipo === 'CHEQUE') return regras.CHEQUE;
  return REGRA_GENERICA_SEM_PARAMETRIZACAO;
}

function regraParaCartao(subtipo: 'DEBITO' | 'CREDITO', regras: RegrasPorForma): RegraConciliacao {
  return subtipo === 'DEBITO' ? regras.CARTAO_DEBITO : regras.CARTAO_CREDITO;
}

/**
 * Sugestões de conciliação pra UM lançamento do banco — porte de
 * buscarSugestoes() do conciliacao.js. Cada categoria é checada em ordem de
 * prioridade e a função retorna assim que encontra uma correspondência boa
 * o bastante (ex.: PIX com nome idêntico não continua checando "mesmo valor").
 *
 * Todos os limites numéricos (tolerância de valor, dias úteis, faixa de
 * taxa de cartão, tamanho mínimo de nome) vêm de `regras` — parametrizável
 * no modal de Regras de Conciliação, em vez de fixos no código.
 *
 * `combinado` indica que `itemBanco` é a SOMA de vários lançamentos
 * selecionados juntos (mesma grade) — nesse caso o nome já não diz nada
 * (é a concatenação de descrições de origens diferentes), então a busca
 * ignora "nome parecido" e vale só o valor: só sugere se a soma bater com
 * algum valor do sistema.
 */
export function buscarSugestoes(itemBanco: LancamentoBanco, sistema: LancamentoSistema[], regras: RegrasPorForma, combinado = false): SugestoesConciliacao {
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
    const regraPix = regras.PIX;
    const mesmoValorTodos = sistemaFiltradoPorTipo.filter((s) => valoresIguais(Math.abs(s.valor), valorOfxAbs, regraPix.toleranciaValor));
    const mesmaData = mesmoValorTodos.filter((s) => dataOfx && s.data === dataOfx);
    const outraData = mesmoValorTodos.filter((s) => !dataOfx || s.data !== dataOfx);
    resp.mesmoValorMesmaData = mesmaData.filter((s) => valoresExatamenteIguais(Math.abs(s.valor), valorOfxAbs));
    resp.valorAproximadoMesmaData = mesmaData.filter((s) => !valoresExatamenteIguais(Math.abs(s.valor), valorOfxAbs));
    resp.mesmoValorOutraData = outraData.filter((s) => valoresExatamenteIguais(Math.abs(s.valor), valorOfxAbs));
    resp.valorAproximadoOutraData = outraData.filter((s) => !valoresExatamenteIguais(Math.abs(s.valor), valorOfxAbs));
    if (mesmoValorTodos.length > 0) return resp;

    const nomeOfx = normalizarNomeClienteOfx(itemBanco.descricao);
    if (!nomeOfx) return resp;
    const candidatosNome = sistemaFiltradoPorTipo.filter((s) =>
      nomesSemelhantesFortes(nomeOfx, removerAcentos(s.cliente || '').toLowerCase(), regraPix.nomeMinContido ?? 8, regraPix.nomeMinSobrenome ?? 5),
    );
    resp.mesmoNome = candidatosNome;
    if (candidatosNome.length > 1) {
      const ordenada = [...candidatosNome].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
      const combinacao = combinacaoExata(ordenada, valorOfxAbs, regraPix.toleranciaValor);
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
    const diasMin = regraBoleto.diasUteisMin ?? 2;
    const diasMax = regraBoleto.diasUteisMax ?? 3;
    if (!dataOfx) return resp;
    const dataOfxDate = new Date(dataOfx);

    const candidatos = sistemaFiltradoPorTipo.filter((s) => {
      if (!s.data) return false;
      const dataSys = new Date(s.data);
      if (dataSys >= dataOfxDate) return false;
      const diasUteis = diasUteisAte(dataSys, dataOfxDate, diasMax);
      return diasUteis >= diasMin && diasUteis <= diasMax;
    });

    const dentroDaTolerancia = candidatos.filter((s) => valoresIguais(Math.abs(s.valor), valorOfxAbs, regraBoleto.toleranciaValor));
    if (dentroDaTolerancia.length > 0) {
      resp.mesmoValorMesmaData = dentroDaTolerancia.filter((s) => valoresExatamenteIguais(Math.abs(s.valor), valorOfxAbs));
      resp.valorAproximadoMesmaData = dentroDaTolerancia.filter((s) => !valoresExatamenteIguais(Math.abs(s.valor), valorOfxAbs));
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

  // ---- Demais formas (exceto cartão): mesmo valor (com tolerância da regra), e nome com 2+ palavras em comum ----
  if (tipoOfx !== 'CARTAO') {
    const regraForma = regraParaFormaGenerica(tipoOfx, regras);
    const mesmoValorTodos = sistemaFiltradoPorTipo.filter((s) => valoresIguais(Math.abs(s.valor), valorOfxAbs, regraForma.toleranciaValor));
    const mesmaData = mesmoValorTodos.filter((s) => dataOfx && s.data === dataOfx);
    const outraData = mesmoValorTodos.filter((s) => !dataOfx || s.data !== dataOfx);
    resp.mesmoValorMesmaData = mesmaData.filter((s) => valoresExatamenteIguais(Math.abs(s.valor), valorOfxAbs));
    resp.valorAproximadoMesmaData = mesmaData.filter((s) => !valoresExatamenteIguais(Math.abs(s.valor), valorOfxAbs));
    resp.mesmoValorOutraData = outraData.filter((s) => valoresExatamenteIguais(Math.abs(s.valor), valorOfxAbs));
    resp.valorAproximadoOutraData = outraData.filter((s) => !valoresExatamenteIguais(Math.abs(s.valor), valorOfxAbs));

    // PIX não-combinado já retornou no bloco próprio acima (com seu mesmoNome
    // mais preciso) — só chega aqui combinado, e combinado não compara nome
    // (ver comentário no topo da função).
    if (tipoOfx !== 'PIX' && !combinado) {
      const nomeOfx = normalizarNomeClienteOfx(itemBanco.descricao);
      resp.mesmoNome = sistemaFiltradoPorTipo.filter((s) => {
        const nomeSys = removerAcentos(s.cliente || '').toLowerCase();
        if (!nomeOfx || !nomeSys) return false;
        const partesOfx = nomeOfx.split(' ').filter((p) => p.length >= 4);
        if (partesOfx.length < 2) return false;
        let comuns = 0;
        for (const p of partesOfx) {
          if (nomeSys.includes(p)) comuns++;
          if (comuns >= 2) return true;
        }
        return false;
      });
    }
    return resp;
  }

  // ---- CARTÃO: taxa da maquininha — sistema vale mais que o creditado, dentro da faixa de % da regra ----
  if (!dataOfx) return resp;
  const subtipoOfx = getSubtipoCartaoOfx(itemBanco.descricao);
  if (!subtipoOfx) return resp;

  const regraCartaoAtual = regraParaCartao(subtipoOfx, regras);
  const diasMax = regraCartaoAtual.diasUteisMax ?? 2;

  const candidatos = sistemaFiltradoPorTipo.filter((s) => {
    if (!s.data) return false;
    if (getSubtipoCartaoSistema(s.formaPagamentoRaw) !== subtipoOfx) return false;
    return Math.abs(diffDiasUteis(s.data, dataOfx)) <= diasMax;
  });

  // Quando o valor bruto já é conhecido com certeza (recebíveis Stone), casa
  // direto por valor exato — não precisa mais estimar a taxa por faixa de %.
  if (itemBanco.valorBrutoCartao != null) {
    const alvo = itemBanco.valorBrutoCartao;
    const tolerancia = regraCartaoAtual.toleranciaValor ?? 0.01;
    const candidatosComValor = candidatos.filter((s) => valoresIguais(Math.abs(s.valor), alvo, tolerancia));

    // Mesmo valor pode ser de VÁRIAS parcelas diferentes (parcelas iguais de
    // vendas parceladas costumam ter o mesmo valor) — a parcela (X/Y) desempata:
    // só entra na lista principal quem bate com a mesma parcela do Banco (ou
    // não tem parcela informada nos dois lados pra comparar); o resto vai pra
    // uma categoria à parte, pro usuário decidir se aceita mesmo assim.
    const parcelaOfx = extrairParcela(itemBanco.descricao);
    const candidatosParcelaOk = candidatosComValor.filter((s) => parcelaCompativel(parcelaOfx, extrairParcela(s.documento)));
    resp.mesmoValorParcelaDiferente = candidatosComValor.filter((s) => !parcelaCompativel(parcelaOfx, extrairParcela(s.documento)));

    const parcelaOkMesmaData = candidatosParcelaOk.filter((s) => s.data === dataOfx);
    resp.mesmoValorMesmaData = parcelaOkMesmaData.filter((s) => valoresExatamenteIguais(Math.abs(s.valor), alvo));
    resp.valorAproximadoMesmaData = parcelaOkMesmaData.filter((s) => !valoresExatamenteIguais(Math.abs(s.valor), alvo));
    if (parcelaOkMesmaData.length > 0) return resp;
    const parcelaOkOutraData = candidatosParcelaOk.filter((s) => s.data !== dataOfx);
    resp.mesmoValorOutraData = parcelaOkOutraData.filter((s) => valoresExatamenteIguais(Math.abs(s.valor), alvo));
    resp.valorAproximadoOutraData = parcelaOkOutraData.filter((s) => !valoresExatamenteIguais(Math.abs(s.valor), alvo));
    return resp;
  }

  resp.mesmoValorMesmaData = candidatos.filter((s) => s.data === dataOfx);
  if (resp.mesmoValorMesmaData.length > 0) return resp;

  resp.mesmoValorOutraData = candidatos.filter((s) => s.data !== dataOfx);
  return resp;
}

/** Backtracking: subconjunto de `lista` cuja soma absoluta bate com `alvo`, dentro da `tolerancia` da regra. Genérico (não só LancamentoSistema) pra dar pra rodar também sobre lançamentos do Banco, na busca invertida. Poda por soma restante (nem tudo que falta alcança o alvo) — sem isso, um dia com muitos títulos parecidos faria a busca explorar ~2^n combinações. */
function combinacaoExata<T extends { valor: number }>(lista: T[], alvo: number, tolerancia: number): T[] | null {
  const valoresAbs = lista.map((item) => Math.abs(item.valor));
  const n = valoresAbs.length;
  const somaRestante = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) somaRestante[i] = somaRestante[i + 1] + valoresAbs[i];

  function backtrack(i: number, soma: number, usados: T[]): T[] | null {
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
 * Sistema. A comparação é a mesma (tolerância de valor, janela de dias
 * úteis, faixa de taxa de cartão, nome), só invertendo quem é o lado fixo
 * e a direção de data/valor onde há assimetria (cartão, boleto).
 *
 * `combinado`: mesmo motivo de buscarSugestoes — quando `itemSistema` é a
 * soma de vários selecionados juntos, ignora "nome parecido" e busca só por valor.
 */
export function buscarSugestoesInverso(itemSistema: LancamentoSistema, banco: LancamentoBanco[], regras: RegrasPorForma, combinado = false): SugestoesConciliacaoInversa {
  const tipoSistema = getCategoriaSistema(itemSistema.formaPagamentoRaw);
  const valorSisAbs = Math.abs(itemSistema.valor);
  const dataSis = itemSistema.data || null;

  // Mesmo motivo de buscarSugestoes: não exclui já conciliado, só desativado
  // — mostra sinalizado (pode ter sido uma conciliação errada) em vez de
  // esconder.
  const bancoFiltradoPorTipo = banco.filter((b) => {
    if (b.desativado) return false;
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
    const regraPix = regras.PIX;
    const mesmoValorTodos = bancoFiltradoPorTipo.filter((b) => valoresIguais(Math.abs(b.valor), valorSisAbs, regraPix.toleranciaValor));
    const mesmaData = mesmoValorTodos.filter((b) => dataSis && b.data === dataSis);
    const outraData = mesmoValorTodos.filter((b) => !dataSis || b.data !== dataSis);
    resp.mesmoValorMesmaData = mesmaData.filter((b) => valoresExatamenteIguais(Math.abs(b.valor), valorSisAbs));
    resp.valorAproximadoMesmaData = mesmaData.filter((b) => !valoresExatamenteIguais(Math.abs(b.valor), valorSisAbs));
    resp.mesmoValorOutraData = outraData.filter((b) => valoresExatamenteIguais(Math.abs(b.valor), valorSisAbs));
    resp.valorAproximadoOutraData = outraData.filter((b) => !valoresExatamenteIguais(Math.abs(b.valor), valorSisAbs));
    if (mesmoValorTodos.length > 0) return resp;

    if (!nomeSis) return resp;
    const candidatosNome = bancoFiltradoPorTipo.filter((b) => {
      const nomeB = normalizarNomeClienteOfx(b.descricao);
      return nomeB ? nomesSemelhantesFortes(nomeB, nomeSis, regraPix.nomeMinContido ?? 8, regraPix.nomeMinSobrenome ?? 5) : false;
    });
    resp.mesmoNome = candidatosNome;
    if (candidatosNome.length > 1) {
      const ordenada = [...candidatosNome].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
      const combinacao = combinacaoExata(ordenada, valorSisAbs, regraPix.toleranciaValor);
      if (combinacao && combinacao.length > 1) resp.combinacaoPix = combinacao;
    }
    return resp;
  }

  // ---- BOLETO: OFX pago dentro da janela de dias úteis À FRENTE da data do título, valor exato OU soma de vários lançamentos do banco ----
  if (tipoSistema === 'BOLETO') {
    const regraBoleto = regras.BOLETO;
    const diasMin = regraBoleto.diasUteisMin ?? 2;
    const diasMax = regraBoleto.diasUteisMax ?? 3;
    if (!dataSis) return resp;
    const dataSisDate = new Date(dataSis);

    const candidatos = bancoFiltradoPorTipo.filter((b) => {
      const dataB = new Date(b.data);
      if (dataB <= dataSisDate) return false;
      const diasUteis = diasUteisAte(dataSisDate, dataB, diasMax);
      return diasUteis >= diasMin && diasUteis <= diasMax;
    });

    const dentroDaTolerancia = candidatos.filter((b) => valoresIguais(Math.abs(b.valor), valorSisAbs, regraBoleto.toleranciaValor));
    if (dentroDaTolerancia.length > 0) {
      resp.mesmoValorMesmaData = dentroDaTolerancia.filter((b) => valoresExatamenteIguais(Math.abs(b.valor), valorSisAbs));
      resp.valorAproximadoMesmaData = dentroDaTolerancia.filter((b) => !valoresExatamenteIguais(Math.abs(b.valor), valorSisAbs));
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

  // ---- Demais formas (exceto cartão): mesmo valor (com tolerância da regra), e nome com 2+ palavras em comum ----
  if (tipoSistema !== 'CARTAO') {
    const regraForma = regraParaFormaGenerica(tipoSistema, regras);
    const mesmoValorTodos = bancoFiltradoPorTipo.filter((b) => valoresIguais(Math.abs(b.valor), valorSisAbs, regraForma.toleranciaValor));
    const mesmaData = mesmoValorTodos.filter((b) => dataSis && b.data === dataSis);
    const outraData = mesmoValorTodos.filter((b) => !dataSis || b.data !== dataSis);
    resp.mesmoValorMesmaData = mesmaData.filter((b) => valoresExatamenteIguais(Math.abs(b.valor), valorSisAbs));
    resp.valorAproximadoMesmaData = mesmaData.filter((b) => !valoresExatamenteIguais(Math.abs(b.valor), valorSisAbs));
    resp.mesmoValorOutraData = outraData.filter((b) => valoresExatamenteIguais(Math.abs(b.valor), valorSisAbs));
    resp.valorAproximadoOutraData = outraData.filter((b) => !valoresExatamenteIguais(Math.abs(b.valor), valorSisAbs));

    if (tipoSistema !== 'PIX' && !combinado) {
      resp.mesmoNome = bancoFiltradoPorTipo.filter((b) => {
        const nomeB = normalizarNomeClienteOfx(b.descricao);
        if (!nomeSis || !nomeB) return false;
        const partesSis = nomeSis.split(' ').filter((p) => p.length >= 4);
        if (partesSis.length < 2) return false;
        let comuns = 0;
        for (const p of partesSis) {
          if (nomeB.includes(p)) comuns++;
          if (comuns >= 2) return true;
        }
        return false;
      });
    }
    return resp;
  }

  // ---- CARTÃO: taxa da maquininha invertida — sistema (bruto) fixo, candidato do OFX tem que ser MENOR, dentro da faixa % da regra ----
  if (!dataSis) return resp;
  const subtipoSistema = getSubtipoCartaoSistema(itemSistema.formaPagamentoRaw);
  if (!subtipoSistema) return resp;

  const regraCartaoAtual = regraParaCartao(subtipoSistema, regras);
  const diasMax = regraCartaoAtual.diasUteisMax ?? 2;

  const candidatos = bancoFiltradoPorTipo.filter((b) => {
    if (getSubtipoCartaoOfx(b.descricao) !== subtipoSistema) return false;
    return Math.abs(diffDiasUteis(dataSis, b.data)) <= diasMax;
  });

  // Quando o próprio banco já sabe o valor bruto (recebíveis Stone), casa
  // direto por valor exato — não precisa mais estimar a taxa por faixa de %.
  const candidatosComBrutoConhecido = candidatos.filter((b) => b.valorBrutoCartao != null);
  if (candidatosComBrutoConhecido.length > 0) {
    const tolerancia = regraCartaoAtual.toleranciaValor ?? 0.01;
    const candidatosComValor = candidatosComBrutoConhecido.filter((b) => valoresIguais(b.valorBrutoCartao!, valorSisAbs, tolerancia));

    const parcelaSis = extrairParcela(itemSistema.documento);
    const candidatosParcelaOk = candidatosComValor.filter((b) => parcelaCompativel(parcelaSis, extrairParcela(b.descricao)));
    resp.mesmoValorParcelaDiferente = candidatosComValor.filter((b) => !parcelaCompativel(parcelaSis, extrairParcela(b.descricao)));

    const parcelaOkMesmaData = candidatosParcelaOk.filter((b) => b.data === dataSis);
    resp.mesmoValorMesmaData = parcelaOkMesmaData.filter((b) => valoresExatamenteIguais(b.valorBrutoCartao!, valorSisAbs));
    resp.valorAproximadoMesmaData = parcelaOkMesmaData.filter((b) => !valoresExatamenteIguais(b.valorBrutoCartao!, valorSisAbs));
    if (parcelaOkMesmaData.length > 0) return resp;
    const parcelaOkOutraData = candidatosParcelaOk.filter((b) => b.data !== dataSis);
    resp.mesmoValorOutraData = parcelaOkOutraData.filter((b) => valoresExatamenteIguais(b.valorBrutoCartao!, valorSisAbs));
    resp.valorAproximadoOutraData = parcelaOkOutraData.filter((b) => !valoresExatamenteIguais(b.valorBrutoCartao!, valorSisAbs));
    return resp;
  }

  resp.mesmoValorMesmaData = candidatos.filter((b) => b.data === dataSis);
  if (resp.mesmoValorMesmaData.length > 0) return resp;

  resp.mesmoValorOutraData = candidatos.filter((b) => b.data !== dataSis);
  return resp;
}

export interface GrupoParaConciliar {
  bancoIds: string[];
  sistemaIds: string[];
}

/**
 * Conciliação 100% automática — porte de conciliacaoAutomatica(). Mais
 * conservadora que buscarSugestoes(): só liga automaticamente quando existe
 * exatamente UM candidato sem ambiguidade, e (por padrão, configurável por
 * regra) exige que o lançamento do sistema tenha NF preenchida. Casos
 * ambíguos ficam pra conciliação manual, guiada pelas sugestões de
 * buscarSugestoes().
 */
export function conciliacaoAutomatica(banco: LancamentoBanco[], sistema: LancamentoSistema[], regras: RegrasPorForma): GrupoParaConciliar[] {
  const grupos: GrupoParaConciliar[] = [];
  const sistemaJaUsado = new Set<string>();

  const ofxPendentes = banco.filter((b) => !b.conciliado && !b.desativado);

  for (const ofx of ofxPendentes) {
    const tipo = ofx.formaPagamento;
    const valorOfxAbs = Math.abs(ofx.valor);
    const dataOfx = ofx.data;
    if (!dataOfx) continue;

    // Boleto tem regra própria (janela de dias úteis, igual às sugestões) —
    // trata à parte, antes do "balaio genérico" de PIX/Cheque/etc., que só
    // considera mesma data.
    if (tipo === 'BOLETO') {
      const regraBoleto = regras.BOLETO;
      const diasMin = regraBoleto.diasUteisMin ?? 2;
      const diasMax = regraBoleto.diasUteisMax ?? 3;
      const dataOfxDate = new Date(dataOfx);

      const candidatosBoleto = sistema.filter((s) => {
        if (s.conciliado || s.desativado || sistemaJaUsado.has(s.id)) return false;
        if (!s.data) return false;
        if (getCategoriaSistema(s.formaPagamentoRaw) !== 'BOLETO') return false;
        if (Math.sign(s.valor) !== Math.sign(ofx.valor)) return false;
        if (regraBoleto.exigirNfAutomatica && (!s.nf || !s.nf.trim())) return false;

        const dataSys = new Date(s.data);
        if (dataSys >= dataOfxDate) return false;
        const diasUteis = diasUteisAte(dataSys, dataOfxDate, diasMax);
        return diasUteis >= diasMin && diasUteis <= diasMax;
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
      const regraPix = regras.PIX;
      const candidatosPix = sistema.filter((s) => {
        if (s.conciliado || s.desativado || sistemaJaUsado.has(s.id)) return false;
        if (!s.data) return false;
        if (getCategoriaSistema(s.formaPagamentoRaw) !== 'PIX') return false;
        if (Math.sign(s.valor) !== Math.sign(ofx.valor)) return false;
        if (regraPix.exigirNfAutomatica && (!s.nf || !s.nf.trim())) return false;
        return true;
      });

      const valorExato = candidatosPix.filter((s) => s.data === dataOfx && valoresIguais(Math.abs(s.valor), valorOfxAbs, regraPix.toleranciaValor));
      if (valorExato.length === 1) {
        grupos.push({ bancoIds: [ofx.id], sistemaIds: [valorExato[0].id] });
        sistemaJaUsado.add(valorExato[0].id);
        continue;
      }
      if (valorExato.length > 1) continue; // ambíguo — fica pra conciliação manual

      const nomeOfx = normalizarNomeClienteOfx(ofx.descricao);
      if (!nomeOfx) continue;
      const candidatosNome = candidatosPix.filter((s) =>
        nomesSemelhantesFortes(nomeOfx, removerAcentos(s.cliente || '').toLowerCase(), regraPix.nomeMinContido ?? 8, regraPix.nomeMinSobrenome ?? 5),
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
        combinacoesTodasExatas(ordenada, valorOfxAbs, regraPix.toleranciaValor).forEach((c) => combinacoesValidasPix.push(c));
      }

      if (combinacoesValidasPix.length === 1) {
        const ids = combinacoesValidasPix[0].map((s) => s.id);
        grupos.push({ bancoIds: [ofx.id], sistemaIds: ids });
        ids.forEach((id) => sistemaJaUsado.add(id));
      }
      continue;
    }

    if (tipo !== 'CARTAO') {
      const regraForma = regraParaFormaGenerica(tipo, regras);
      const candidatosValidos = sistema.filter((s) => {
        if (s.conciliado || s.desativado || sistemaJaUsado.has(s.id)) return false;
        if (!s.data) return false;
        if (getCategoriaSistema(s.formaPagamentoRaw) !== tipo) return false;
        if (Math.sign(s.valor) !== Math.sign(ofx.valor)) return false;
        if (regraForma.exigirNfAutomatica && (!s.nf || !s.nf.trim())) return false;
        return s.data === dataOfx && valoresIguais(Math.abs(s.valor), valorOfxAbs, regraForma.toleranciaValor);
      });
      if (candidatosValidos.length === 1) {
        grupos.push({ bancoIds: [ofx.id], sistemaIds: [candidatosValidos[0].id] });
        sistemaJaUsado.add(candidatosValidos[0].id);
      }
      continue;
    }

    const subtipoOfx = getSubtipoCartaoOfx(ofx.descricao);
    if (!subtipoOfx) continue;
    const regraCartaoAtual = regraParaCartao(subtipoOfx, regras);
    const diasMax = regraCartaoAtual.diasUteisMax ?? 2;

    const candidatosBase = sistema.filter((s) => {
      if (s.conciliado || s.desativado || sistemaJaUsado.has(s.id)) return false;
      if (!s.data) return false;
      if (getCategoriaSistema(s.formaPagamentoRaw) !== 'CARTAO') return false;
      if (Math.sign(s.valor) !== Math.sign(ofx.valor)) return false;
      if (regraCartaoAtual.exigirNfAutomatica && (!s.nf || !s.nf.trim())) return false;
      return true;
    });

    // Quando o valor bruto já é conhecido com certeza (recebíveis Stone),
    // concilia por valor exato — não precisa mais estimar a taxa por faixa
    // de %, mesma ideia do Boleto (só liga sozinho se não houver ambiguidade).
    if (ofx.valorBrutoCartao != null) {
      const alvo = ofx.valorBrutoCartao;
      const parcelaOfx = extrairParcela(ofx.descricao);
      const candidatosJanela = candidatosBase.filter((s) => {
        if (getSubtipoCartaoSistema(s.formaPagamentoRaw) !== subtipoOfx) return false;
        return Math.abs(diffDiasUteis(s.data!, dataOfx)) <= diasMax;
      });

      const valorExato = candidatosJanela.filter((s) => valoresIguais(Math.abs(s.valor), alvo, regraCartaoAtual.toleranciaValor));
      // Parcelas iguais de uma venda parcelada costumam ter o mesmo valor —
      // a automática só fecha sozinha quando a parcela (X/Y) também bate
      // (ou não dá pra saber, de um dos dois lados), nunca só pelo valor.
      const valorExatoMesmaParcela = valorExato.filter((s) => parcelaCompativel(parcelaOfx, extrairParcela(s.documento)));
      if (valorExatoMesmaParcela.length === 1) {
        grupos.push({ bancoIds: [ofx.id], sistemaIds: [valorExatoMesmaParcela[0].id] });
        sistemaJaUsado.add(valorExatoMesmaParcela[0].id);
      }
      // Cartão não soma mais vários lançamentos do Sistema pra fechar sozinho
      // — o arquivo novo (Stone) já traz 1 lançamento por venda de cartão,
      // então cada recebimento do banco corresponde a UMA venda só, nunca a
      // uma combinação. Se não bateu 1 pra 1 (nenhum ou mais de um candidato,
      // ou parcela diferente), fica pra conciliação manual.
      continue;
    }

    const minPerc = (regraCartaoAtual.taxaMinPercentual ?? 0) / 100;
    const maxPerc = (regraCartaoAtual.taxaMaxPercentual ?? 100) / 100;

    const unicos = candidatosBase.filter((s) => {
      if (getSubtipoCartaoSistema(s.formaPagamentoRaw) !== subtipoOfx) return false;
      if (Math.abs(diffDiasUteis(s.data!, dataOfx)) > diasMax) return false;
      const vSys = Math.abs(s.valor);
      if (vSys < valorOfxAbs) return false;
      const perc = (vSys - valorOfxAbs) / vSys;
      return perc >= minPerc && perc <= maxPerc;
    });

    if (unicos.length === 1) {
      grupos.push({ bancoIds: [ofx.id], sistemaIds: [unicos[0].id] });
      sistemaJaUsado.add(unicos[0].id);
    }
  }

  return grupos;
}

/**
 * Limite de segurança pro backtracking de combinações "achar todas" — sem
 * isso, um dia com muitos títulos de boleto parecidos faz a busca explorar
 * ~2^n combinações e trava a aba do navegador de vez (a Conciliação
 * Automática nunca volta a liberar o botão). Se o limite for atingido,
 * desiste e trata como "não achou combinação nenhuma" — mais seguro do que
 * arriscar interpretar um resultado parcial como se fosse definitivo
 * (poderia conciliar sozinho algo que na verdade era ambíguo).
 */
const MAX_NOS_BUSCA_COMBINACAO = 200_000;

/** Todas as combinações (não só a primeira) cuja soma bate exatamente com o alvo (dentro da tolerância) — usado só na conciliação automática de Boleto, pra exigir ausência de ambiguidade. Poda por soma restante e desiste assim que acha a 2ª combinação válida (só precisa saber que já é ambíguo). */
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

