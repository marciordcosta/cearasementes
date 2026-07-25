import { detectPaymentTypeFromOfx, removerAcentos } from './utils';
import type { FormaPagamento, TipoLancamentoSistema } from './types';

export interface RegistroBancoParseado {
  bancoCodigo: string;
  bancoNome: string;
  data: string;
  valor: number;
  descricao: string;
  formaPagamento: FormaPagamento;
  /** Identificador único da transação (tag <FITID>) — usado pra upsert, evita duplicar quando dois extratos se sobrepõem. Null se o OFX não trouxer essa tag. */
  fitid: string | null;
}

export interface RegistroSistemaParseado {
  tipoLancamento: TipoLancamentoSistema;
  cliente: string | null;
  documento: string | null;
  valor: number;
  data: string | null;
  nf: string | null;
  vendedor: string | null;
  formaPagamentoRaw: string | null;
}

// ---------------------------------------------------------------------
// OFX (extrato bancário) — texto semi-estruturado (OFX 1.x/SGML não fecha
// tag), por isso regex simples é mais robusto que um parser XML de verdade.
// ---------------------------------------------------------------------

/** Identifica o banco pelas tags reais do OFX (<ORG>/<BANKID>) ou, na falta, por palavra-chave no conteúdo/nome do arquivo. */
export function detectBankFromOfx(text: string, filename: string): { codigo: string; nome: string } {
  const bruto = (text || '').toUpperCase();
  const org = bruto.match(/<ORG>([^\r\n<]*)/)?.[1]?.trim();
  const bankId = bruto.match(/<BANKID>([^\r\n<]*)/)?.[1]?.trim();

  if (bankId === '001' || org?.includes('BRASIL')) return { codigo: '001', nome: 'Banco do Brasil' };
  if (org?.includes('STONE')) return { codigo: '197', nome: 'Stone' };

  const conteudo = removerAcentos((text || '').toLowerCase());
  const nomeArquivo = removerAcentos((filename || '').toLowerCase());
  if (conteudo.includes('banco do brasil') || nomeArquivo.includes('bb') || nomeArquivo.includes('brasil')) return { codigo: '001', nome: 'Banco do Brasil' };
  if (conteudo.includes('stone') || nomeArquivo.includes('stone')) return { codigo: '197', nome: 'Stone' };

  return { codigo: '999', nome: 'Banco Desconhecido' };
}

/** Alguns exports de OFX vêm com bytes nulos de preenchimento — remove sem depender de escape de regex (evita corromper o arquivo-fonte). */
function removerBytesNulos(texto: string): string {
  const nulo = String.fromCharCode(0);
  return texto.split(nulo).join('');
}

/** Extrai os lançamentos (<STMTTRN>) de um arquivo OFX de extrato bancário. */
export function parseOFX(text: string, filename: string): RegistroBancoParseado[] {
  const banco = detectBankFromOfx(text, filename);
  const limpo = removerBytesNulos(text).replace(/\r/g, '\n');
  const partes = limpo.split(/<STMTTRN>/i);

  const registros: RegistroBancoParseado[] = [];
  for (let i = 1; i < partes.length; i++) {
    const p = partes[i].split(/<\/STMTTRN>/i)[0];
    const get = (tag: string): string | null => p.match(new RegExp(`<${tag}>([^<]*)`, 'i'))?.[1]?.trim() ?? null;

    const valor = parseFloat(get('TRNAMT') || '0');
    const dataOfx = get('DTPOSTED') || '';
    const dataMatch = dataOfx.match(/(\d{4})(\d{2})(\d{2})/);
    if (!dataMatch) continue;

    const descricao = removerAcentos(get('NAME') || get('MEMO') || '');

    registros.push({
      bancoCodigo: banco.codigo,
      bancoNome: banco.nome,
      data: `${dataMatch[1]}-${dataMatch[2]}-${dataMatch[3]}`,
      valor,
      descricao,
      formaPagamento: detectPaymentTypeFromOfx(descricao),
      fitid: get('FITID'),
    });
  }
  return registros;
}

// ---------------------------------------------------------------------
// Relatório Financeiro do MAX-Manager (RDprint/Delphi) exportado como HTML
// — cada texto é um <div style="top:Npx;left:Mpx"> posicionado por
// coordenada de impressão matricial, não uma tabela HTML normal. Colunas
// são identificadas pela posição horizontal (left), linhas pela posição
// vertical (top) dentro de cada página.
// ---------------------------------------------------------------------

const COL_CLIENTE: [number, number] = [70, 140];
const COL_DOC: [number, number] = [140, 200];
const COL_VALOR: [number, number] = [200, 260];
const COL_DATA_PAGTO: [number, number] = [480, 530];
const COL_FORMA_PAGTO: [number, number] = [530, 600];
// Até 660 (não 700): a coluna "Observação" cai em 680px, na mesma faixa que
// o Vendedor — se a faixa fosse mais larga, a Observação (que vem depois na
// mesma linha) sobrescreveria o nome do vendedor.
const COL_VENDEDOR: [number, number] = [600, 660];
const COL_NF: [number, number] = [720, 760];

