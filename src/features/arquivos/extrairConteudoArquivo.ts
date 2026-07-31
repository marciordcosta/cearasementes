export interface ConteudoExtraido {
  /** Parágrafos e células de tabela, um por linha — usado pra achar "Rótulo: valor" (Cultivar, Safra...). */
  linhas: string[];
  /** Tabelas (linha x coluna), reais (.docx) ou reconstruídas por posição (.pdf) — usado pra achar Lote/Validade/Pureza/Germinação (vêm em coluna de tabela, não "Rótulo: valor"). */
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

interface ItemPosicionado {
  x: number;
  y: number;
  texto: string;
}

/** Só reconhece o INÍCIO do bloco tabular de verdade (boletim de análise) — o resto da página (cabeçalho/identificação) é texto corrido livre, sem colunas reais, e só atrapalha a clusterização de X se entrar na conta. */
const REGEX_INICIO_TABELA = /\blote\b|\bboletim\b|\bvalidade\b|\bgermina[çc][ãa]o\b|\bpuras?\b/i;

/**
 * Boletins de análise de sementes trazem Lote/Validade/Pureza/Germinação
 * numa tabela visual (cabeçalho numa posição X, valor bem abaixo na MESMA
 * posição X) — sem nenhuma marcação real de tabela no PDF (é só texto solto
 * posicionado por coordenada), igual ao relatório matricial do Sistema (Max-
 * Manager) já tratado em conciliacao/parsing.ts. Reconstrói agrupando por
 * proximidade de Y (linha) e depois "clusterizando" os X de todas as linhas
 * em colunas — cabeçalho e valor caem sempre bem próximos em X (poucos
 * pixels de diferença), bem mais perto um do outro do que de qualquer outra
 * coluna vizinha (dezenas de pixels), o que torna essa aproximação segura.
 */
function construirTabelaPdf(itens: ItemPosicionado[]): string[][] {
  // Tolerância bem maior que a usada em "linhas" de texto corrido (2px): um
  // cabeçalho de coluna quebrado em várias linhas ("Validade do" / "teste
  // de" / "viabilidade" / "(mês/ano)") tem ~11-12px entre cada uma — sem
  // juntar essas linhas numa célula só, buscarRotuloEmTabelas pega a 2ª
  // linha do PRÓPRIO cabeçalho achando que já é o valor. A linha de valor de
  // verdade fica bem mais longe (~40px+), então esse limiar não confunde as
  // duas coisas.
  const todasAsLinhas: ItemPosicionado[][] = [];
  let linhaAtual: ItemPosicionado[] = [];
  let yAnterior: number | null = null;
  for (const item of itens) {
    if (!item.texto) continue;
    if (yAnterior !== null && Math.abs(item.y - yAnterior) > 25) {
      todasAsLinhas.push(linhaAtual);
      linhaAtual = [];
    }
    linhaAtual.push(item);
    yAnterior = item.y;
  }
  if (linhaAtual.length > 0) todasAsLinhas.push(linhaAtual);

  // A partir daqui, só a região tabular de verdade: texto corrido livre
  // ANTES dela (nome/CNPJ/endereço do reembalador, tudo em parágrafos largos)
  // tem palavras espalhadas por toda a largura da página — incluir isso na
  // clusterização de coluna cria âncoras "estranhas" que ficam mais perto de
  // um cabeçalho/valor de verdade do que a âncora certa, por poucos pixels.
  const indiceInicio = todasAsLinhas.findIndex((linha) => linha.some((c) => REGEX_INICIO_TABELA.test(c.texto)));
  const linhas = indiceInicio === -1 ? todasAsLinhas : todasAsLinhas.slice(indiceInicio);

  const TOLERANCIA_COLUNA_PX = 25;
  const xsOrdenados = [...new Set(linhas.flat().map((c) => c.x))].sort((a, b) => a - b);
  const ancoras: number[] = [];
  for (const x of xsOrdenados) {
    if (ancoras.length === 0 || x - ancoras[ancoras.length - 1] > TOLERANCIA_COLUNA_PX) ancoras.push(x);
  }
  const colunaDe = (x: number): number => {
    let melhorIndice = 0;
    let menorDistancia = Infinity;
    ancoras.forEach((ancora, i) => {
      const distancia = Math.abs(x - ancora);
      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        melhorIndice = i;
      }
    });
    return melhorIndice;
  };

  return linhas.map((linha) => {
    const colunas: string[] = [];
    for (const celula of [...linha].sort((a, b) => a.x - b.x)) {
      const col = colunaDe(celula.x);
      colunas[col] = colunas[col] ? `${colunas[col]} ${celula.texto}`.trim() : celula.texto;
    }
    return colunas;
  });
}

/** PDF via pdfjs-dist — só funciona se o PDF tiver camada de texto real (não foto/scan). */
async function extrairDoPdf(arquivo: File): Promise<ConteudoExtraido> {
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await arquivo.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const linhas: string[] = [];
  const tabelas: string[][][] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const pagina = await pdf.getPage(i);
    const conteudo = await pagina.getTextContent();
    const itensPagina: ItemPosicionado[] = [];
    let linhaAtual = '';
    let yAnterior: number | null = null;
    for (const item of conteudo.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      itensPagina.push({ x: item.transform[4], y, texto: linhaLimpa(item.str) });
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
    tabelas.push(construirTabelaPdf(itensPagina));
  }

  return { linhas, tabelas };
}

/** null = formato sem suporte (.doc antigo, imagem...) ou falha na leitura — quem chama cai pro nome do arquivo como fallback. */
export async function extrairConteudoArquivo(arquivo: File): Promise<ConteudoExtraido | null> {
  const nome = arquivo.name.toLowerCase();
  try {
    if (nome.endsWith('.docx')) return await extrairDoDocx(arquivo);
    if (nome.endsWith('.pdf')) return await extrairDoPdf(arquivo);
  } catch (e) {
    // Cai pro nome do arquivo como fallback de propósito (não quebra o
    // upload) — mas loga o erro real, senão uma falha de verdade (ex.:
    // biblioteca não carregando em produção) fica indistinguível de "formato
    // sem suporte" e nunca dá pra saber o motivo real de o laudo ter sido
    // interpretado só pelo nome.
    console.error(`[extrairConteudoArquivo] Falha ao ler "${arquivo.name}":`, e);
    return null;
  }
  return null;
}
