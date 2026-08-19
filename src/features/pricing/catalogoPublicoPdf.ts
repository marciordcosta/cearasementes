// Import só de tipo — jsPDF só entra no bundle de verdade na hora do clique (import dinâmico lá
// embaixo, mesmo padrão de etiquetaFretePdf.ts), não no carregamento inicial da página pública.
import type { jsPDF } from 'jspdf';
import { gerarQrCodeSvg } from './catalogoPdf';
import { chaveComparacaoProduto } from './calculations';

const LINK_CATALOGO = 'https://linktr.ee/cearasementes';

export interface ItemCatalogoPublicoPdf {
  nome: string;
  categoriaNome: string;
  fornecedorNome: string | null;
  preco: number;
  peso: number;
  /** Usado pra agrupar "mesmo produto" (ver chaveComparacaoProduto) — prioriza Cultivar cadastrado, sem Categoria/Classe interferindo. */
  cultivar: string | null;
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

export interface ItemCatalogoPublicoPdfDetalhado extends ItemCatalogoPublicoPdf {
  plantioVc: number | null;
  plantioPmsManual: string | null;
  plantioValidade: string | null;
  /** Já combinado (Canal.mostrarDetalhesPlantio && Produto.mostrarDetalhesCatalogo) pelo chamador — mesma regra do card na tela (ver LinhaProduto em CatalogoPublicoPage.tsx). */
  mostrarDetalhes: boolean;
}

/**
 * Rasteriza o QR code (SVG, ver gerarQrCodeSvg) num PNG (data URL) — jsPDF só sabe desenhar
 * imagem raster (`addImage`), não SVG. `document`/`Image`/`canvas` só existem em navegador (nunca
 * roda em build/SSR), coerente com o resto desse arquivo (chamado só no clique do usuário).
 */
export function svgParaPngDataUrl(svg: string, tamanhoPx: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = tamanhoPx;
      canvas.height = tamanhoPx;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas indisponível'));
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, tamanhoPx, tamanhoPx);
      ctx.drawImage(img, 0, 0, tamanhoPx, tamanhoPx);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Falha ao carregar o QR code'));
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  });
}

/**
 * Nome com `*negrito*`/`_itálico_` (mesma marcação do NomeComDestaque.tsx) desenhado com estilo de
 * fonte de verdade, não HTML — calcula a largura total primeiro; cabendo numa linha só (o caso mais
 * comum), desenha os trechos um atrás do outro com o estilo certo. Nome comprido demais pra uma
 * linha cai pro texto plano (sem marcação) quebrado em várias linhas via splitTextToSize — melhor
 * legível sem destaque do que cortado tentando manter o destaque. Devolve quantas linhas ocupou.
 */
export function desenharNomeComDestaque(doc: jsPDF, nome: string, x: number, y: number, larguraMax: number, tamanhoFonte: number): number {
  const regex = /\*(.+?)\*|_(.+?)_/g;
  const segmentos: { texto: string; estilo: 'bold' | 'italic' | 'normal' }[] = [];
  let ultimoIndice = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(nome)) !== null) {
    if (match.index > ultimoIndice) segmentos.push({ texto: nome.slice(ultimoIndice, match.index), estilo: 'normal' });
    segmentos.push({ texto: (match[1] ?? match[2])!, estilo: match[1] !== undefined ? 'bold' : 'italic' });
    ultimoIndice = regex.lastIndex;
  }
  if (ultimoIndice < nome.length) segmentos.push({ texto: nome.slice(ultimoIndice), estilo: 'normal' });

  doc.setFontSize(tamanhoFonte);
  const larguraTotal = segmentos.reduce((soma, seg) => {
    doc.setFont('helvetica', seg.estilo === 'normal' ? 'normal' : seg.estilo);
    return soma + doc.getTextWidth(seg.texto);
  }, 0);

  if (larguraTotal <= larguraMax) {
    let cursorX = x;
    segmentos.forEach((seg) => {
      doc.setFont('helvetica', seg.estilo === 'normal' ? 'normal' : seg.estilo);
      doc.text(seg.texto, cursorX, y);
      cursorX += doc.getTextWidth(seg.texto);
    });
    doc.setFont('helvetica', 'normal');
    return 1;
  }

  doc.setFont('helvetica', 'normal');
  const linhas: string[] = doc.splitTextToSize(nome.replace(/[*_]/g, ''), larguraMax);
  doc.text(linhas, x, y);
  return linhas.length;
}