// Testado no texto BRUTO (não passado por removerAcentos, que também tira o
// "-" do meio) — precisa do hífen literal pra bater com "106 - RELATÓRIO...".
const REGEX_NUMERO_RELATORIO = /(\d{3})\s*-\s*relat[oó]rio/i;
// "Valor Total...:" / "Qtde Registros:" só aparecem no rodapé de somatório
// do relatório — sem esse filtro, o rodapé é lido como se fosse mais um
// lançamento (com valor e nome de cliente/vendedor garbled a partir dos
// números do total).
const REGEX_LINHA_RODAPE = /valor\s*total|qtde\s*registros/i;
const REGEX_QUEBRA_PAGINA = /^pagina:?\s*\d+/i;
const REGEX_VALOR_MONETARIO = /-?\s*\d+[.,]\d{2}/;
const REGEX_DATA_BR = /^\d{2}\/\d{2}\/\d{4}$/;

function dentroDaFaixa(x: number, [min, max]: [number, number]): boolean {
  return x >= min && x <= max;
}

function isoDaDataBR(txt: string): string {
  const [d, m, y] = txt.split('/');
  return `${y}-${m}-${d}`;
}

function parseDataBR(txt: string): Date | null {
  const m = txt.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const data = new Date(Number(y.length === 2 ? `20${y}` : y), Number(mo) - 1, Number(d));
  return isNaN(data.getTime()) ? null : data;
}

const REGEX_PERIODO_CABECALHO_SISTEMA = /DT\.?\s*PAG\.?:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*A\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i;

/**
 * Extrai o período do filtro "DT.PAG.: 01/01/2026 A 31/07/2026" do
 * cabeçalho do relatório do Sistema (Max Data) — mesma ideia do cabeçalho
 * dos relatórios 124/396/333, só que com outro rótulo de campo. Usado só
 * pra exibição/aviso de atraso, nunca pra rejeitar linha nenhuma.
 */
export function detectarPeriodoCabecalhoSistema(html: string): { inicio: Date; fim: Date } | null {
  const match = html.match(REGEX_PERIODO_CABECALHO_SISTEMA);
  if (!match) return null;
  const inicio = parseDataBR(match[1]);
  const fim = parseDataBR(match[2]);
  if (!inicio || !fim) return null;
  return { inicio, fim };
}

/**
 * Descobre se o relatório é de Entrada ou Saída pelo número no cabeçalho
 * ("106 - RELATÓRIO FINANCEIRO" = Entrada, "105 - ..." = Saída — os dois
 * relatórios reais do MAX-Manager). Cai pra procurar a palavra "saída" no
 * conteúdo/nome do arquivo só se o cabeçalho não tiver esse formato.
 */
export function detectarTipoLancamento(html: string, filename: string): TipoLancamentoSistema {
  const numeroRelatorio = html.toLowerCase().match(REGEX_NUMERO_RELATORIO)?.[1] ?? (filename || '').toLowerCase().match(REGEX_NUMERO_RELATORIO)?.[1];
  if (numeroRelatorio === '105') return 'Saída';
  if (numeroRelatorio === '106') return 'Entrada';

  const conteudo = removerAcentos(html.toLowerCase());
  const nomeArquivo = removerAcentos((filename || '').toLowerCase());
  const contemPalavraSaida = conteudo.includes('saidas') || conteudo.includes('saida') || nomeArquivo.includes('saida');
  return contemPalavraSaida ? 'Saída' : 'Entrada';
}

interface Celula {
  top: number;
  left: number;
  texto: string;
}

function extrairCelulas(html: string): Celula[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('div[style*="top"]')].map((el) => {
    const style = el.getAttribute('style') || '';
    const top = Math.round(parseFloat(style.match(/top\s*:\s*([\d.]+)/i)?.[1] ?? '0'));
    const left = Math.round(parseFloat(style.match(/left\s*:\s*([\d.]+)/i)?.[1] ?? '0'));
    return { top, left, texto: (el.textContent || '').trim() };
  });
}

/**
 * Agrupa as células em linhas (mesma página + mesmo `top`) — cada bloco vira
 * uma linha do relatório com todos os campos de um único lançamento juntos.
 * O contador de página avança no marcador real "Página: N de M" (com
 * acento — precisa normalizar antes de testar), senão linhas de páginas
 * diferentes com o mesmo `top` se misturariam num relatório com muitas
 * páginas.
 */
function agruparPorLinha(celulas: Celula[]): Celula[][] {
  const linhas = new Map<string, Celula[]>();
  let pagina = 0;

  for (const celula of celulas) {
    if (REGEX_QUEBRA_PAGINA.test(removerAcentos(celula.texto.toLowerCase()))) {
      pagina++;
      continue;
    }
    const chave = `${pagina}_${celula.top}`;
    const bucket = linhas.get(chave);
    if (bucket) bucket.push(celula);
    else linhas.set(chave, [celula]);
  }

  return [...linhas.values()];
}

