// Import só de tipo — jsPDF só entra no bundle de verdade na hora do clique (import dinâmico lá
// embaixo, mesmo padrão de etiquetaFretePdf.ts), não no carregamento inicial da página pública.
import type { jsPDF } from 'jspdf';
import { abrirEImprimir, escapeHtml, gerarQrCodeSvg, nomeComDestaqueHtml } from './catalogoPdf';
import { chaveComparacaoNome } from './calculations';

const LINK_CATALOGO = 'https://linktr.ee/cearasementes';

export interface ItemCatalogoPublicoPdf {
  nome: string;
  categoriaNome: string;
  fornecedorNome: string | null;
  preco: number;
  peso: number;
}

/** Igual tamanhoNomeCh em catalogoPdf.ts, só que a partir de texto solto (nome/fornecedor) em vez de `Produto`/`Fornecedor` — aqui só temos o snapshot já publicado. */
function tamanhoNomeCh(nome: string, fornecedorNome: string | null): number {
  let ch = nome.replace(/[*_]/g, '').length * 1.05;
  if (fornecedorNome) ch += fornecedorNome.replace(/[*_]/g, '').length * 0.65 + 2;
  return ch;
}

/**
 * Catálogo em PDF (via janela de impressão) pro Catálogo Online PÚBLICO — mesmo layout/estilo do
 * catálogo "padrão" gerado de dentro da Precificação (ver gerarCatalogoPDF em catalogoPdf.ts), só
 * que a partir do snapshot já publicado (nome/categoria/fornecedor/preço/peso, ver
 * fetchCatalogoPublicoPorSlug) — nunca recalcula nada, nunca vê Custo/Margem. `itens` já vem
 * filtrado pela busca/categoria que o visitante tiver aplicado na tela (mesmo princípio do
 * catálogo interno, que também respeita o filtro já aplicado).
 */
