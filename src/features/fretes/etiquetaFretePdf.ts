// Import só de tipo — jsPDF (que arrasta html2canvas/dompurify junto, uns 350kb) só entra
// no bundle de verdade na hora do clique (import dinâmico lá embaixo), não no carregamento
// inicial do app pra quem nunca usa "Imprimir Etiquetas".
import type { jsPDF } from 'jspdf';
import type { NotaEtiqueta } from './types';

/** Uma cidade da cotação com as NFs (uma ou mais) a etiquetar pra ela. */
export interface GrupoEtiquetaFrete {
  /** "Nome, UF" (como fica salvo na lista de cidades da cotação) ou só "Nome". */
  cidade: string;
  notas: NotaEtiqueta[];
}

const LARGURA_MM = 100;
const ALTURA_MM = 30;
const MARGEM_X = 4;
const MARGEM_Y = 3;
const FONTE_ROTULO = 7;
const FONTE_VALOR_MAX = 20;
const FONTE_VALOR_MIN = 10;
/** Largura reservada pro valor da DIREITA (UF/VOL) — mais estreita, evita disputa de espaço com o da esquerda. */
const LARGURA_DIREITA = 22;

/** "Fortaleza, CE" -> { cidade: "Fortaleza", uf: "CE" }; sem vírgula, UF fica vazia. */
function separarCidadeUf(cidadeCompleta: string): { cidade: string; uf: string } {
  const partes = cidadeCompleta.split(',');
  if (partes.length < 2) return { cidade: cidadeCompleta.trim(), uf: '' };
  return { cidade: partes[0].trim(), uf: partes.slice(1).join(',').trim() };
}

/**
 * Reduz o tamanho da fonte até o texto caber em `larguraMax` (nunca abaixo de
 * FONTE_VALOR_MIN); se mesmo assim não couber, corta com "…". Evita que um
 * nome de cidade comprido invada a coluna do valor vizinho (mesmo espírito do
 * `text-overflow:ellipsis` que a versão em HTML/print usava).
 */
function ajustarParaCaber(doc: jsPDF, texto: string, larguraMax: number): { texto: string; fonte: number } {
  let fonte = FONTE_VALOR_MAX;
  doc.setFontSize(fonte);
  while (fonte > FONTE_VALOR_MIN && doc.getTextWidth(texto) > larguraMax) {
    fonte -= 1;
    doc.setFontSize(fonte);
  }
  if (doc.getTextWidth(texto) <= larguraMax) return { texto, fonte };
  let cortado = texto;
  while (cortado.length > 1 && doc.getTextWidth(`${cortado}…`) > larguraMax) {
    cortado = cortado.slice(0, -1);
  }
  return { texto: `${cortado}…`, fonte };
}

interface ItemEtiqueta {
  cidade: string;
  uf: string;
  nf: string;
  volumeAtual: number;
  volumeTotal: number;
}

function desenharEtiqueta(doc: jsPDF, etiqueta: ItemEtiqueta): void {
  const larguraEsquerda = LARGURA_MM - MARGEM_X * 2 - LARGURA_DIREITA - 3;
  const xEsquerda = MARGEM_X;
  const xDireita = LARGURA_MM - MARGEM_X;
  const yRotulo1 = MARGEM_Y + 3;
  const yValor1 = yRotulo1 + 6.5;
  const yRotulo2 = ALTURA_MM - MARGEM_Y - 8;
  const yValor2 = yRotulo2 + 6.5;

  doc.setFont('helvetica', 'bold');

  doc.setFontSize(FONTE_ROTULO);
  doc.text('Cidade:', xEsquerda, yRotulo1);
  doc.text('UF:', xDireita, yRotulo1, { align: 'right' });
  doc.text('NF:', xEsquerda, yRotulo2);
  doc.text('VOL:', xDireita, yRotulo2, { align: 'right' });

  const cidadeAjustada = ajustarParaCaber(doc, etiqueta.cidade, larguraEsquerda);
  doc.setFontSize(cidadeAjustada.fonte);
  doc.text(cidadeAjustada.texto, xEsquerda, yValor1);

  const nfAjustado = ajustarParaCaber(doc, etiqueta.nf, larguraEsquerda);
  doc.setFontSize(nfAjustado.fonte);
  doc.text(nfAjustado.texto, xEsquerda, yValor2);

  doc.setFontSize(FONTE_VALOR_MAX);
  doc.text(etiqueta.uf, xDireita, yValor1, { align: 'right' });
  doc.text(`${etiqueta.volumeAtual}/${etiqueta.volumeTotal}`, xDireita, yValor2, { align: 'right' });
}

/**
 * Gera as etiquetas de expedição como um PDF de verdade (jsPDF), aberto numa
 * nova aba — troca a técnica antiga (janela de impressão HTML via
 * `window.print()`) porque o navegador só oferece, no diálogo de impressão,
 * os tamanhos de papel que o DRIVER da impressora já tem cadastrados; um PDF
 * real carrega o tamanho da página embutido no próprio arquivo, então
 * imprime certo mesmo sem esse tamanho custom estar configurado no driver.
 * Uma etiqueta física por VOLUME: uma NF com 50 volumes vira 50 páginas
 * "1/50", "2/50"... "50/50". Entre uma NF e a próxima (mesma cidade ou não),
 * entra uma etiqueta EM BRANCO como separador físico — ajuda a achar onde
 * uma nota termina e a próxima começa na pilha impressa. Etiqueta física
 * padrão de frete: 100mm (largura) x 30mm (altura).
 */
export async function gerarEtiquetaFretePdf(grupos: GrupoEtiquetaFrete[]): Promise<void> {
  const blocosPorNota = grupos.flatMap(({ cidade, notas }) => {
    const { cidade: nomeCidade, uf } = separarCidadeUf(cidade);
    return notas.map((nota) => ({
      cidade: nomeCidade,
      uf,
      nf: nota.nf,
      volumes: Array.from({ length: nota.volumes }, (_, i) => ({ volumeAtual: i + 1, volumeTotal: nota.volumes })),
    }));
  });

  // `null` = etiqueta em branco (separador) — uma antes de cada NF, exceto a primeira.
  const paginas: (ItemEtiqueta | null)[] = blocosPorNota.flatMap((bloco, indice) => [
    ...(indice > 0 ? [null] : []),
    ...bloco.volumes.map((v): ItemEtiqueta => ({ cidade: bloco.cidade, uf: bloco.uf, nf: bloco.nf, ...v })),
  ]);

  if (paginas.length === 0) return;

  // Abre a aba JÁ aqui, ainda de forma síncrona dentro do clique do usuário — se isso
  // rodasse só depois do `await import('jspdf')`, o navegador não reconhece mais o
  // window.open() como consequência direta do clique e bloqueia a aba silenciosamente
  // (sem disparar o aviso de pop-up bloqueado, e sem abrir nada).
  const janela = window.open('', '_blank');
  if (!janela) {
    alert('O navegador bloqueou a abertura da aba com o PDF. Permita pop-ups para este site e tente novamente.');
    return;
  }

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [LARGURA_MM, ALTURA_MM] });
  paginas.forEach((pagina, indice) => {
    if (indice > 0) doc.addPage([LARGURA_MM, ALTURA_MM], 'landscape');
    if (pagina) desenharEtiqueta(doc, pagina);
  });

  const url = URL.createObjectURL(doc.output('blob'));
  janela.location.href = url;
}
