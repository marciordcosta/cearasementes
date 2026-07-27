import { detectarNomeTabelaPreco, detectarPeriodoFiltroCabecalho } from '../uploads/parsing';
import type { GrupoLinhas } from '../uploads/types';
import type { ItemVenda396, PagamentoVenda396, ResultadoParseVendas396, Venda396 } from './types';

function isBlank(row: unknown[]): boolean {
  return row.every((c) => String(c ?? '').trim() === '');
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && !isNaN(v);
}

function isDateObj(v: unknown): v is Date {
  return v instanceof Date && !isNaN(v.getTime());
}

function isoData(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoHora(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function texto(v: unknown): string {
  return String(v ?? '').trim();
}

/**
 * Parser do Relatório 396 novo (Max-Manager, exportação matricial) — cada
 * venda vira um bloco de linhas: cabeçalho da venda, cabeçalho de coluna dos
 * itens, item(ns), subtotal de itens, cabeçalho de coluna dos pagamentos,
 * pagamento(s), subtotal de pagamentos, linha em branco. Reimpresso a cada
 * página do relatório (cabeçalho da empresa, "Maxdata Sistemas...", "Pág.:
 * N de M"), então boa parte das ~30 mil linhas de um arquivo real é só
 * ruído de formatação impressa — o parser reconhece cada tipo de linha
 * pela FORMA (não pelo texto), então esse ruído nunca precisa de tratamento
 * especial: cai direto no "senão, ignora" no fim da função.
 *
 * Quebra de página no MEIO de uma venda: o relatório reimprime a MESMA
 * linha de cabeçalho da venda (mesmo nº) na página seguinte antes de
 * continuar os itens/pagamentos — não é uma venda nova, é continuação
 * (ver o `if` logo depois de reconhecer o padrão de cabeçalho de venda).
 */
export function parseVendas396(grupo: GrupoLinhas): ResultadoParseVendas396 {
  const rows = grupo.rows;
  const tabelaPreco = detectarNomeTabelaPreco(rows);
  const periodoCabecalho = detectarPeriodoFiltroCabecalho(rows);

  const vendas: Venda396[] = [];
  let vendaAtual: Venda396 | null = null;
  let ignoradas = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (isBlank(row)) continue;

    const a = row[0];
    const aStr = texto(a);
    const bStr = texto(row[1]);

    // Cabeçalhos de coluna repetidos a cada página.
    if (aStr === 'Cód.Cli.') continue;
    if (aStr === 'Cód.Int.') continue;
    if (aStr === 'Forma Pagamento' && bStr === '') continue;
    if (aStr.includes('Maxdata Sistemas')) continue;

    // Cabeçalho da venda: Cód.Cli + Cliente + Venda(nº) + Data + Vendedor.
    const numVenda = row[6];
    const data = row[7];
    const vendedor = row[8];
    if (aStr !== '' && bStr !== '' && isNum(numVenda) && isDateObj(data) && texto(vendedor) !== '') {
      if (vendaAtual && vendaAtual.numVenda === numVenda) continue; // continuação da mesma venda na página seguinte
      vendaAtual = {
        linha: i + 1,
        codCliente: aStr,
        cliente: bStr,
        numVenda,
        data: isoData(data),
        hora: isoHora(data),
        vendedor: texto(vendedor),
        cpfCnpj: texto(row[13]) || null,
        numNf: texto(row[16]) || null,
        itens: [],
        pagamentos: [],
      };
      vendas.push(vendaAtual);
      continue;
    }

    // Item: Cód.Int + Produto + Vlr.Un + Qtd (ambos numéricos).
    const vlrUnitario = row[6];
    const qtd = row[7];
    if (vendaAtual && aStr !== '' && bStr !== '' && isNum(vlrUnitario) && isNum(qtd)) {
      const item: ItemVenda396 = {
        codInterno: aStr || null,
        produto: bStr,
        vlrUnitario,
        qtd,
        vlrSemDesc: isNum(row[8]) ? row[8] : 0,
        vlrDesc: isNum(row[10]) ? row[10] : 0,
        vlrComDesc: isNum(row[11]) ? row[11] : 0,
        custoUnitario: isNum(row[14]) ? row[14] : 0,
      };
      vendaAtual.itens.push(item);
      continue;
    }

    // Subtotal de itens: Cód.Int/Produto em branco, mas valor numérico.
    if (vendaAtual && aStr === '' && bStr === '' && isNum(row[8])) continue;

    // Pagamento: Forma de pagamento preenchida + valor numérico + (nº doc OU vencimento).
    const numDoc = row[4];
    const valorPag = row[8];
    const vencimento = row[6];
    if (vendaAtual && aStr !== '' && isNum(valorPag) && (texto(numDoc) !== '' || isDateObj(vencimento))) {
      const pagamento: PagamentoVenda396 = {
        formaPagamento: aStr,
        numDoc: texto(numDoc) || null,
        vencimento: isDateObj(vencimento) ? isoData(vencimento) : null,
        valor: valorPag,
      };
      vendaAtual.pagamentos.push(pagamento);
      continue;
    }

    // Subtotal de pagamentos: forma em branco, mas valor numérico.
    if (vendaAtual && aStr === '' && isNum(row[8])) continue;

    // Sobra: cabeçalho/rodapé da empresa repetido a cada página impressa.
    ignoradas++;
  }

  return { tabelaPreco, periodoCabecalho, vendas, ignoradas };
}