export function gerarCatalogoPublicoPdf(canalNome: string, itens: ItemCatalogoPublicoPdf[]): void {
  const categoriasPresentes = new Map<string, ItemCatalogoPublicoPdf[]>();
  itens.forEach((item) => {
    const lista = categoriasPresentes.get(item.categoriaNome) ?? [];
    lista.push(item);
    categoriasPresentes.set(item.categoriaNome, lista);
  });

  const categoriasOrdenadas = Array.from(categoriasPresentes.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const larguraProdutoCh = Math.ceil(Math.max(4, ...itens.map((i) => tamanhoNomeCh(i.nome, i.fornecedorNome))) + 2);

  const f = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let corpoHtml = '';
  categoriasOrdenadas.forEach((cat) => {
    const itensCat = [...(categoriasPresentes.get(cat) ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    let linhas = '';
    itensCat.forEach((item, indice) => {
      const tagFornecedor = item.fornecedorNome ? ` <span class="tag-fornecedor">${escapeHtml(item.fornecedorNome)}</span>` : '';
      const produtoMudou = indice > 0 && chaveComparacaoNome(item.nome) !== chaveComparacaoNome(itensCat[indice - 1].nome);
      linhas += `
        <tr class="${produtoMudou ? 'divisor' : ''}">
          <td>${nomeComDestaqueHtml(item.nome)}${tagFornecedor}</td>
          <td class="valor">R$ ${f(item.preco)}</td>
          <td class="peso">${Math.round(item.peso)}kg</td>
        </tr>
      `;
    });

    corpoHtml += `
      <h2 class="cat-titulo">${escapeHtml(cat)}</h2>
      <table class="tabela-catalogo">
        <thead>
          <tr><th>Produto</th><th class="valor">Valor (R$)</th><th class="peso">Peso (Kg)</th></tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    `;
  });

  if (categoriasOrdenadas.length === 0) {
    corpoHtml = `<p class="vazio">Nenhum produto encontrado para o filtro atual.</p>`;
  }

  const dataEmissao = new Date().toLocaleDateString('pt-BR');
  const htmlCompleto = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Catálogo — ${escapeHtml(canalNome)}</title>
      <style>
        @page{ margin:18mm 14mm; }
        *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; color-adjust:exact; }
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
        .cabecalho .lado-direito{ display:flex; align-items:flex-start; gap:12px; }
        .cabecalho .meta{font-size:11px; color:#333333; text-align:right; line-height:1.5; white-space:nowrap;}
        .cabecalho .qrcode{ display:flex; flex-direction:column; align-items:center; gap:2px; }
        .cabecalho .qrcode svg{ width:50px; height:50px; }
        .cabecalho .qrcode p{ font-size:7.5px; color:#333333; margin:0; white-space:nowrap; }
        .cat-titulo{
          font-size:13.5px; text-transform:uppercase; letter-spacing:.6px;
          background:#EFEFEF; color:#000000; padding:7px 10px; margin:20px 0 0;
          border-left:4px solid #000000; page-break-after:avoid;
        }
        table.tabela-catalogo{
          width:auto; max-width:100%; border-collapse:collapse; font-size:12px; margin:0 0 4px;
        }
        table.tabela-catalogo thead th{
          text-align:left; padding:7px 10px; border-bottom:1px solid #000000;
          font-weight:700; color:#000000; white-space:nowrap;
        }
        table.tabela-catalogo tbody td{
          padding:6px 10px; border-bottom:1px solid #CCCCCC; color:#000000;
        }
        table.tabela-catalogo tbody tr{ page-break-inside:avoid; }
        table.tabela-catalogo tbody tr.divisor td{ border-top:2px solid #888888; }
        table.tabela-catalogo th:first-child, table.tabela-catalogo td:first-child{ min-width:${larguraProdutoCh}ch; }
        table.tabela-catalogo th.valor, table.tabela-catalogo td.valor{ width:80px; padding-right:4px; text-align:right; font-weight:700; }
        table.tabela-catalogo th.peso, table.tabela-catalogo td.peso{ width:50px; padding-left:4px; text-align:right; }
        .tag-fornecedor{
          display:inline-block; margin-left:8px; font-size:9px; font-weight:500; color:#777777;
          text-transform:uppercase; letter-spacing:.3px; vertical-align:middle;
        }
        .vazio{ font-size:13px; color:#000000; padding:20px 0; }
        .rodape{
          margin-top:24px; padding-top:10px; border-top:1px solid #CCCCCC;
          page-break-inside:avoid;
        }
        .rodape .titulo{ font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; color:#000000; margin:0 0 3px; }
        .rodape p{ font-size:10.5px; color:#555555; margin:0; }
        @media print{
          .cabecalho{ position:running(head); }
        }
      </style>
    </head>
    <body>
      <div class="cabecalho">
        <div class="marca">
          <h1>Ceará Sementes</h1>
          <p class="subtitulo">Rua Engenheiro Henrique Morize, 236, Cajazeiras, Fortaleza-CE</p>
          <p class="subtitulo">Fone/Whatsapp: (85) 3275-2074</p>
          <p class="subtitulo">${escapeHtml(canalNome)}</p>
        </div>
        <div class="lado-direito">
          <div class="meta">${dataEmissao}</div>
          <div class="qrcode">
            ${gerarQrCodeSvg(LINK_CATALOGO)}
            <p>linktr.ee/cearasementes</p>
          </div>
        </div>
      </div>
      ${corpoHtml}
      <div class="rodape">
        <p class="titulo">Atenção</p>
        <p>Os valores podem ser alterados sem aviso prévio, tabela válida por 15 dias ou até durar o estoque (lote em questão).</p>
      </div>
    </body>
    </html>
  `;

  abrirEImprimir(htmlCompleto);
}

const PDF_MARGEM = 15;
const PDF_LARGURA = 210;
const PDF_ALTURA = 297;
const PDF_Y_LIMITE = PDF_ALTURA - PDF_MARGEM;
const PDF_LARGURA_UTIL = PDF_LARGURA - PDF_MARGEM * 2;

function pdfNovaPagina(doc: jsPDF): number {
  doc.addPage();
  return PDF_MARGEM;
}

/**
 * Mesmos dados de gerarCatalogoPublicoPdf, mas como um arquivo PDF de verdade (jsPDF, ver
 * gerarEtiquetaFretePdf em etiquetaFretePdf.ts pro mesmo padrão) em vez de uma janela de impressão
 * — necessário pra "Enviar por WhatsApp" (ModalNumeroWhatsApp em CatalogoPublicoPage.tsx), que
 * precisa baixar um arquivo de verdade pro cliente anexar na conversa, algo que window.print() não
 * permite. Layout mais simples que o catálogo "oficial" (sem QR code/cabeçalho de marca) — aqui o
 * objetivo é só um PDF funcional, legível, rápido de gerar.
 */
export async function gerarCatalogoPublicoPdfBlob(canalNome: string, itens: ItemCatalogoPublicoPdf[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const f = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let y = PDF_MARGEM;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Ceará Sementes', PDF_MARGEM, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(new Date().toLocaleDateString('pt-BR'), PDF_LARGURA - PDF_MARGEM, y, { align: 'right' });
  y += 6;
  doc.setFontSize(11);
  doc.text(canalNome, PDF_MARGEM, y);
  doc.setTextColor(0);
  y += 4;
  doc.setDrawColor(0);
  doc.line(PDF_MARGEM, y, PDF_LARGURA - PDF_MARGEM, y);
  y += 8;

  const categoriasPresentes = new Map<string, ItemCatalogoPublicoPdf[]>();
  itens.forEach((item) => {
    const lista = categoriasPresentes.get(item.categoriaNome) ?? [];
    lista.push(item);
    categoriasPresentes.set(item.categoriaNome, lista);
  });
  const categoriasOrdenadas = Array.from(categoriasPresentes.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  if (categoriasOrdenadas.length === 0) {
    doc.setFontSize(11);
    doc.text('Nenhum produto encontrado para o filtro atual.', PDF_MARGEM, y);
  }

  categoriasOrdenadas.forEach((cat) => {
    if (y > PDF_Y_LIMITE - 14) y = pdfNovaPagina(doc);
    doc.setFillColor(239, 239, 239);
    doc.rect(PDF_MARGEM, y - 4.5, PDF_LARGURA_UTIL, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(cat.toUpperCase(), PDF_MARGEM + 2, y);
    y += 7;

    const itensCat = [...(categoriasPresentes.get(cat) ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    itensCat.forEach((item) => {
      if (y > PDF_Y_LIMITE - 8) y = pdfNovaPagina(doc);
      const nomeLimpo = item.nome.replace(/[*_]/g, '');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(0);
      const linhasNome = doc.splitTextToSize(nomeLimpo, PDF_LARGURA_UTIL - 45);
      doc.text(linhasNome, PDF_MARGEM, y);
      doc.setFont('helvetica', 'bold');
      doc.text(`R$ ${f(item.preco)}`, PDF_LARGURA - PDF_MARGEM, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`${Math.round(item.peso)}kg`, PDF_LARGURA - PDF_MARGEM, y + 4, { align: 'right' });
      let alturaLinha = linhasNome.length * 4.5;
      if (item.fornecedorNome) {
        doc.setFontSize(8);
        doc.text(item.fornecedorNome, PDF_MARGEM, y + alturaLinha + 3);
        alturaLinha += 4;
      }
      doc.setTextColor(0);
      alturaLinha = Math.max(alturaLinha, 8);
      doc.setDrawColor(220);
      doc.line(PDF_MARGEM, y + alturaLinha, PDF_LARGURA - PDF_MARGEM, y + alturaLinha);
      y += alturaLinha + 4;
    });
    y += 3;
  });

  return doc.output('blob');
}
