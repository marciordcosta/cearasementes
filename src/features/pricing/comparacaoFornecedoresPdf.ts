import { abrirEImprimir } from './catalogoPdf';
import type { GrupoComparacaoFornecedores } from './compraComparacao';

function escapeHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const fmtValor = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Imprime a comparação de preço (R$/Kg) entre fornecedores do mesmo produto — um bloco de linhas
 * por produto (fornecedor mais barato primeiro), com uma linha em branco separando cada produto,
 * grupos em ordem alfabética (mesmo layout de janela de impressão do catálogo — abrirEImprimir/catalogoPdf.ts).
 */
export function gerarComparacaoFornecedoresPdf(grupos: GrupoComparacaoFornecedores[]): void {
  let linhas = '';
  grupos.forEach((grupo, i) => {
    if (i > 0) linhas += `<tr class="espaco"><td colspan="4"></td></tr>`;
    grupo.itens.forEach((item) => {
      linhas += `
        <tr>
          <td>${escapeHtml(item.fornecedorNome)}</td>
          <td>${escapeHtml(item.produtoNome)}</td>
          <td class="numero">R$ ${fmtValor(item.valorKg)}/kg</td>
          <td class="numero">R$ ${fmtValor(item.valorSaco)}/saco</td>
        </tr>
      `;
    });
  });

  const dataEmissao = new Date().toLocaleDateString('pt-BR');
  const htmlCompleto = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Comparação de Fornecedores</title>
      <style>
        @page{ margin:18mm 14mm; }
        *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; color-adjust:exact; }
        body{ font-family:'Inter',Arial,sans-serif; color:#000000; background:#FFFFFF; margin:0; padding:0 4mm; }
        .cabecalho{ display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #000000; padding-bottom:8px; margin-bottom:18px; }
        .cabecalho .marca{ display:flex; flex-direction:column; gap:2px; }
        .cabecalho h1{ font-size:20px; font-weight:700; margin:0; letter-spacing:.3px; }
        .cabecalho .subtitulo{ font-size:12.5px; font-weight:400; color:#333333; margin:0; }
        .cabecalho .meta{ font-size:11px; color:#333333; text-align:right; line-height:1.5; white-space:nowrap; }
        table.tabela-comparacao{ width:100%; border-collapse:collapse; font-size:12px; }
        table.tabela-comparacao thead th{ text-align:left; padding:7px 10px; border-bottom:1px solid #000000; font-weight:700; color:#000000; white-space:nowrap; }
        table.tabela-comparacao tbody td{ padding:6px 10px; border-bottom:1px solid #CCCCCC; color:#000000; }
        table.tabela-comparacao tbody tr{ page-break-inside:avoid; }
        table.tabela-comparacao tr.espaco td{ border-bottom:none; padding:5px 0; }
        table.tabela-comparacao th.numero, table.tabela-comparacao td.numero{ width:120px; text-align:right; white-space:nowrap; }
      </style>
    </head>
    <body>
      <div class="cabecalho">
        <div class="marca">
          <h1>Ceará Sementes</h1>
          <p class="subtitulo">Comparação de Preço entre Fornecedores (R$/Kg)</p>
        </div>
        <div class="meta">${dataEmissao}</div>
      </div>
      <table class="tabela-comparacao">
        <thead><tr><th>Fornecedor</th><th>Produto</th><th class="numero">Valor (Kg)</th><th class="numero">Valor (Saco)</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </body>
    </html>
  `;

  abrirEImprimir(htmlCompleto);
}
