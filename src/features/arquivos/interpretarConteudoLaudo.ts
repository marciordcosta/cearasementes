import type { ConteudoExtraido } from './extrairConteudoArquivo';

export interface CamposDoConteudo {
  nomeProduto: string | null;
  lote: string | null;
  anoSafra: string | null;
  /** Campos extras achados no laudo, só pra exibir (Espécie, Categoria, Processo...) — não tem coluna própria no banco. */
  extras: Record<string, string>;
}

/**
 * Corta no fim da frase/célula — evita pegar "MARANDU Categoria: S2" quando
 * os dois campos vêm colados na mesma linha. O PDF reconstrói a linha
 * inteira colando "Rótulo: valor" um do lado do outro com só 1 espaço (o
 * .docx costuma ter cada rótulo no seu próprio parágrafo, com 2+ espaços ou
 * fim de linha sobrando) — por isso o corte não pode depender só disso: para
 * também antes de qualquer "Outro Rótulo:" reconhecível, mesmo colado com 1
 * espaço só.
 */
function valorAposRotulo(linha: string, rotulo: string): string | null {
  const regex = new RegExp(`\\b${rotulo}\\s*:?\\s*(.*?)(?:\\s{2,}|\\s+(?=[A-ZÀ-Ú][a-zà-ú]*\\s*:)|$)`, 'i');
  const m = linha.match(regex);
  if (!m) return null;
  return m[1].trim() || null;
}

function buscarRotulo(linhas: string[], rotulos: string[]): string | null {
  for (const linha of linhas) {
    for (const rotulo of rotulos) {
      const valor = valorAposRotulo(linha, rotulo);
      if (valor) return valor;
    }
  }
  return null;
}

/** "MARANDU" + "TRADICIONAL" -> "Marandu Tradicional" — os laudos escrevem Cultivar/Processo em caixa alta. */
function capitalizarPalavras(texto: string): string {
  return texto
    .split(' ')
    .map((palavra) => (palavra ? palavra[0].toUpperCase() + palavra.slice(1).toLowerCase() : palavra))
    .join(' ');
}

/** Lote vem em coluna de tabela (cabeçalho "Lote Nº" + valor na linha de baixo), não em "Rótulo: valor" — só dá pra achar em .docx (temos a tabela estruturada); em PDF cai pro nome do arquivo. */
function buscarLoteEmTabelas(tabelas: string[][][]): string | null {
  return buscarRotuloEmTabelas(tabelas, ['lote']);
}

/**
 * Igual buscarLoteEmTabelas, mas genérico pra outros campos (Pureza,
 * Germinação, Validade) que em boletins de análise de sementes também costumam
 * vir em tabela — cabeçalho na(s) linha(s) de cima + valor embaixo (mesma
 * coluna). O cabeçalho às vezes ocupa 2 linhas (rowspan reconstruído em
 * tabelaParaMatriz repete o texto do cabeçalho nas duas), então desce linha a
 * linha até achar um valor DIFERENTE do texto do cabeçalho — não dá pra
 * assumir "sempre uma linha abaixo". "Mesma linha" é o último recurso, pra
 * tabelas em formato rótulo/valor lado a lado.
 */
function buscarRotuloEmTabelas(tabelas: string[][][], rotulos: string[], excluirSeConter: string[] = []): string | null {
  const bate = (celula: string) =>
    rotulos.some((rotulo) => new RegExp(`\\b${rotulo}\\b`, 'i').test(celula)) &&
    !excluirSeConter.some((termo) => new RegExp(`\\b${termo}\\b`, 'i').test(celula));
  for (const tabela of tabelas) {
    for (let l = 0; l < tabela.length; l++) {
      const col = tabela[l].findIndex(bate);
      if (col === -1) continue;
      const textoCabecalho = tabela[l][col];
      for (let baixo = l + 1; baixo < tabela.length; baixo++) {
        const valor = tabela[baixo]?.[col]?.trim();
        if (valor && valor !== textoCabecalho) return valor;
      }
      const mesmaLinha = tabela[l][col + 1]?.trim();
      if (mesmaLinha) return mesmaLinha;
    }
  }
  return null;
}