function ehLinhaDeRodape(celulas: Celula[]): boolean {
  return celulas.some((c) => REGEX_LINHA_RODAPE.test(c.texto));
}

/** Monta um lançamento a partir das células de uma única linha — `null` se a linha não tiver valor (cabeçalho, separador etc.), ou seja, não é um lançamento de verdade. */
function extrairRegistro(celulas: Celula[], tipoLancamento: TipoLancamentoSistema): RegistroSistemaParseado | null {
  const celulaValor = celulas.find((c) => dentroDaFaixa(c.left, COL_VALOR) && REGEX_VALOR_MONETARIO.test(c.texto));
  if (!celulaValor) return null;

  // Devolução dentro de um relatório de Entrada vem com valor negativo no
  // próprio relatório e deve ABATER do total, não virar uma entrada nova —
  // por isso preserva o sinal original em vez de forçar positivo/negativo
  // pelo tipo do relatório (só a Saída inverte o sinal, já que lá o valor
  // sempre vem positivo representando dinheiro saindo).
  const valorLido = parseFloat(celulaValor.texto.replace(/\./g, '').replace(/,/g, '.'));
  const valor = tipoLancamento === 'Saída' ? -valorLido : valorLido;

  const cliente = celulas.find((c) => dentroDaFaixa(c.left, COL_CLIENTE))?.texto || null;
  const documento = celulas.find((c) => dentroDaFaixa(c.left, COL_DOC))?.texto.trim() || null;
  const celulaData = celulas.find((c) => dentroDaFaixa(c.left, COL_DATA_PAGTO) && REGEX_DATA_BR.test(c.texto));
  const formaPagamentoRaw = celulas.find((c) => dentroDaFaixa(c.left, COL_FORMA_PAGTO))?.texto || null;
  const vendedor = celulas.find((c) => dentroDaFaixa(c.left, COL_VENDEDOR))?.texto || null;
  const celulaNf = celulas.find((c) => dentroDaFaixa(c.left, COL_NF) && /\d/.test(c.texto));

  return {
    tipoLancamento,
    cliente: cliente ? removerAcentos(cliente) : null,
    documento,
    valor,
    data: celulaData ? isoDaDataBR(celulaData.texto) : null,
    nf: celulaNf ? celulaNf.texto.replace(/\D/g, '') || null : null,
    vendedor: vendedor ? removerAcentos(vendedor) : null,
    formaPagamentoRaw: formaPagamentoRaw ? removerAcentos(formaPagamentoRaw) : null,
  };
}

// "NF13379-1/4" — o MAX-Manager imprime esse "-1/4" (parcela atual/total)
// IDÊNTICO em todas as linhas de um documento parcelado (bug do próprio
// relatório: o número da parcela atual nunca varia, sempre fica "1"). O
// total ("/4") é confiável; a posição atual não é — por isso ela é
// recalculada em corrigirNumeracaoParcelas em vez de usada como veio.
const REGEX_DOC_PARCELADO = /^(.*)-(\d+)\/(\d+)$/;

/**
 * Corrige a numeração de parcela do `documento`: agrupa linhas com o mesmo
 * documento-base (+ cliente + valor, pra não misturar documentos de
 * clientes diferentes que por coincidência tenham o mesmo número-base),
 * ordena pela data de pagamento e renumera "1/4, 2/4, 3/4, 4/4" na ordem
 * real — em vez do "-1/4" fixo que vem repetido em toda linha impressa.
 */
function corrigirNumeracaoParcelas(registros: RegistroSistemaParseado[]): void {
  const grupos = new Map<string, RegistroSistemaParseado[]>();
  for (const r of registros) {
    if (!r.documento || !REGEX_DOC_PARCELADO.test(r.documento)) continue;
    const base = r.documento.match(REGEX_DOC_PARCELADO)![1];
    const chave = `${base}|${r.cliente ?? ''}|${r.valor}`;
    const lista = grupos.get(chave);
    if (lista) lista.push(r);
    else grupos.set(chave, [r]);
  }

  for (const lista of grupos.values()) {
    lista.sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''));
    lista.forEach((r, i) => {
      const match = r.documento!.match(REGEX_DOC_PARCELADO)!;
      const [, base, , total] = match;
      r.documento = `${base}-${i + 1}/${total}`;
    });
  }
}

export function parseMatricial(html: string, filename: string): RegistroSistemaParseado[] {
  const tipoLancamento = detectarTipoLancamento(html, filename);
  const linhas = agruparPorLinha(extrairCelulas(html));

  const registros: RegistroSistemaParseado[] = [];
  for (const celulasDaLinha of linhas) {
    if (ehLinhaDeRodape(celulasDaLinha)) continue;
    const registro = extrairRegistro(celulasDaLinha, tipoLancamento);
    if (registro) registros.push(registro);
  }
  corrigirNumeracaoParcelas(registros);
  return registros;
}
