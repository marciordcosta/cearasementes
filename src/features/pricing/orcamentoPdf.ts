// Import só de tipo — jsPDF só entra no bundle de verdade na hora do clique (import dinâmico lá
// embaixo), mesmo padrão de catalogoPublicoPdf.ts/etiquetaFretePdf.ts.
import type { jsPDF } from 'jspdf';
import { desenharNomeComDestaque } from './catalogoPublicoPdf';

export interface ItemOrcamentoPdf {
  nome: string;
  qtd: number;
  precoUnitario: number;
  subtotal: number;
}

function f(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PDF_MARGEM = 15;
const PDF_LARGURA = 210;
const PDF_ALTURA = 297;
const PDF_Y_LIMITE = PDF_ALTURA - PDF_MARGEM;

function pdfNovaPagina(doc: jsPDF): number {
  doc.addPage();
  return PDF_MARGEM;
}

/**
 * Orçamento montado pelo cliente no Catálogo Online (ver CatalogoPublicoPage.tsx) como um arquivo
 * PDF de verdade (jsPDF, mesmo padrão de gerarCatalogoPublicoPdfBlob) — necessário pro fluxo de
 * "Enviar pedido": depois de mandar o texto no WhatsApp, o sistema oferece anexar esse PDF também
 * (compartilhamento nativo com fallback de baixar+anexar manualmente) ou só salvar o arquivo. Nunca
 * gravado em lugar nenhum, só gerado na hora do clique. `freteDescricao` já vem pronto de
 * descreverFrete() — cobre cotação/não calculado/valor calculado. `pagamentoDescricao` (opcional) =
 * forma de pagamento escolhida no modal de Pagamento (À vista com desconto, ou Boleto parcelado) —
 * null/undefined quando a Tabela não tem pagamento configurado.
 */
export async function gerarOrcamentoPdfBlob(
  canalNome: string,
  itens: ItemOrcamentoPdf[],
  freteDescricao: string,
  total: number,
  pagamentoDescricao?: string | null,
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(0);
  doc.text('Ceará Sementes', PDF_MARGEM, PDF_MARGEM);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Orçamento — ${canalNome}`, PDF_MARGEM, PDF_MARGEM + 6);

  doc.setFontSize(9);
  doc.text(new Date().toLocaleDateString('pt-BR'), PDF_LARGURA - PDF_MARGEM, PDF_MARGEM, { align: 'right' });

  let y = PDF_MARGEM + 12;
  doc.setDrawColor(0);
  doc.line(PDF_MARGEM, y, PDF_LARGURA - PDF_MARGEM, y);
  y += 8;

  const xQtd = PDF_LARGURA - PDF_MARGEM - 60;
  const xUnit = PDF_LARGURA - PDF_MARGEM - 38;
  const xSubtotal = PDF_LARGURA - PDF_MARGEM;
  const larguraNome = xQtd - PDF_MARGEM - 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text('Produto', PDF_MARGEM, y);
  doc.text('Qtd.', xQtd, y, { align: 'right' });
  doc.text('Unit. (R$)', xUnit, y, { align: 'right' });
  doc.text('Subtotal (R$)', xSubtotal, y, { align: 'right' });
  y += 2;
  doc.setDrawColor(0);
  doc.line(PDF_MARGEM, y, PDF_LARGURA - PDF_MARGEM, y);
  y += 6;

  itens.forEach((item) => {
    if (y > PDF_Y_LIMITE - 8) y = pdfNovaPagina(doc);
    doc.setTextColor(0);
    const linhasNome = desenharNomeComDestaque(doc, item.nome, PDF_MARGEM, y, larguraNome, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(String(item.qtd), xQtd, y, { align: 'right' });
    doc.text(`R$ ${f(item.precoUnitario)}`, xUnit, y, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(`R$ ${f(item.subtotal)}`, xSubtotal, y, { align: 'right' });
    const alturaLinha = Math.max(linhasNome * 4.5, 6);
    doc.setDrawColor(220);
    doc.line(PDF_MARGEM, y + alturaLinha - 2, PDF_LARGURA - PDF_MARGEM, y + alturaLinha - 2);
    y += alturaLinha + 3;
  });

  y += 3;
  if (y > PDF_Y_LIMITE - 20) y = pdfNovaPagina(doc);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text('Frete', PDF_MARGEM, y);
  doc.text(freteDescricao, PDF_LARGURA - PDF_MARGEM, y, { align: 'right' });
  y += 6;

  if (pagamentoDescricao) {
    doc.text('Pagamento', PDF_MARGEM, y);
    doc.text(pagamentoDescricao, PDF_LARGURA - PDF_MARGEM, y, { align: 'right' });
    y += 6;
  }

  doc.setDrawColor(0);
  doc.line(PDF_MARGEM, y, PDF_LARGURA - PDF_MARGEM, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Total', PDF_MARGEM, y);
  doc.text(`R$ ${f(total)}`, PDF_LARGURA - PDF_MARGEM, y, { align: 'right' });

  return doc.output('blob');
}
