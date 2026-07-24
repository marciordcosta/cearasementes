import type { ArquivoLaudo } from './types';

const EXTENSOES_NATIVAS = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

/** O navegador só renderiza PDF/imagem nativamente — Word/Excel/PowerPoint (e qualquer coisa fora dessa lista) o navegador não sabe mostrar e cai pra download. */
export function precisaVisualizadorExterno(laudo: ArquivoLaudo): boolean {
  if (laudo.arquivoTipo === 'application/pdf' || laudo.arquivoTipo?.startsWith('image/')) return false;
  const nome = laudo.arquivoNome.toLowerCase();
  return !EXTENSOES_NATIVAS.some((ext) => nome.endsWith(ext));
}

/**
 * URL pra exibir o arquivo — direto quando o navegador já sabe renderizar
 * (PDF/imagem), ou via Google Docs Viewer quando não sabe (Word/Excel/
 * PowerPoint). "embutido" usa a toolbar mínima do Google (pra <iframe> num
 * modal); "aba" abre a versão completa do visualizador do Google, com a
 * própria barra de ferramentas dele (inclusive botão de imprimir) — é o que
 * evita o navegador simplesmente baixar o arquivo ao "abrir/imprimir".
 */
export function montarUrlVisualizacao(laudo: ArquivoLaudo, modo: 'embutido' | 'aba'): string {
  if (!precisaVisualizadorExterno(laudo)) return laudo.arquivoUrl;
  const base = `https://docs.google.com/gview?url=${encodeURIComponent(laudo.arquivoUrl)}`;
  return modo === 'embutido' ? `${base}&embedded=true` : base;
}
