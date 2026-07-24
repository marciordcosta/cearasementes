export interface DadosArquivoInterpretados {
  nomeProduto: string;
  lote: string;
  anoSafra: string;
}

// Palavras genéricas que aparecem antes do nome do produto nos laudos reais
// (ex.: "Termo Massai Tradicional lote 80-2025") e não fazem parte do nome.
const PALAVRAS_PREFIXO = ['termo', 'laudo', 'atestado', 'certificado'];

function limpar(texto: string): string {
  return texto.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function removerPrefixo(texto: string): string {
  const semEspacos = texto.trim();
  for (const palavra of PALAVRAS_PREFIXO) {
    const regex = new RegExp(`^${palavra}\\b`, 'i');
    if (regex.test(semEspacos)) return semEspacos.replace(regex, '').trim();
  }
  return semEspacos;
}

/**
 * Tenta extrair Produto/Lote/Safra do NOME do arquivo (sem extensão), a
 * partir do padrão observado nos laudos reais: "Termo <produto> lote
 * <nº>[-<ano>]" (ex.: "Termo Massai Tradicional lote 80-2025"). Quando não
 * sobra nada antes de "lote" (ex.: "Termo lote 116 Tanzania Tradicional"),
 * assume que o nome do produto veio DEPOIS do número, não antes.
 *
 * Nunca lança e nunca "inventa" dado que não achou — os campos que não
 * bateram o padrão voltam vazios, pra edição manual (arquivo pode não
 * seguir o padrão, ou nem ter alguma dessas informações no nome).
 */
export function interpretarNomeArquivo(nomeArquivo: string): DadosArquivoInterpretados {
  const semExtensao = nomeArquivo.replace(/\.[^.]+$/, '');

  const matchLote = semExtensao.match(/\blote\b/i);
  if (!matchLote || matchLote.index === undefined) {
    return { nomeProduto: limpar(removerPrefixo(semExtensao)), lote: '', anoSafra: '' };
  }

  const antes = limpar(removerPrefixo(semExtensao.slice(0, matchLote.index)));
  const depois = semExtensao.slice(matchLote.index + matchLote[0].length);

  const matchNumero = depois.match(/\s*(\d+)(?:[\s-](\d{2,4}))?\s*(.*)/);
  let lote = '';
  let anoSafra = '';
  let restoDepois = '';
  if (matchNumero) {
    lote = matchNumero[1];
    restoDepois = limpar(matchNumero[3] ?? '');
    // Só o ano tal como está escrito no arquivo (25 ou 2025) — sem virar
    // intervalo de safra (2025/2026), como o original tem.
    if (matchNumero[2]) anoSafra = matchNumero[2];
  }

  return { nomeProduto: antes || restoDepois, lote, anoSafra };
}
