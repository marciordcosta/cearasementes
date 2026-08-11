import { abrirEImprimir } from './catalogoPdf';
import type { Fornecedor } from './types';

function escapeHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const fmtQtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const fmtKg = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export interface ItemImpressaoPedido {
  nome: string;
  qtd: number;
  peso: number;
}

/**
 * Imprime o pedido de compra — lista simples (Produto/Quantidade/Peso) com o
 * peso total no rodapé (mesmo layout de janela de impressão do catálogo —
 * abrirEImprimir/catalogoPdf.ts). Os desconsiderados já vêm de fora
 * filtrados — essa função não sabe deles.
 */
export function gerarPedidoCompraPdf(fornecedor: Fornecedor, mesesLabels: string[], itens: ItemImpressaoPedido[]): void {
  const pesoTotal = itens.reduce((soma, i) => soma + i.peso, 0);

  let linhas = '';
  itens.forEach((it) => {
    linhas += `
      <tr>
        <td>${escapeHtml(it.nome)}</td>
        <td class="numero">${fmtQtd(it.qtd)}</td>
        <td class="numero">${fmtKg(it.peso)} kg</td>
      </tr>
    `;
  });

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
        table.tabela-pedido{ width:100%; border-collapse:collapse; font-size:12px; margin:0 0 4px; }
        table.tabela-pedido thead th{ text-align:left; padding:7px 10px; border-bottom:1px solid #000000; font-weight:700; color:#000000; white-space:nowrap; }
        table.tabela-pedido tbody td{ padding:6px 10px; border-bottom:1px solid #CCCCCC; color:#000000; }
        table.tabela-pedido tbody tr{ page-break-inside:avoid; }
        table.tabela-pedido th.numero, table.tabela-pedido td.numero{ width:110px; text-align:right; white-space:nowrap; }
        .rodape{ margin-top:20px; padding-top:10px; border-top:2px solid #000000; font-size:13px; font-weight:700; text-align:right; }
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
      <table class="tabela-pedido">
        <thead><tr><th>Produto</th><th class="numero">Quantidade</th><th class="numero">Peso</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
      <div class="rodape">Peso total: ${fmtKg(pesoTotal)} kg</div>
    </body>
    </html>
  `;

  abrirEImprimir(htmlCompleto);
}
