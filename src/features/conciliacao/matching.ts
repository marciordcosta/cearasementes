import type { FormaRegra, RegraConciliacao } from './regras';
import type { FormaPagamento, LancamentoBanco, LancamentoSistema, SugestoesConciliacao, SugestoesConciliacaoInversa } from './types';
import { diasUteisAte, diffDiasUteis, getCategoriaSistema, getSubtipoCartaoOfx, getSubtipoCartaoSistema, nomesSemelhantesFortes, normalizarNomeClienteOfx, removerAcentos, valoresIguais } from './utils';

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
export function buscarSugestoes(itemBanco: LancamentoBanco, banco: LancamentoBanco[], sistema: LancamentoSistema[], regras: RegrasPorForma, combinado = false): SugestoesConciliacao {
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

  // ---- PIX: nome do sistema parecido (prioritário — não deve ser sobrescrito pelo match genérico de nome logo abaixo) ----
  if (tipoOfx === 'PIX' && !combinado) {
    const regraPix = regras.PIX;
    const nomeOfx = normalizarNomeClienteOfx(itemBanco.descricao);
    if (nomeOfx) {
      resp.mesmoNome = sistemaFiltradoPorTipo.filter((s) =>
        nomesSemelhantesFortes(nomeOfx, removerAcentos(s.cliente || '').toLowerCase(), regraPix.nomeMinContido ?? 8, regraPix.nomeMinSobrenome ?? 5),
      );
    }
  }

  // ---- BOLETO: título pago dentro da janela de dias úteis (regra), valor exato OU soma de vários títulos ----
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

    const valorExato = candidatos.filter((s) => valoresIguais(Math.abs(s.valor), valorOfxAbs, regraBoleto.toleranciaValor));
    if (valorExato.length > 0) {
      resp.mesmoValorMesmaData = valorExato;
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
        resp.combinacaoCartao = combinacao;
        return resp;
      }
    }
    return resp;
  }

  // ---- Demais formas (exceto cartão): mesmo valor (com tolerância da regra), e nome com 2+ palavras em comum ----
  if (tipoOfx !== 'CARTAO') {
    const regraForma = regraParaFormaGenerica(tipoOfx, regras);
    const mesmoValorTodos = sistemaFiltradoPorTipo.filter((s) => valoresIguais(Math.abs(s.valor), valorOfxAbs, regraForma.toleranciaValor));
    resp.mesmoValorMesmaData = mesmoValorTodos.filter((s) => dataOfx && s.data === dataOfx);
    resp.mesmoValorOutraData = mesmoValorTodos.filter((s) => !dataOfx || s.data !== dataOfx);

    // PIX já calculou o próprio mesmoNome (mais preciso) acima — não sobrescreve.
    // Combinado (soma de vários selecionados) não compara nome — ver comentário no topo da função.
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
  const minPerc = (regraCartaoAtual.taxaMinPercentual ?? 0) / 100;
  const maxPerc = (regraCartaoAtual.taxaMaxPercentual ?? 100) / 100;
  const diasMax = regraCartaoAtual.diasUteisMax ?? 2;

  const candidatos = sistemaFiltradoPorTipo.filter((s) => {
    if (!s.data) return false;
    if (getSubtipoCartaoSistema(s.formaPagamentoRaw) !== subtipoOfx) return false;
    if (s.data > dataOfx) return false;
    return diffDiasUteis(s.data, dataOfx) <= diasMax;
  });

  resp.mesmoValorMesmaData = candidatos.filter((s) => s.data === dataOfx);
  if (resp.mesmoValorMesmaData.length > 0) return resp;

  resp.mesmoValorOutraData = candidatos.filter((s) => s.data !== dataOfx);

  const porData = new Map<string, LancamentoSistema[]>();
  candidatos.forEach((s) => {
    const lista = porData.get(s.data!) ?? [];
    lista.push(s);
    porData.set(s.data!, lista);
  });

  for (const lista of porData.values()) {
    const ordenada = [...lista].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
    const combinacao = combinacaoComTaxa(ordenada, valorOfxAbs, minPerc, maxPerc);
    if (combinacao && combinacao.length > 1) {
      resp.combinacaoCartao = combinacao;
      return resp;
    }
  }
  return resp;
}

/** Backtracking: subconjunto de `lista` cuja soma absoluta bate com `alvo`, dentro da `tolerancia` da regra. Genérico (não só LancamentoSistema) pra dar pra rodar também sobre lançamentos do Banco, na busca invertida. */
function combinacaoExata<T extends { valor: number }>(lista: T[], alvo: number, tolerancia: number): T[] | null {
  function backtrack(i: number, soma: number, usados: T[]): T[] | null {
    if (valoresIguais(soma, alvo, tolerancia)) return usados;
    if (i >= lista.length || soma > alvo + tolerancia) return null;
    const com = backtrack(i + 1, soma + Math.abs(lista[i].valor), [...usados, lista[i]]);
    if (com) return com;
    return backtrack(i + 1, soma, usados);
  }
  return backtrack(0, 0, []);
}

