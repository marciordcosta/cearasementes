import type { ManualPlantio } from './types';

export interface LinhaGuiaPlantioPdf {
  nomeProduto: string;
  lote: string | null;
  /** Baixa/Média/Ideal — primeira informação da linha adicional (info-linha). */
  condicaoLabel: string;
  modoLabel: string;
  area: string;
  taxaSemeadura: string;
  totalPrevisto: string;
  custoPorHa: string;
  totalSacos: string;
  valorTotal: string;
  /** "Sementes/m²" ou "Covas/m²", conforme o modo. */
  sementesOuCovasLabel: string;
  sementesOuCovasValor: string;
  /** "50×50 cm" — só quando o modo é Covas. */
  espacamento: string | null;
  /** Só quando o modo é Covas. */
  sementesPorCova: string | null;
}

export interface ResumoGuiaPlantioPdf {
  totalSacos: string;
  totalPeso: string;
  totalValor: string;
}

function escapeHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Manual de Plantio — texto editável (Parametrização de Produtos), impresso
 * só quando o operador escolher incluir. Parágrafos separados por linha em
 * branco; um parágrafo começando com "Nota do consultor" sai destacado numa
 * caixa (mesma ideia do manual original fixo, agora editável).
 */
function renderManualHtml(manual: ManualPlantio): string {
  const paragrafos = manual.corpo
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((paragrafo) => {
      const html = escapeHtml(paragrafo).replace(/\n/g, '<br>');
      return /^nota do consultor/i.test(paragrafo) ? `<div class="nota">${html}</div>` : `<p>${html}</p>`;
    })
    .join('');
  return `
    <div class="manual">
      <h2>${escapeHtml(manual.titulo)}</h2>
      ${paragrafos}
    </div>
  `;
}

function infoAdicionalHtml(l: LinhaGuiaPlantioPdf): string {
  const itens: { rotulo: string; valor: string }[] = [
    { rotulo: 'Condição', valor: l.condicaoLabel },
    { rotulo: 'Plantio', valor: l.modoLabel },
    { rotulo: l.sementesOuCovasLabel, valor: l.sementesOuCovasValor },
  ];
  if (l.espacamento !== null) itens.push({ rotulo: 'Espaçamento', valor: l.espacamento });
  if (l.sementesPorCova !== null) itens.push({ rotulo: 'Sementes/cova', valor: l.sementesPorCova });
  return `<div class="info-linha">${itens.map((i) => `<div class="info-item"><div class="info-rotulo">${i.rotulo}</div><div class="info-valor">${i.valor}</div></div>`).join('')}</div>`;
}

function blocoProduto(l: LinhaGuiaPlantioPdf): string {
  return `
    <div class="produto">
      <div class="produto-cabecalho">
        <div class="produto-titulo">
          <span class="produto-nome">${l.nomeProduto}</span>
          <span class="produto-lote">Lote ${l.lote ?? '—'}</span>
        </div>
        <div class="produto-totais">
          <span>Total de sacos: <strong>${l.totalSacos}</strong></span>
          <span>Valor total: <strong>${l.valorTotal}</strong></span>
        </div>
      </div>
      <table class="tabela-resultado">
        <tbody>
          <tr>
            <td class="rotulo">Área</td>
            <td class="valor">${l.area}</td>
            <td class="rotulo">Total previsto (kg)</td>
            <td class="valor">${l.totalPrevisto}</td>
          </tr>
          <tr>
            <td class="rotulo">Taxa de semeadura</td>
            <td class="valor">${l.taxaSemeadura}</td>
            <td class="rotulo">Custo por ha (R$)</td>
            <td class="valor">${l.custoPorHa}</td>
          </tr>
        </tbody>
      </table>
      ${infoAdicionalHtml(l)}
    </div>
  `;
}

/**
 * Guia de Plantio impresso (via janela de impressão do navegador, mesmo padrão de
 * gerarGuiaTestePdf/gerarCatalogoPDF) — os resultados calculados por produto
 * (modo, área, taxa, custo, sacos, peso, valor e sementes/covas) e,
 * opcionalmente (o operador escolhe na hora de imprimir), o Manual de
 * Plantio (editável na Parametrização de Produtos).
 */
