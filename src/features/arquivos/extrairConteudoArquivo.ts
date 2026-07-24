export interface ConteudoExtraido {
  /** Parágrafos e células de tabela, um por linha — usado pra achar "Rótulo: valor" (Cultivar, Safra...). */
  linhas: string[];
  /** Tabelas (linha x coluna) — só disponível pra .docx; usado pra achar o Lote (que vem em coluna de tabela, não "Rótulo: valor"). */
  tabelas: string[][][];
}

function linhaLimpa(texto: string | null | undefined): string {
  return (texto ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Converte uma <table> em matriz linha x coluna respeitando rowspan/colspan.
 * Sem isso, uma célula de cabeçalho tipo "Lote Nº" (rowspan=2, cobrindo 2
 * linhas de cabeçalho) só existe no HTML na primeira linha — a célula da
 * linha de baixo "anda" pra esquerda pra preencher o buraco, e a coluna do
 * cabeçalho não bate mais com a coluna do valor real (esse foi o bug que
 * fez o Lote virar "Nº De Embalagens": o rowspan empurrou tudo).
 */
function tabelaParaMatriz(tabela: HTMLTableElement): string[][] {
  const matriz: string[][] = [];
  // pendentes[coluna] = célula de rowspan de uma linha ANTERIOR que ainda ocupa essa coluna nesta linha.
  let pendentes: Record<number, { valor: string; restam: number }> = {};

  tabela.querySelectorAll('tr').forEach((tr) => {
    const celulas = Array.from(tr.querySelectorAll('td, th'));
    const linha: string[] = [];
    const pendentesDeEntrada = pendentes;
    const maxColPendente = Math.max(-1, ...Object.keys(pendentesDeEntrada).map(Number));
    const proximosPendentes: Record<number, { valor: string; restam: number }> = {};

    let idxCelula = 0;
    let col = 0;
    while (idxCelula < celulas.length || col <= maxColPendente) {
      const pend = pendentesDeEntrada[col];
      if (pend) {
        linha[col] = pend.valor;
        if (pend.restam - 1 > 0) proximosPendentes[col] = { valor: pend.valor, restam: pend.restam - 1 };
        col += 1;
        continue;
      }
      if (idxCelula >= celulas.length) {
        col += 1;
        continue;
      }
      const cel = celulas[idxCelula];
      const texto = linhaLimpa(cel.textContent);
      const colspan = Number(cel.getAttribute('colspan')) || 1;
      const rowspan = Number(cel.getAttribute('rowspan')) || 1;
      for (let c = 0; c < colspan; c++) {
        linha[col] = texto;
        if (rowspan > 1) proximosPendentes[col] = { valor: texto, restam: rowspan - 1 };
        col += 1;
      }
      idxCelula += 1;
    }

    matriz.push(linha);
    pendentes = proximosPendentes;
  });

  return matriz;
}

/** .docx via mammoth (roda no navegador, sem servidor) — preserva parágrafos/tabelas como HTML, que aqui viram texto plano. */
async function extrairDoDocx(arquivo: File): Promise<ConteudoExtraido> {
  const mammoth = await import('mammoth');
  const buffer = await arquivo.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const linhas: string[] = [];
  doc.querySelectorAll('p').forEach((p) => {
    const texto = linhaLimpa(p.textContent);
    if (texto) linhas.push(texto);
  });

  const tabelas: string[][][] = [];
  doc.querySelectorAll('table').forEach((tabela) => {
    const matriz = tabelaParaMatriz(tabela);
    matriz.forEach((linha) => linhas.push(...linha.filter(Boolean)));
    tabelas.push(matriz);
  });

  return { linhas, tabelas };
}

/** PDF via pdfjs-dist — só funciona se o PDF tiver camada de texto real (não foto/scan). Não reconstrói tabelas, só linhas de texto. */
async function extrairDoPdf(arquivo: File): Promise<ConteudoExtraido> {
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await arquivo.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const linhas: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const pagina = await pdf.getPage(i);
    const conteudo = await pagina.getTextContent();
    let linhaAtual = '';
    let yAnterior: number | null = null;
    for (const item of conteudo.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (yAnterior !== null && Math.abs(y - yAnterior) > 2) {
        const texto = linhaLimpa(linhaAtual);
        if (texto) linhas.push(texto);
        linhaAtual = '';
      }
      linhaAtual += `${item.str} `;
      yAnterior = y;
    }
    const ultima = linhaLimpa(linhaAtual);
    if (ultima) linhas.push(ultima);
  }

  return { linhas, tabelas: [] };
}

/** null = formato sem suporte (.doc antigo, imagem...) ou falha na leitura — quem chama cai pro nome do arquivo como fallback. */
export async function extrairConteudoArquivo(arquivo: File): Promise<ConteudoExtraido | null> {
  const nome = arquivo.name.toLowerCase();
  try {
    if (nome.endsWith('.docx')) return await extrairDoDocx(arquivo);
    if (nome.endsWith('.pdf')) return await extrairDoPdf(arquivo);
  } catch {
    return null;
  }
  return null;
}
