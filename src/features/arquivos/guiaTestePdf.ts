import type { ArquivoLaudo } from './types';

/**
 * Gera a "Guia de Teste" (via janela de impressão do navegador) — folha pra
 * preencher à mão no campo com os resultados do Teste de Germinação, TODOS os
 * campos em branco (o número de linhas só acompanha o filtro atual da tela).
 * Mesmo padrão de gerarCatalogoPDF (features/pricing/catalogoPdf.ts).
 */
export function gerarGuiaTestePdf(arquivos: ArquivoLaudo[]): void {
  const linhas = arquivos
    .map(
      () => `
        <tr>
          <td class="preencher"></td>
          <td class="preencher"></td>
          <td class="preencher"></td>
          <td class="preencher"></td>
          <td class="preencher"></td>
          <td class="preencher"></td>
        </tr>
      `,
    )
    .join('');

  const corpoHtml =
    arquivos.length === 0
      ? `<p class="vazio">Nenhum laudo encontrado para o filtro atual.</p>`
      : `
        <table class="tabela-guia">
          <colgroup>
            <col style="width:12%">
            <col style="width:32%">
            <col style="width:12%">
            <col style="width:10%">
            <col style="width:17%">
            <col style="width:17%">
          </colgroup>
          <thead>
            <tr>
              <th>Data do teste</th>
              <th>Produto</th>
              <th>Lote</th>
              <th>Quantidade</th>
              <th>Resultado</th>
              <th>Data do resultado</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      `;

  const dataEmissao = new Date().toLocaleDateString('pt-BR');
  const htmlCompleto = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Guia de Teste de Germinação</title>
      <style>
        @page{ margin:14mm 10mm; }
        *{ box-sizing:border-box; }
        body{
          font-family:'Inter',Arial,sans-serif; color:#000000; background:#FFFFFF;
          margin:0; padding:0 4mm;
        }
        .cabecalho{
          display:flex; justify-content:space-between; align-items:flex-start;
          border-bottom:2px solid #000000; padding-bottom:8px; margin-bottom:14px;
        }
        .cabecalho h1{font-size:18px; font-weight:700; margin:0; letter-spacing:.3px;}
        .cabecalho .meta{font-size:11px; color:#333333; text-align:right; white-space:nowrap;}
        table.tabela-guia{
          width:100%; border-collapse:collapse; font-size:12px;
        }
        table.tabela-guia thead th{
          text-align:left; padding:8px 10px; border:1px solid #000000;
          font-weight:700; color:#000000; background:#EFEFEF;
        }
        table.tabela-guia tbody td{
          padding:10px; border:1px solid #999999; color:#000000; height:26px;
        }
        table.tabela-guia tbody td.preencher{ background:#FAFAFA; }
        table.tabela-guia tbody tr{ page-break-inside:avoid; }
        .vazio{ font-size:13px; color:#000000; padding:20px 0; }
      </style>
    </head>
    <body>
      <div class="cabecalho">
        <h1>Guia de Teste de Germinação (Campo)</h1>
        <div class="meta">Emitido em ${dataEmissao}</div>
      </div>
      ${corpoHtml}
    </body>
    </html>
  `;

  const janela = window.open('', '_blank', 'width=900,height=1000');
  if (!janela) {
    alert('O navegador bloqueou a abertura da janela de impressão. Permita pop-ups para este site e tente novamente.');
    return;
  }
  janela.document.open();
  janela.document.write(htmlCompleto);
  janela.document.close();
  janela.onload = () => {
    janela.focus();
    janela.print();
  };
  // Fallback para navegadores que não disparam onload de forma confiável em document.write
  setTimeout(() => {
    janela.focus();
    janela.print();
  }, 400);
}
