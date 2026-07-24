import * as XLSX from 'xlsx';
import { readFileSmart } from '@/lib/readFileSmart';
import type { GrupoClassificado, GrupoLinhas, TipoRelatorio } from './types';

function detectDelimiter(lines: string[]): ',' | ';' {
  let semi = 0;
  let comma = 0;
  let checked = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    semi += (line.match(/;/g) || []).length;
    comma += (line.match(/,/g) || []).length;
    checked++;
    if (checked >= 8) break;
  }
  return semi >= comma ? ';' : ',';
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

export async function extractRowGroups(file: File): Promise<GrupoLinhas[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: 'array', cellDates: true });
    return workbook.SheetNames.map((sheetName) => ({
      label: workbook.SheetNames.length > 1 ? `${file.name} (${sheetName})` : file.name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: '',
        raw: true,
        blankrows: true,
      }) as unknown[][],
    }));
  }
  const text = await readFileSmart(file);
  const lines = text.split(/\r\n|\r|\n/);
  const delimiter = detectDelimiter(lines);
  return [{ label: file.name, rows: lines.map((line) => parseCSVLine(line, delimiter)) }];
}

// ---------------------------------------------------------------------
// Reconhecimento do tipo de relatório pelo texto do cabeçalho
// ---------------------------------------------------------------------
export function detectarTipoRelatorio(rows: unknown[][]): TipoRelatorio | null {
  const lower = rows
    .map((r) => r.join(' '))
    .join('\n')
    .toLowerCase();
  if (lower.includes('124 - supervisão de entregas') || lower.includes('124 - supervisao de entregas')) return '124';
  if (lower.includes('396 - vendas por cliente')) return '396';
  if (lower.includes('333 - relatório de produtos vendidos') || lower.includes('333 - relatorio de produtos vendidos')) return '333';
  return null;
}

export async function classificarArquivos(files: File[]): Promise<GrupoClassificado[]> {
  const classificados: GrupoClassificado[] = [];
  for (const file of files) {
    const grupos = await extractRowGroups(file);
    for (const grupo of grupos) {
      classificados.push({ grupo, tipo: detectarTipoRelatorio(grupo.rows) });
    }
  }
  return classificados;
}

// ---------------------------------------------------------------------
// Valores — números BR e datas em qualquer formato comum de planilha
// ---------------------------------------------------------------------
export function parseBRNumber(raw: unknown): number {
  if (raw === undefined || raw === null) return NaN;
  if (typeof raw === 'number') return raw;
  let s = String(raw).trim();
  s = s.replace(/[^\d,.-]/g, '');
  if (s === '' || s === '-') return NaN;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) s = s.replace(/\./g, '').replace(',', '.');
  else if (hasComma) s = s.replace(',', '.');
  return parseFloat(s);
}

export function parseAnyDate(raw: unknown): Date | null {
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  if (typeof raw === 'number' && raw > 0 && XLSX.SSF?.parse_date_code) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  if (typeof raw === 'string') {
    const m = raw.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (m) {
      const [, d, mo] = m;
      let y = m[3];
      if (y.length === 2) y = '20' + y;
      const dt = new Date(Number(y), Number(mo) - 1, Number(d));
      if (!isNaN(dt.getTime())) return dt;
    }
  }
  return null;
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------
// Ajuda para a tela de mapeamento: acha uma coluna pelo texto do cabeçalho
// (usada só para sugerir um palpite inicial — o usuário confirma/ajusta)
// ---------------------------------------------------------------------
export function encontrarColunaPorCabecalho(rows: unknown[][], headerRegex: RegExp): number {
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      if (headerRegex.test(String(row[c] ?? '').trim())) return c;
    }
  }
  return -1;
}

/** Extrai o nome da Tabela de Preço do texto do relatório 396 (ex.: "Tab. Preço: Atacado CE") */
export function detectarNomeTabelaPreco(rows: unknown[][]): string {
  const fullText = rows.map((r) => r.join(' | ')).join('\n');
  const match = fullText.match(/Tab\.?\s*Pre[çc]o\.?\s*:?\s*([^|,\n\r]+)/i);
  return match ? match[1].trim() : 'Tabela não identificada';
}

/**
 * Extrai o período do filtro do cabeçalho do relatório (ex.: "Filtros: Tab.
 * Preço.: REVENDA CE, Período: 01/01/2025 a 30/06/2026" no 396, ou "Filtros:
 * Período: 01/07/2025 a 01/07/2026" no 333). Essa é a data mostrada na
 * descrição e no aviso de atraso pra qualquer relatório — puxar pela data
 * dos REGISTROS em vez do cabeçalho dava falso atraso quando uma tabela
 * simplesmente não tem venda no fim do período (não é dado desatualizado,
 * é dado zerado). O 124 costuma vir com esse filtro em branco no relatório
 * original — nesse caso retorna null e a tela mostra "sem período informado".
 */
export function detectarPeriodoFiltroCabecalho(rows: unknown[][]): { inicio: Date; fim: Date } | null {
  const fullText = rows.map((r) => r.join(' | ')).join('\n');
  const match = fullText.match(/Per[íi]odo:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*a\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (!match) return null;
  const inicio = parseAnyDate(match[1]);
  const fim = parseAnyDate(match[2]);
  if (!inicio || !fim) return null;
  return { inicio, fim };
}

/** Número de colunas real da planilha (maior linha), para montar os seletores do mapeamento */
export function contarColunas(rows: unknown[][]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

/**
 * Acha a linha do cabeçalho de verdade (onde ficam "Vlr.S.Desc.", "Data" etc.)
 * contando, pra cada linha, quantos dos campos esperados batem com alguma
 * célula dela — a linha com mais acertos é o cabeçalho. Sem isso, a prévia
 * do mapeamento podia pegar texto do topo do relatório (nome da empresa,
 * endereço, telefone) achando que era um valor de coluna.
 */
export function encontrarLinhaCabecalho(rows: unknown[][], regexesCabecalho: RegExp[]): number {
  let melhorIndice = 0;
  let melhorContagem = 0;
  rows.slice(0, 20).forEach((row, i) => {
    const contagem = regexesCabecalho.filter((regex) => row.some((cel) => regex.test(String(cel ?? '').trim()))).length;
    if (contagem > melhorContagem) {
      melhorContagem = contagem;
      melhorIndice = i;
    }
  });
  return melhorContagem > 0 ? melhorIndice : -1;
}

/** Rótulo de uma coluna para o seletor de mapeamento: usa o texto do cabeçalho se achar, senão "Coluna B" etc. */
export function rotularColuna(rows: unknown[][], colIndex: number, linhaInicial = 0): string {
  const letra = colunaParaLetra(colIndex);
  for (const row of rows.slice(linhaInicial, linhaInicial + 15)) {
    const valor = String(row[colIndex] ?? '').trim();
    if (valor && isNaN(Number(valor.replace(',', '.'))) && valor.length <= 40) {
      return `${letra} — "${valor}"`;
    }
  }
  return `Coluna ${letra}`;
}

function colunaParaLetra(index: number): string {
  let n = index;
  let letra = '';
  do {
    letra = String.fromCharCode(65 + (n % 26)) + letra;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letra;
}
