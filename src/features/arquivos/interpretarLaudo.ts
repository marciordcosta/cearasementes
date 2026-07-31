import { extrairConteudoArquivo } from './extrairConteudoArquivo';
import { interpretarConteudoLaudo } from './interpretarConteudoLaudo';
import { interpretarNomeArquivo } from './nomeArquivoParser';

export type FonteCampo = 'conteudo' | 'nome' | null;

export interface LaudoInterpretado {
  nomeProduto: string;
  lote: string;
  anoSafra: string;
  /** Campos extras achados no conteúdo (Espécie, Categoria, Processo...) — só exibição. */
  extras: Record<string, string>;
  /** De onde veio cada campo — pra deixar claro na tela se foi lido do laudo ou "chutado" pelo nome do arquivo. */
  fonte: { nomeProduto: FonteCampo; lote: FonteCampo; anoSafra: FonteCampo };
}

/**
 * Fonte PRINCIPAL: o conteúdo do próprio laudo (mais confiável, quando o
 * modelo do documento tem os rótulos esperados). Fonte SECUNDÁRIA (reforço):
 * o nome do arquivo, usado só pros campos que o conteúdo não conseguiu achar.
 */
export async function interpretarLaudo(arquivo: File): Promise<LaudoInterpretado> {
  const doNome = interpretarNomeArquivo(arquivo.name);
  const conteudo = await extrairConteudoArquivo(arquivo).catch((e) => {
    console.error(`[interpretarLaudo] Falha inesperada ao extrair "${arquivo.name}":`, e);
    return null;
  });
  const doConteudo = conteudo ? interpretarConteudoLaudo(conteudo) : { nomeProduto: null, lote: null, anoSafra: null, extras: {} };

  return {
    nomeProduto: doConteudo.nomeProduto || doNome.nomeProduto,
    lote: doConteudo.lote || doNome.lote,
    anoSafra: doConteudo.anoSafra || doNome.anoSafra,
    extras: doConteudo.extras,
    fonte: {
      nomeProduto: doConteudo.nomeProduto ? 'conteudo' : doNome.nomeProduto ? 'nome' : null,
      lote: doConteudo.lote ? 'conteudo' : doNome.lote ? 'nome' : null,
      anoSafra: doConteudo.anoSafra ? 'conteudo' : doNome.anoSafra ? 'nome' : null,
    },
  };
}