/**
 * Catálogo em PDF de verdade (jsPDF, ver gerarEtiquetaFretePdf em etiquetaFretePdf.ts pro mesmo
 * padrão) — ÚNICO gerador do Catálogo Online público, usado tanto por "Salvar em PDF" quanto por
 * "Enviar por WhatsApp" (ModalConcluir em CatalogoPublicoPage.tsx); antes eram dois caminhos
 * diferentes (uma janela de impressão só pra salvar, sem detalhes de plantio), unificados aqui
 * porque o WhatsApp precisa de um arquivo de verdade pro cliente anexar na conversa, algo que
 * window.print() não permite — então esse virou o padrão dos dois. Nunca recalcula nada, nunca vê
 * Custo/Margem: só o snapshot já publicado (ver fetchCatalogoPublicoPorSlug). Grade compacta, o
 * mais próxima possível do catálogo "oficial" da Precificação (ver gerarCatalogoGerenciamentoPDF em
 * catalogoPdf.ts) — o cabeçalho (marca + QR), o agrupamento "colado" por produto (ver
 * chaveComparacaoProduto) e o destaque em negrito do nome seguem o mesmo padrão.
 */
export async function gerarCatalogoPublicoPdfBlob(canalNome: string, itens: ItemCatalogoPublicoPdfDetalhado[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const f = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(0);
  doc.text('Ceará Sementes', PDF_MARGEM, PDF_MARGEM);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text('Rua Engenheiro Henrique Morize, 236, Cajazeiras, Fortaleza-CE', PDF_MARGEM, PDF_MARGEM + 5);
  doc.text('Fone/Whatsapp: (85) 3275-2074', PDF_MARGEM, PDF_MARGEM + 9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(canalNome, PDF_MARGEM, PDF_MARGEM + 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(new Date().toLocaleDateString('pt-BR'), PDF_LARGURA - PDF_MARGEM, PDF_MARGEM, { align: 'right' });

  const qrTamanho = 16;
  let alturaDireita = 0;
  try {
    const qrDataUrl = await svgParaPngDataUrl(gerarQrCodeSvg(LINK_CATALOGO), 120);
    doc.addImage(qrDataUrl, 'PNG', PDF_LARGURA - PDF_MARGEM - qrTamanho, PDF_MARGEM + 2, qrTamanho, qrTamanho);
    doc.setFontSize(6.5);
    doc.text('linktr.ee/cearasementes', PDF_LARGURA - PDF_MARGEM - qrTamanho / 2, PDF_MARGEM + 2 + qrTamanho + 3, { align: 'center' });
    alturaDireita = 2 + qrTamanho + 3;
  } catch {
    // QR é só um extra visual — se rasterizar falhar por qualquer motivo, segue sem ele.
  }

  let y = PDF_MARGEM + Math.max(13, alturaDireita) + 4;
  doc.setTextColor(0);
  doc.setDrawColor(0);
  doc.line(PDF_MARGEM, y, PDF_LARGURA - PDF_MARGEM, y);
  y += 8;

  const categoriasPresentes = new Map<string, ItemCatalogoPublicoPdfDetalhado[]>();
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

  // Grade mais compacta — o mais próximo possível do catálogo "oficial" (ver gerarCatalogoGerenciamentoPDF
  // em catalogoPdf.ts): fonte menor, linhas mais próximas. `alturaLinhaTexto` espelha o espaçamento de
  // linha DE VERDADE que o jsPDF usa por baixo dos panos (fator 1.15, padrão da lib) — usar esse valor
  // exato pra posicionar tudo que vem depois do nome é o que evita a linha separadora (ou o fornecedor)
  // cortando o texto quando um nome comprido quebra em 2+ linhas.
  const FONTE_NOME = 9.5;
  const FONTE_INFO = 7.5;
  const alturaLinhaTexto = (fontePt: number) => fontePt * 0.3527 * 1.15;
  const ALTURA_LINHA_NOME = alturaLinhaTexto(FONTE_NOME);
  const ALTURA_LINHA_INFO = alturaLinhaTexto(FONTE_INFO);
  const GAP_ITEM = 1.8; // respiro padrão entre um item e o próximo (mesma cultivar, "colados")
  const GAP_DIVISOR = 1.4; // respiro de cada lado da linha que separa cultivares diferentes

  categoriasOrdenadas.forEach((cat) => {
    if (y > PDF_Y_LIMITE - 12) y = pdfNovaPagina(doc);
    doc.setFillColor(239, 239, 239);
    doc.rect(PDF_MARGEM, y - 4, PDF_LARGURA_UTIL, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0);
    doc.text(cat.toUpperCase(), PDF_MARGEM + 2, y);
    y += 6;

    const itensCat = [...(categoriasPresentes.get(cat) ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    itensCat.forEach((item, indice) => {
      // Mesmo critério "colado" do catálogo oficial e da grade interna (ver chaveComparacaoProduto em
      // calculations.ts) — variantes do mesmo produto (fornecedor/tratamento) ficam juntas, sem
      // espaço extra entre elas; produto DIFERENTE do anterior ganha uma linha fina separando, com
      // respiro reservado ANTES de desenhar (nunca em cima do texto do item anterior ou deste).
      const produtoMudou = indice > 0 && chaveComparacaoProduto(item) !== chaveComparacaoProduto(itensCat[indice - 1]);
      if (produtoMudou) y += GAP_DIVISOR;
      if (y > PDF_Y_LIMITE - 10) y = pdfNovaPagina(doc);
      if (produtoMudou) {
        doc.setDrawColor(150);
        doc.line(PDF_MARGEM, y - GAP_DIVISOR / 2, PDF_LARGURA - PDF_MARGEM, y - GAP_DIVISOR / 2);
        y += GAP_DIVISOR;
      }

      doc.setTextColor(0);
      const larguraNome = PDF_LARGURA_UTIL - 40;
      const linhasNome = desenharNomeComDestaque(doc, item.nome, PDF_MARGEM, y, larguraNome, FONTE_NOME);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(FONTE_NOME);
      doc.text(`R$ ${f(item.preco)}`, PDF_LARGURA - PDF_MARGEM, y, { align: 'right' });

      // Fornecedor logo abaixo do nome, sem espaço nenhum (colado na última linha do nome) — Peso vai
      // na mesma linha, alinhado à direita. Sem Fornecedor/VC%/PMS/Validade, ainda assim mostra o Peso
      // aqui — mantém sempre a mesma estrutura de 2 linhas por item, previsível.
      const yInfo = y + linhasNome * ALTURA_LINHA_NOME;
      const infoPartes = [
        item.fornecedorNome,
        item.mostrarDetalhes && item.plantioVc != null ? `VC ${Math.round(item.plantioVc)}%` : null,
        item.mostrarDetalhes && item.plantioPmsManual ? `PMS ${item.plantioPmsManual}` : null,
        item.mostrarDetalhes && item.plantioValidade ? `Val. ${item.plantioValidade}` : null,
      ].filter((parte): parte is string => !!parte);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(FONTE_INFO);
      doc.setTextColor(120);
      if (infoPartes.length > 0) doc.text(infoPartes.join('   ·   '), PDF_MARGEM, yInfo);
      doc.text(`${Math.round(item.peso)}kg`, PDF_LARGURA - PDF_MARGEM, yInfo, { align: 'right' });

      const alturaTotalItem = linhasNome * ALTURA_LINHA_NOME + ALTURA_LINHA_INFO;
      doc.setTextColor(0);
      doc.setDrawColor(225);
      doc.line(PDF_MARGEM, y + alturaTotalItem + 0.6, PDF_LARGURA - PDF_MARGEM, y + alturaTotalItem + 0.6);
      y += alturaTotalItem + 0.6 + GAP_ITEM;
    });
    y += 2;
  });

  return doc.output('blob');
}
