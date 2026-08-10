import type { CaminhaoPedido } from './compra';
import { abrirEImprimir } from './catalogoPdf';
import type { Fornecedor } from './types';

function escapeHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const fmtQtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const fmtKg = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Imprime o pedido de compra já dividido em caminhões (mesmo layout de
 * janela de impressão do catálogo — abrirEImprimir/catalogoPdf.ts) — um
 * bloco por caminhão, com a lista de itens (Produto/Qtd/Peso) e o total.
 */
export function gerarPedidoCompraPdf(
  fornecedor: Fornecedor,
  mesesLabels: string[],
  caminhoes: CaminhaoPedido[],
  nomesDesconsiderados: string[] = [],
): void {
  const pesoTotalGeral = caminhoes.reduce((soma, c) => soma + c.pesoTotal, 0);

  let corpoHtml = '';
  caminhoes.forEach((caminhao, i) => {
    const complemento = caminhoes.length > 1 && i === caminhoes.length - 1;
    let linhas = '';
    caminhao.itens.forEach((it) => {
      linhas += `
        <tr>
          <td>${escapeHtml(it.produto.nome.replace(/[*_]/g, ''))}</td>
          <td class="numero">${fmtQtd(it.qtd)}</td>
          <td class="numero">${fmtKg(it.peso)} kg</td>
        </tr>
      `;
    });
    corpoHtml += `
      <h2 class="cat-titulo">Caminhão ${caminhao.numero}${complemento ? ' (complemento)' : ''} — ${fmtKg(caminhao.pesoTotal)} kg</h2>
      <table class="tabela-pedido">
        <thead><tr><th>Produto</th><th class="numero">Qtd</th><th class="numero">Peso</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    `;
  });

  const blocoDesconsiderados =
    nomesDesconsiderados.length > 0
      ? `
        <div class="desconsiderados">
          <p class="titulo">Desconsiderados desse pedido</p>
          <p>${nomesDesconsiderados.map(escapeHtml).join(', ')}</p>
        </div>
      `
      : '';

  const dataEmissao = new Date().toLocaleDateString('pt-BR');
  const htmlCompleto = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Pedido de Compra — ${escapeHtml(fornecedor.nome)}</title>
      <style>
        @page{ margin:18mm 14mm; }
        *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; color-adjust:exact; }
        body{ font-family:'Inter',Arial,sans-serif; color:#000000; background:#FFFFFF; margin:0; padding:0 4mm; }
        .cabecalho{ display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #000000; padding-bottom:8px; margin-bottom:18px; }
        .cabecalho .marca{ display:flex; flex-direction:column; gap:2px; }
        .cabecalho h1{ font-size:20px; font-weight:700; margin:0; letter-spacing:.3px; }
        .cabecalho .subtitulo{ font-size:12.5px; font-weight:400; color:#333333; margin:0; }
        .cabecalho .meta{ font-size:11px; color:#333333; text-align:right; line-height:1.5; white-space:nowrap; }
        .cat-titulo{ font-size:13.5px; text-transform:uppercase; letter-spacing:.6px; background:#EFEFEF; color:#000000; padding:7px 10px; margin:20px 0 0; border-left:4px solid #000000; page-break-after:avoid; }
        table.tabela-pedido{ width:100%; border-collapse:collapse; font-size:12px; margin:0 0 4px; }
        table.tabela-pedido thead th{ text-align:left; padding:7px 10px; border-bottom:1px solid #000000; font-weight:700; color:#000000; white-space:nowrap; }
        table.tabela-pedido tbody td{ padding:6px 10px; border-bottom:1px solid #CCCCCC; color:#000000; }
        table.tabela-pedido tbody tr{ page-break-inside:avoid; }
        table.tabela-pedido th.numero, table.tabela-pedido td.numero{ width:110px; text-align:right; white-space:nowrap; }
        .rodape{ margin-top:20px; padding-top:10px; border-top:2px solid #000000; font-size:13px; font-weight:700; text-align:right; }
        .desconsiderados{ margin-top:16px; padding-top:10px; border-top:1px solid #CCCCCC; }
        .desconsiderados .titulo{ font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; color:#000000; margin:0 0 3px; }
        .desconsiderados p:not(.titulo){ font-size:10.5px; color:#555555; margin:0; }
      </style>
    </head>
    <body>
      <div class="cabecalho">
        <div class="marca">
          <h1>Ceará Sementes</h1>
          <p class="subtitulo">Pedido de Compra — ${escapeHtml(fornecedor.nome)}</p>
          <p class="subtitulo">Abastecer: ${mesesLabels.map(escapeHtml).join(', ')}</p>
        </div>
        <div class="meta">${dataEmissao}</div>
      </div>
      ${corpoHtml}
      <div class="rodape">Total geral: ${fmtKg(pesoTotalGeral)} kg</div>
      ${blocoDesconsiderados}
    </body>
    </html>
  `;

  abrirEImprimir(htmlCompleto);
}
