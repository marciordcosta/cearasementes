import { abrirEImprimir, nomeComDestaqueHtml } from './catalogoPdf';
import type { GrupoComparacaoFornecedores } from './compraComparacao';

function escapeHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const fmtValor = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Mesma largura de coluna repetida em toda tabela (cabeçalho + 1 por grupo) — como cada grupo
// vira uma <table> própria (é o jeito confiável de dar "não quebrar entre páginas" numa lista
// desse tamanho), sem isso as colunas saem desalinhadas entre um grupo e outro.
const COLGROUP = `
  <colgroup>
    <col style="width:44%">
    <col style="width:26%">
    <col style="width:15%">
    <col style="width:15%">
  </colgroup>
`;

/**
 * Imprime a comparação de preço (R$/Kg) entre fornecedores do mesmo produto — um bloco de linhas
 * por produto (fornecedor mais barato primeiro), grupos em ordem alfabética. Cada grupo é a sua
 * própria tabela (com "não quebrar entre páginas") — senão o navegador quebra o grupo no meio
 * quando ele cai numa borda de página, e ele levava a reimpressão do cabeçalho junto.
 */
export function gerarComparacaoFornecedoresPdf(grupos: GrupoComparacaoFornecedores[]): void {
  const blocosGrupos = grupos
    .map((grupo) => {
      const linhas = grupo.itens
        .map(
          (item) => `
            <tr>
              <td>${nomeComDestaqueHtml(item.produtoNome)}</td>
              <td>${escapeHtml(item.fornecedorNome)}</td>
              <td class="numero">R$ ${fmtValor(item.valorKg)}/kg</td>
              <td class="numero">R$ ${fmtValor(item.valorSaco)}/saco</td>
            </tr>
          `,
        )
        .join('');
      return `<table class="tabela-grupo">${COLGROUP}<tbody>${linhas}</tbody></table>`;
    })
    .join('');

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
        table{ width:100%; border-collapse:collapse; font-size:12px; table-layout:fixed; }
        table.tabela-titulo th{ text-align:left; padding:7px 10px; border-bottom:1px solid #000000; font-weight:700; color:#000000; white-space:nowrap; }
        table.tabela-grupo{ margin-bottom:14px; break-inside:avoid; page-break-inside:avoid; }
        table.tabela-grupo td{ padding:6px 10px; border-bottom:1px solid #CCCCCC; color:#000000; }
        table.tabela-grupo tr{ break-inside:avoid; page-break-inside:avoid; }
        th.numero, td.numero{ text-align:right; white-space:nowrap; }
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
      <table class="tabela-titulo">
        ${COLGROUP}
        <tr><th>Produto</th><th>Fornecedor</th><th class="numero">Valor (Kg)</th><th class="numero">Valor (Saco)</th></tr>
      </table>
      ${blocosGrupos}
    </body>
    </html>
  `;

  abrirEImprimir(htmlCompleto);
}