/**
 * Lê os campos do CONTEÚDO do laudo (não do nome do arquivo) — é a fonte
 * PRINCIPAL: quando o laudo segue o modelo "Termo de Conformidade" (rótulos
 * tipo "Cultivar:", "Safra:"), o dado vem direto de dentro do documento, que
 * é mais confiável que adivinhar pelo nome do arquivo. Campos que não bater
 * aqui voltam null — quem chama cai pro nome do arquivo como reforço.
 */
export function interpretarConteudoLaudo(conteudo: ConteudoExtraido): CamposDoConteudo {
  const { linhas, tabelas } = conteudo;

  const especie = buscarRotulo(linhas, ['espécie', 'especie']);
  const cultivar = buscarRotulo(linhas, ['cultivar']);
  const processo = buscarRotulo(linhas, ['processo']);
  // Nome do produto = Espécie + Cultivar (ex.: "Andropogon Gayanus Planaltina") quando o laudo traz
  // Espécie (modelo "Termo de Conformidade"); sem Espécie, cai pro par Cultivar + Processo (ex.:
  // "Marandu Tradicional", modelo mais simples que não destaca a Espécie à parte).
  const nomeProduto =
    especie && cultivar
      ? capitalizarPalavras(`${especie} ${cultivar}`)
      : cultivar && processo
        ? capitalizarPalavras(`${cultivar} ${processo}`)
        : cultivar
          ? capitalizarPalavras(cultivar)
          : null;
  const anoSafra = buscarRotulo(linhas, ['safra']);
  const lote = buscarLoteEmTabelas(tabelas);

  const extras: Record<string, string> = {};
  if (especie) extras.Espécie = especie;

  // Modelo "Termo de Conformidade": rótulo solto em texto corrido ("Categoria: X") — tenta a linha primeiro, tabela como reforço.
  const camposDeTexto: Record<string, string[]> = {
    Categoria: ['categoria'],
    Processo: ['processo'],
  };
  for (const [rotuloExibido, variacoes] of Object.entries(camposDeTexto)) {
    const valor = buscarRotulo(linhas, variacoes) ?? buscarRotuloEmTabelas(tabelas, variacoes);
    if (valor) extras[rotuloExibido] = valor;
  }

  // Modelo "Boletim de Análise": vem na mesma tabela do Lote (cabeçalho na linha de cima, valor embaixo) — tabela primeiro.
  // Tentar a linha antes pegaria o próprio texto do cabeçalho da tabela (ex.: "Validade do teste de viabilidade (mês/ano)"), que também vira "linha" quando a célula é lida — e não tem valor nenhum colado nela.
  const camposDeTabela: Record<string, { rotulos: string[]; excluirSeConter?: string[] }> = {
    Validade: { rotulos: ['validade', 'válido até', 'valido ate'] },
    Pureza: { rotulos: ['pureza', 'sementes puras', 'puras'] },
    // "viabilidade" sozinho é sinônimo de Germinação em alguns modelos, mas
    // colide com o cabeçalho "Validade do teste de viabilidade (mês/ano)"
    // (Boletim de Análise da Vitória Sementes) — sem excluir, pegava a data de
    // validade em vez do % de germinação. Exclui qualquer célula que também
    // fale de "validade" pra não confundir as duas colunas.
    // "germina" (prefixo, sem exigir a palavra inteira) cobre um caso mais sutil
    // do mesmo boletim: o cabeçalho "Germinação (%)" quebra em várias linhas no
    // PDF e o texto reconstruído embaralha a ordem dos pedaços (ex.:
    // "Germinaçã (%) o") — a palavra inteira "germinação" nunca aparece
    // contígua, só o prefixo "germina" (que não colide com mais nada).
    Germinação: {
      rotulos: ['germinação', 'germinacao', 'faculdade germinativa', 'poder germinativo', 'viabilidade', 'germina'],
      excluirSeConter: ['validade', 'válido', 'valido'],
    },
    // "Peso por Embalagem (kg)" — usado no Selo (linha PESO), com prioridade
    // sobre o peso casado por nome na Tabela de Preço (ver etiqueta.ts).
    Peso: { rotulos: ['peso por embalagem', 'peso da embalagem', 'peso'] },
  };
  for (const [rotuloExibido, { rotulos, excluirSeConter }] of Object.entries(camposDeTabela)) {
    const valor = buscarRotuloEmTabelas(tabelas, rotulos, excluirSeConter) ?? buscarRotulo(linhas, rotulos);
    if (valor) extras[rotuloExibido] = valor;
  }

  return { nomeProduto, lote, anoSafra, extras };
}