export function gerarGuiaPlantioPdf(linhas: LinhaGuiaPlantioPdf[], resumo: ResumoGuiaPlantioPdf | null, manual: ManualPlantio | null, incluirManual: boolean): void {
  const corpoHtml =
    linhas.length === 0
      ? `<p class="vazio">Nenhum produto no Guia de Plantio.</p>`
      : `
        ${linhas.map(blocoProduto).join('')}
        ${
          resumo && linhas.length > 1
            ? `
        <div class="resumo-geral">
          <span><strong>Total de Sacos:</strong> ${resumo.totalSacos}</span>
          <span><strong>Peso Total:</strong> ${resumo.totalPeso}</span>
          <span><strong>Valor Total:</strong> ${resumo.totalValor}</span>
        </div>`
            : ''
        }
      `;

  const dataEmissao = new Date().toLocaleDateString('pt-BR');
  const htmlCompleto = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Guia de Plantio</title>
      <style>
        @page{ margin:14mm 10mm; }
        *{ box-sizing:border-box; }
        body{
          font-family:'Inter',Arial,sans-serif; color:#000000; background:#FFFFFF;
          margin:0; padding:0 4mm;
        }
        .cabecalho{
          display:flex; justify-content:space-between; align-items:flex-start;
          border-bottom:2px solid #000000; padding-bottom:8px; margin-bottom:18px;
        }
        .cabecalho .marca{ display:flex; flex-direction:column; gap:2px; }
        .cabecalho h1{font-size:20px; font-weight:700; margin:0; letter-spacing:.3px;}
        .cabecalho .subtitulo{font-size:12.5px; font-weight:400; color:#333333; margin:0;}
        .cabecalho .meta{font-size:11px; color:#333333; text-align:right; white-space:nowrap;}

        .produto{ margin-bottom:14px; page-break-inside:avoid; }
        .produto + .produto{ margin-top:10px; padding-top:20px; border-top:1px solid #e0e0e0; }
        .produto-cabecalho{
          display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin-bottom:6px;
          border-bottom:1px solid #999999; padding-bottom:4px;
        }
        .produto-titulo{ display:flex; align-items:baseline; gap:10px; }
        .produto-nome{ font-size:14px; font-weight:700; }
        .produto-lote{ font-size:11px; color:#333333; }
        .produto-totais{ display:flex; gap:16px; font-size:11.5px; color:#333333; white-space:nowrap; }
        .produto-totais strong{ color:#000000; }
        table.tabela-resultado{ width:100%; border-collapse:collapse; font-size:12px; }
        table.tabela-resultado td{ padding:5px 8px; border:1px solid #cccccc; }
        table.tabela-resultado td.rotulo{ color:#333333; width:22%; background:#F5F5F5; }
        table.tabela-resultado td.valor{ font-weight:700; width:28%; }

        .info-linha{
          display:flex; margin-top:14px; border-top:1px solid #cccccc; border-bottom:1px solid #cccccc;
        }
        .info-item{ flex:1; padding:5px 8px; border-right:1px solid #cccccc; }
        .info-item:last-child{ border-right:none; }
        .info-rotulo{ font-size:9.5px; font-weight:700; text-transform:uppercase; color:#333333; }
        .info-valor{ font-size:12px; font-weight:700; }

        .resumo-geral{
          display:flex; gap:24px; font-size:13px; border-top:2px solid #000000;
          border-bottom:2px solid #000000; padding:8px 0; margin-top:16px;
        }

        .manual{ page-break-before:always; font-size:12.5px; line-height:1.5; }
        .manual h2{ font-size:16px; margin:0 0 10px; }
        .manual p{ margin:0 0 10px; }
        .manual .nota{
          margin-top:14px; padding:10px 12px; border:1px solid #000000; background:#F5F5F5; font-size:12px;
        }
        .vazio{ font-size:13px; color:#000000; padding:20px 0; }
      </style>
    </head>
    <body>
      <div class="cabecalho">
        <div class="marca">
          <h1>Ceará Sementes</h1>
          <p class="subtitulo">Rua Engenheiro Henrique Morize, 236, Cajazeiras, Fortaleza-CE</p>
          <p class="subtitulo">Fone/Whatsapp: (85) 3275-2074</p>
          <p class="subtitulo">Guia de Plantio</p>
        </div>
        <div class="meta">${dataEmissao}</div>
      </div>
      ${corpoHtml}
      ${incluirManual && manual ? renderManualHtml(manual) : ''}
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