/** Como combinacaoExata, mas aceita a soma passando do alvo desde que a diferença fique dentro da faixa de taxa de cartão. */
function combinacaoComTaxa<T extends { valor: number }>(lista: T[], alvo: number, minPerc: number, maxPerc: number): T[] | null {
  function backtrack(i: number, soma: number, caminho: T[]): T[] | null {
    if (soma > alvo * (1 + maxPerc)) return null;
    if (i >= lista.length) return null;

    const novaSoma = soma + Math.abs(lista[i].valor);
    if (novaSoma > alvo) {
      const perc = (novaSoma - alvo) / novaSoma;
      if (perc >= minPerc && perc <= maxPerc) return [...caminho, lista[i]];
    }

    const com = backtrack(i + 1, novaSoma, [...caminho, lista[i]]);
    if (com) return com;
    return backtrack(i + 1, soma, caminho);
  }
  return backtrack(0, 0, []);
}

/**
 * Espelho de combinacaoComTaxa pro sentido invertido (Sistema → OFX): aqui o
 * valor fixo é o BRUTO (sistema, maior) e os candidatos (banco) têm que
 * somar um valor LOGO ABAIXO dele — a diferença é a taxa descontada pela
 * maquininha. Não dá pra genericizar junto com combinacaoComTaxa: a direção
 * da comparação (soma > alvo vs soma < alvo) é o inverso, não só o tipo.
 */
