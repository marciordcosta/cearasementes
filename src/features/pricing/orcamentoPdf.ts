import { abrirEImprimir, escapeHtml, nomeComDestaqueHtml } from './catalogoPdf';

export interface ItemOrcamentoPdf {
  nome: string;
  qtd: number;
  precoUnitario: number;
  subtotal: number;
}

function f(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Orçamento montado pelo cliente no Catálogo Online (ver CatalogoPublicoPage.tsx) — janela de
 * impressão (mesmo fluxo de abrirEImprimir), não é gravado em lugar nenhum. `freteDescricao` já vem
 * pronto de descreverFrete() — cobre cotação/não calculado/retirada no local/valor calculado.
 */
export function gerarOrcamentoPdf(canalNome: string, itens: ItemOrcamentoPdf[], freteDescricao: string, total: number): void {
  const linhas = itens
    .map(
      (item) => `
        <tr>
          <td>${nomeComDestaqueHtml(item.nome)}</td>
          <td class="num">${item.qtd}</td>
          <td class="num">R$ ${f(item.precoUnitario)}</td>
          <td class="num">R$ ${f(item.subtotal)}</td>
        </tr>
      `,
    )
    .join('');

  const dataEmissao = new Date().toLocaleDateString('pt-BR');
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Orçamento — ${escapeHtml(canalNome)}</title>
      <style>
        @page{ margin:18mm 14mm; }
        *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; color-adjust:exact; }
        body{ font-family:'Inter',Arial,sans-serif; color:#000000; background:#FFFFFF; margin:0; padding:0 4mm; }
        .cabecalho{ display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #000000; padding-bottom:8px; margin-bottom:18px; }
        .cabecalho h1{ font-size:20px; font-weight:700; margin:0; }
        .cabecalho .subtitulo{ font-size:12.5px; color:#333333; margin:2px 0 0; }
        .cabecalho .meta{ font-size:11px; color:#333333; text-align:right; }
        table{ width:100%; border-collapse:collapse; font-size:12px; }
        thead th{ text-align:left; padding:7px 8px; border-bottom:1px solid #000000; font-weight:700; }
        tbody td{ padding:7px 8px; border-bottom:1px solid #CCCCCC; }
        .num{ text-align:right; white-space:nowrap; }
        tfoot td{ padding:7px 8px; font-weight:700; }
        tfoot .total td{ border-top:2px solid #000000; font-size:14px; }
      </style>
    </head>
    <body>
      <div class="cabecalho">
        <div>
          <h1>Ceará Sementes</h1>
          <p class="subtitulo">Orçamento — ${escapeHtml(canalNome)}</p>
        </div>
        <div class="meta">Emitido em ${dataEmissao}</div>
      </div>
      <table>
        <thead>
          <tr><th>Produto</th><th class="num">Qtd.</th><th class="num">Unit. (R$)</th><th class="num">Subtotal (R$)</th></tr>
        </thead>
        <tbody>${linhas}</tbody>
        <tfoot>
          <tr><td colspan="3">Frete</td><td class="num">${escapeHtml(freteDescricao)}</td></tr>
          <tr class="total"><td colspan="3">Total</td><td class="num">R$ ${f(total)}</td></tr>
        </tfoot>
      </table>
    </body>
    </html>
  `;
  abrirEImprimir(html);
}
