import { detectPaymentTypeFromOfx, removerAcentos } from './utils';
import type { FormaPagamento, TipoLancamentoSistema } from './types';

export interface RegistroBancoParseado {
  bancoCodigo: string;
  bancoNome: string;
  data: string;
  valor: number;
  descricao: string;
  formaPagamento: FormaPagamento;
  /** Chave composta a partir das próprias colunas do arquivo — usado pra upsert, evita duplicar quando dois extratos/recebíveis se sobrepõem. */
  fitid: string | null;
  /** Valor bruto da venda de cartão (antes da taxa da maquininha) — só a Stone traz esse dado exato. Null pro Banco do Brasil. */
  valorBrutoCartao: number | null;
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
// Banco (extrato/recebíveis) — antes vinha de OFX; hoje cada banco exporta
// num formato próprio (planilha/CSV), então cada um tem seu parser dedicado
// abaixo. Ambos recebem `rows` já extraídas pelo `extractRowGroups` (xlsx
// vira array de linhas, csv também — mesma função serve pros dois).
// ---------------------------------------------------------------------

function parseNumeroBR(raw: unknown): number {
  const s = String(raw ?? '')
    .trim()
    .replace(/\./g, '')
    .replace(',', '.');
  return parseFloat(s);
}

function parseDataBRParaISO(raw: unknown): string | null {
  const m = String(raw ?? '')
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const ano = y.length === 2 ? `20${y}` : y;
  return `${ano}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Extrato de conta corrente do Banco do Brasil, exportado como .xlsx —
 * cabeçalho fixo "Data; observacao; Data balancete; Agencia Origem; Lote;
 * Numero Documento; Cod. Historico; Historico; Valor R$; Inf.; Detalhamento
 * Hist.". Tudo vem como texto (mesmo data e valor), sem tag nenhuma que
 * identifique o banco no conteúdo — só o texto "Extrato Conta Corrente" no
 * topo, que é o que usamos pra reconhecer o arquivo.
 */
export function ehExtratoBB(rows: unknown[][]): boolean {
  const textoTopo = rows
    .slice(0, 5)
    .map((r) => r.join(' '))
    .join(' ')
    .toLowerCase();
  return /extrato\s*conta\s*corrente/.test(textoTopo);
}

/** "Saldo Anterior" e "S A L D O" (com espaços entre as letras) são linhas de resumo, não lançamentos — descartadas comparando o texto sem espaço nenhum. */
function ehLinhaDeSaldoBB(historico: string): boolean {
  return historico.replace(/\s+/g, '').toLowerCase().includes('saldo');
}

export function parseExtratoBB(rows: unknown[][]): RegistroBancoParseado[] {
  const bancoCodigo = '001';
  const bancoNome = 'Banco do Brasil';
  const idxCabecalho = rows.findIndex((r) => String(r[0] ?? '').trim() === 'Data' && String(r[7] ?? '').trim() === 'Historico');
  const inicio = idxCabecalho >= 0 ? idxCabecalho + 1 : 0;

  const registros: RegistroBancoParseado[] = [];
  for (let i = inicio; i < rows.length; i++) {
    const row = rows[i];
    const dataBruta = String(row[0] ?? '').trim();
    const historico = String(row[7] ?? '').trim();
    if (!dataBruta || !historico || ehLinhaDeSaldoBB(historico)) continue;

    const data = parseDataBRParaISO(dataBruta);
    const valorAbs = parseNumeroBR(row[8]);
    if (!data || isNaN(valorAbs)) continue;

    const sinal = String(row[9] ?? '').trim().toUpperCase() === 'D' ? -1 : 1;
    const numeroDocumento = String(row[5] ?? '').trim();
    const codHistorico = String(row[6] ?? '').trim();
    const detalhamento = String(row[10] ?? '').trim();
    const descricao = removerAcentos([historico, detalhamento].filter(Boolean).join(' - '));

    registros.push({
      bancoCodigo,
      bancoNome,
      data,
      valor: sinal * valorAbs,
      descricao,
      formaPagamento: detectPaymentTypeFromOfx(descricao),
      fitid: [dataBruta, numeroDocumento, row[8], row[9], codHistorico].join('|'),
      valorBrutoCartao: null,
    });
  }
  return registros;
}

/**
 * Relatório de recebíveis de cartão da Stone, exportado como .csv (não é um
 * extrato bancário — é 1 linha por venda/parcela, com o valor BRUTO e o
 * LÍQUIDO já calculados). Reconhecido pelo cabeçalho ("STONECODE"/"STONE
 * ID"), que é único desse relatório.
 */
export function ehRecebiveisStone(rows: unknown[][]): boolean {
  const cabecalho = (rows[0] ?? []).map((c) => String(c ?? '').trim().toUpperCase());
  return cabecalho.includes('STONECODE') && cabecalho.includes('STONE ID');
}

export function parseRecebiveisStone(rows: unknown[][]): RegistroBancoParseado[] {
  const bancoCodigo = '197';
  const bancoNome = 'Stone';
  const cabecalho = (rows[0] ?? []).map((c) => String(c ?? '').trim().toUpperCase());
  const indice = (nome: string) => cabecalho.indexOf(nome);

  const iDataVencimento = indice('DATA DE VENCIMENTO');
  const iBandeira = indice('BANDEIRA');
  const iProduto = indice('PRODUTO');
  const iStoneId = indice('STONE ID');
  const iQtdParcelas = indice('QTD DE PARCELAS');
  const iNumParcela = indice('Nº DA PARCELA');
  const iValorBruto = indice('VALOR BRUTO');
  const iValorLiquido = indice('VALOR LÍQUIDO');
  const iStatus = indice('ÚLTIMO STATUS');

  const registros: RegistroBancoParseado[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < cabecalho.length) continue;

    // Só recebíveis já efetivamente pagos/liquidados entram como lançamento do Banco.
    const status = String(row[iStatus] ?? '').trim();
    if (status && !/pago/i.test(status)) continue;

    const data = parseDataBRParaISO(row[iDataVencimento]);
    const valorLiquido = parseNumeroBR(row[iValorLiquido]);
    if (!data || isNaN(valorLiquido)) continue;

    const valorBruto = parseNumeroBR(row[iValorBruto]);
    const bandeira = String(row[iBandeira] ?? '').trim();
    const produto = String(row[iProduto] ?? '').trim();
    const numParcela = String(row[iNumParcela] ?? '').trim();
    const qtdParcelas = String(row[iQtdParcelas] ?? '').trim();
    const stoneId = String(row[iStoneId] ?? '').trim();

    registros.push({
      bancoCodigo,
      bancoNome,
      data,
      valor: valorLiquido,
      descricao: `${removerAcentos(`Stone ${bandeira} ${produto}`)} - parcela ${numParcela}/${qtdParcelas}`,
      formaPagamento: 'CARTAO',
      fitid: [stoneId, numParcela, data].join('|'),
      valorBrutoCartao: isNaN(valorBruto) ? null : valorBruto,
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