function combinacaoComTaxaInversa<T extends { valor: number }>(lista: T[], alvo: number, minPerc: number, maxPerc: number): T[] | null {
  function backtrack(i: number, soma: number, caminho: T[]): T[] | null {
    if (i >= lista.length) return null;

    const novaSoma = soma + Math.abs(lista[i].valor);
    if (novaSoma <= alvo) {
      const perc = (alvo - novaSoma) / alvo;
      if (perc >= minPerc && perc <= maxPerc) return [...caminho, lista[i]];
      const com = backtrack(i + 1, novaSoma, [...caminho, lista[i]]);
      if (com) return com;
    }
    return backtrack(i + 1, soma, caminho);
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
export function buscarSugestoesInverso(itemSistema: LancamentoSistema, banco: LancamentoBanco[], sistema: LancamentoSistema[], regras: RegrasPorForma, combinado = false): SugestoesConciliacaoInversa {
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

  // ---- PIX: nome do sistema parecido com a descrição de cada OFX candidato ----
  if (tipoSistema === 'PIX' && nomeSis && !combinado) {
    const regraPix = regras.PIX;
    resp.mesmoNome = bancoFiltradoPorTipo.filter((b) => {
      const nomeB = normalizarNomeClienteOfx(b.descricao);
      return nomeB ? nomesSemelhantesFortes(nomeB, nomeSis, regraPix.nomeMinContido ?? 8, regraPix.nomeMinSobrenome ?? 5) : false;
    });
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

    const valorExato = candidatos.filter((b) => valoresIguais(Math.abs(b.valor), valorSisAbs, regraBoleto.toleranciaValor));
    if (valorExato.length > 0) {
      resp.mesmoValorMesmaData = valorExato;
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
        resp.combinacaoCartao = combinacao;
        return resp;
      }
    }
    return resp;
  }

  // ---- Demais formas (exceto cartão): mesmo valor (com tolerância da regra), e nome com 2+ palavras em comum ----
  if (tipoSistema !== 'CARTAO') {
    const regraForma = regraParaFormaGenerica(tipoSistema, regras);
    const mesmoValorTodos = bancoFiltradoPorTipo.filter((b) => valoresIguais(Math.abs(b.valor), valorSisAbs, regraForma.toleranciaValor));
    resp.mesmoValorMesmaData = mesmoValorTodos.filter((b) => dataSis && b.data === dataSis);
    resp.mesmoValorOutraData = mesmoValorTodos.filter((b) => !dataSis || b.data !== dataSis);

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
  const minPerc = (regraCartaoAtual.taxaMinPercentual ?? 0) / 100;
  const maxPerc = (regraCartaoAtual.taxaMaxPercentual ?? 100) / 100;
  const diasMax = regraCartaoAtual.diasUteisMax ?? 2;

  const candidatos = bancoFiltradoPorTipo.filter((b) => {
    if (getSubtipoCartaoOfx(b.descricao) !== subtipoSistema) return false;
    if (b.data < dataSis) return false;
    return diffDiasUteis(dataSis, b.data) <= diasMax;
  });

  resp.mesmoValorMesmaData = candidatos.filter((b) => b.data === dataSis);
  if (resp.mesmoValorMesmaData.length > 0) return resp;

  resp.mesmoValorOutraData = candidatos.filter((b) => b.data !== dataSis);

  const porData = new Map<string, LancamentoBanco[]>();
  candidatos.forEach((b) => {
    const lista = porData.get(b.data) ?? [];
    lista.push(b);
    porData.set(b.data, lista);
  });

  for (const lista of porData.values()) {
    const ordenada = [...lista].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
    const combinacao = combinacaoComTaxaInversa(ordenada, valorSisAbs, minPerc, maxPerc);
    if (combinacao && combinacao.length > 1) {
      resp.combinacaoCartao = combinacao;
      return resp;
    }
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
 * exatamente UM candidato (ou UMA combinação) sem ambiguidade, e (por
 * padrão, configurável por regra) exige que o lançamento do sistema tenha
 * NF preenchida. Casos ambíguos ficam pra conciliação manual, guiada pelas
 * sugestões de buscarSugestoes().
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

      // Nenhum título sozinho bate — tenta combinação (soma de vários),
      // mas só concilia se existir exatamente 1 combinação válida (sem
      // ambiguidade), mesma exigência do cartão.
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
    const minPerc = (regraCartaoAtual.taxaMinPercentual ?? 0) / 100;
    const maxPerc = (regraCartaoAtual.taxaMaxPercentual ?? 100) / 100;
    const diasMax = regraCartaoAtual.diasUteisMax ?? 2;

    const candidatosBase = sistema.filter((s) => {
      if (s.conciliado || s.desativado || sistemaJaUsado.has(s.id)) return false;
      if (!s.data) return false;
      if (getCategoriaSistema(s.formaPagamentoRaw) !== 'CARTAO') return false;
      if (Math.sign(s.valor) !== Math.sign(ofx.valor)) return false;
      if (regraCartaoAtual.exigirNfAutomatica && (!s.nf || !s.nf.trim())) return false;
      return true;
    });

    const unicos = candidatosBase.filter((s) => {
      if (getSubtipoCartaoSistema(s.formaPagamentoRaw) !== subtipoOfx) return false;
      if (s.data! > dataOfx) return false;
      if (diffDiasUteis(s.data!, dataOfx) > diasMax) return false;
      const vSys = Math.abs(s.valor);
      if (vSys < valorOfxAbs) return false;
      const perc = (vSys - valorOfxAbs) / vSys;
      return perc >= minPerc && perc <= maxPerc;
    });

    if (unicos.length === 1) {
      grupos.push({ bancoIds: [ofx.id], sistemaIds: [unicos[0].id] });
      sistemaJaUsado.add(unicos[0].id);
      continue;
    }

    const porData = new Map<string, LancamentoSistema[]>();
    unicos.forEach((s) => {
      const lista = porData.get(s.data!) ?? [];
      lista.push(s);
      porData.set(s.data!, lista);
    });

    const combinacoesValidas: LancamentoSistema[][] = [];
    for (const lista of porData.values()) {
      const ordenada = [...lista].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
      combinacoesTodasComTaxa(ordenada, valorOfxAbs, minPerc, maxPerc).forEach((c) => combinacoesValidas.push(c));
    }

    if (combinacoesValidas.length === 1) {
      const ids = combinacoesValidas[0].map((s) => s.id);
      grupos.push({ bancoIds: [ofx.id], sistemaIds: ids });
      ids.forEach((id) => sistemaJaUsado.add(id));
    }
  }

  return grupos;
}

/** Todas as combinações (não só a primeira) dentro da faixa de taxa — usado só na conciliação automática, pra exigir ausência de ambiguidade. */
function combinacoesTodasComTaxa(lista: LancamentoSistema[], alvo: number, minPerc: number, maxPerc: number): LancamentoSistema[][] {
  const validas: LancamentoSistema[][] = [];

  function backtrack(i: number, soma: number, usados: LancamentoSistema[]) {
    if (soma > alvo * (1 + maxPerc)) return;
    if (i >= lista.length) return;

    const novaSoma = soma + Math.abs(lista[i].valor);
    if (novaSoma > alvo) {
      const perc = (novaSoma - alvo) / novaSoma;
      if (perc >= minPerc && perc <= maxPerc) validas.push([...usados, lista[i]]);
    }

    backtrack(i + 1, novaSoma, [...usados, lista[i]]);
    backtrack(i + 1, soma, usados);
  }

  backtrack(0, 0, []);
  return validas;
}

/** Todas as combinações (não só a primeira) cuja soma bate exatamente com o alvo (dentro da tolerância) — usado só na conciliação automática de Boleto, pra exigir ausência de ambiguidade. */
function combinacoesTodasExatas(lista: LancamentoSistema[], alvo: number, tolerancia: number): LancamentoSistema[][] {
  const validas: LancamentoSistema[][] = [];

  function backtrack(i: number, soma: number, usados: LancamentoSistema[]) {
    if (usados.length > 1 && valoresIguais(soma, alvo, tolerancia)) validas.push(usados);
    if (i >= lista.length || soma > alvo + tolerancia) return;
    backtrack(i + 1, soma + Math.abs(lista[i].valor), [...usados, lista[i]]);
    backtrack(i + 1, soma, usados);
  }

  backtrack(0, 0, []);
  return validas;
}
