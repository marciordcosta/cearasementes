import type { LancamentoBanco, LancamentoSistema, SugestoesConciliacao } from './types';
import { diffDiasUteis, getCategoriaSistema, getSubtipoCartaoOfx, getSubtipoCartaoSistema, nomesSemelhantesFortes, normalizarNomeClienteOfx, removerAcentos, valoresIguais } from './utils';

/**
 * Sugestões de conciliação pra UM lançamento do banco — porte de
 * buscarSugestoes() do conciliacao.js. Cada categoria é checada em ordem de
 * prioridade e a função retorna assim que encontra uma correspondência boa
 * o bastante (ex.: PIX com nome idêntico não continua checando "mesmo valor").
 */
export function buscarSugestoes(itemBanco: LancamentoBanco, banco: LancamentoBanco[], sistema: LancamentoSistema[]): SugestoesConciliacao {
  const tipoOfx = itemBanco.formaPagamento;
  const valorOfxAbs = Math.abs(itemBanco.valor);
  const dataOfx = itemBanco.data || null;

  const sistemaFiltradoPorTipo = sistema.filter((s) => {
    if (s.conciliado || s.desativado) return false;
    if (getCategoriaSistema(s.formaPagamentoRaw) !== tipoOfx) return false;
    const vOfx = itemBanco.valor;
    const vSys = s.valor;
    if (vOfx < 0 && vSys >= 0) return false;
    if (vOfx > 0 && vSys <= 0) return false;
    return true;
  });

  const resp: SugestoesConciliacao = {};

  // ---- PIX: mesmo remetente (descrição OFX idêntica em outro lançamento do banco) ----
  const nomeBase = normalizarNomeClienteOfx(itemBanco.descricao);
  if (nomeBase && tipoOfx === 'PIX') {
    const iguais = banco.filter((b) => {
      if (b.id === itemBanco.id) return false;
      if (b.formaPagamento !== 'PIX') return false;
      const nomeB = normalizarNomeClienteOfx(b.descricao);
      return nomeB === nomeBase;
    });
    if (iguais.length > 0) resp.mesmoRemetente = [itemBanco, ...iguais];
  }

  // ---- PIX: nome do sistema parecido (prioritário) ----
  if (tipoOfx === 'PIX') {
    const nomeOfx = normalizarNomeClienteOfx(itemBanco.descricao);
    if (nomeOfx) {
      resp.mesmoNome = sistemaFiltradoPorTipo.filter((s) => nomesSemelhantesFortes(nomeOfx, removerAcentos(s.cliente || '').toLowerCase()));
    }
  }

  // ---- BOLETO: título pago 2 ou 3 dias úteis antes, valor exato OU soma de vários títulos ----
  if (tipoOfx === 'BOLETO') {
    if (!dataOfx) return resp;
    const dataOfxDate = new Date(dataOfx);

    const candidatos = sistemaFiltradoPorTipo.filter((s) => {
      if (!s.data) return false;
      const dataSys = new Date(s.data);
      if (dataSys >= dataOfxDate) return false;
      let diasUteis = 0;
      const cur = new Date(dataSys);
      while (cur < dataOfxDate) {
        cur.setDate(cur.getDate() + 1);
        const dia = cur.getDay();
        if (dia !== 0 && dia !== 6) diasUteis++;
        if (diasUteis > 3) return false;
      }
      return diasUteis === 2 || diasUteis === 3;
    });

    const valorExato = candidatos.filter((s) => valoresIguais(Math.abs(s.valor), valorOfxAbs));
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
      const combinacao = combinacaoExata(ordenada, valorOfxAbs);
      if (combinacao && combinacao.length > 1) {
        resp.combinacaoCartao = combinacao;
        return resp;
      }
    }
    return resp;
  }

  // ---- Demais formas (exceto cartão): mesmo valor, e nome com 2+ palavras em comum ----
  if (tipoOfx !== 'CARTAO') {
    const mesmoValorTodos = sistemaFiltradoPorTipo.filter((s) => Math.abs(s.valor) === valorOfxAbs);
    resp.mesmoValorMesmaData = mesmoValorTodos.filter((s) => dataOfx && s.data === dataOfx);
    resp.mesmoValorOutraData = mesmoValorTodos.filter((s) => !dataOfx || s.data !== dataOfx);

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
    return resp;
  }

  // ---- CARTÃO: taxa da maquininha — sistema vale mais que o creditado, dentro de uma faixa de % ----
  if (!dataOfx) return resp;
  const subtipoOfx = getSubtipoCartaoOfx(itemBanco.descricao);
  if (!subtipoOfx) return resp;

  const { minPerc, maxPerc } = faixaTaxaCartao(subtipoOfx);

  const candidatos = sistemaFiltradoPorTipo.filter((s) => {
    if (!s.data) return false;
    if (getSubtipoCartaoSistema(s.formaPagamentoRaw) !== subtipoOfx) return false;
    if (s.data > dataOfx) return false;
    return diffDiasUteis(s.data, dataOfx) <= 2;
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

/** Backtracking: subconjunto de `lista` cuja soma absoluta bate exatamente com `alvo` (tolerância de 1 centavo). */
function combinacaoExata(lista: LancamentoSistema[], alvo: number): LancamentoSistema[] | null {
  function backtrack(i: number, soma: number, usados: LancamentoSistema[]): LancamentoSistema[] | null {
    if (valoresIguais(soma, alvo)) return usados;
    if (i >= lista.length || soma > alvo + 0.01) return null;
    const com = backtrack(i + 1, soma + Math.abs(lista[i].valor), [...usados, lista[i]]);
    if (com) return com;
    return backtrack(i + 1, soma, usados);
  }
  return backtrack(0, 0, []);
}

function faixaTaxaCartao(subtipo: 'DEBITO' | 'CREDITO'): { minPerc: number; maxPerc: number } {
  return subtipo === 'DEBITO' ? { minPerc: 0.009, maxPerc: 0.03 } : { minPerc: 0.019, maxPerc: 0.05 };
}

/** Como combinacaoExata, mas aceita a soma passando do alvo desde que a diferença fique dentro da faixa de taxa de cartão. */
function combinacaoComTaxa(lista: LancamentoSistema[], alvo: number, minPerc: number, maxPerc: number): LancamentoSistema[] | null {
  function backtrack(i: number, soma: number, caminho: LancamentoSistema[]): LancamentoSistema[] | null {
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

export interface GrupoParaConciliar {
  bancoIds: string[];
  sistemaIds: string[];
}

/**
 * Conciliação 100% automática — porte de conciliacaoAutomatica(). Mais
 * conservadora que buscarSugestoes(): só liga automaticamente quando existe
 * exatamente UM candidato (ou UMA combinação) sem ambiguidade, e exige que
 * o lançamento do sistema tenha NF preenchida. Casos ambíguos ficam pra
 * conciliação manual, guiada pelas sugestões de buscarSugestoes().
 */
export function conciliacaoAutomatica(banco: LancamentoBanco[], sistema: LancamentoSistema[]): GrupoParaConciliar[] {
  const grupos: GrupoParaConciliar[] = [];
  const sistemaJaUsado = new Set<string>();

  const ofxPendentes = banco.filter((b) => !b.conciliado && !b.desativado);

  for (const ofx of ofxPendentes) {
    const tipo = ofx.formaPagamento;
    const valorOfxAbs = Math.abs(ofx.valor);
    const dataOfx = ofx.data;
    if (!dataOfx) continue;

    const candidatosBase = sistema.filter((s) => {
      if (s.conciliado || s.desativado || sistemaJaUsado.has(s.id)) return false;
      if (!s.data) return false;
      if (getCategoriaSistema(s.formaPagamentoRaw) !== tipo) return false;
      if (Math.sign(s.valor) !== Math.sign(ofx.valor)) return false;
      if (!s.nf || !s.nf.trim()) return false;
      return true;
    });

    if (tipo !== 'CARTAO') {
      const candidatosValidos = candidatosBase.filter((s) => Math.abs(s.valor) === valorOfxAbs && s.data === dataOfx);
      if (candidatosValidos.length === 1) {
        grupos.push({ bancoIds: [ofx.id], sistemaIds: [candidatosValidos[0].id] });
        sistemaJaUsado.add(candidatosValidos[0].id);
      }
      continue;
    }

    const subtipoOfx = getSubtipoCartaoOfx(ofx.descricao);
    if (!subtipoOfx) continue;
    const { minPerc, maxPerc } = faixaTaxaCartao(subtipoOfx);

    const unicos = candidatosBase.filter((s) => {
      if (getSubtipoCartaoSistema(s.formaPagamentoRaw) !== subtipoOfx) return false;
      if (s.data! > dataOfx) return false;
      if (diffDiasUteis(s.data!, dataOfx) > 2) return false;
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
