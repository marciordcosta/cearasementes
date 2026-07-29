import type { ArquivoLaudo } from './types';

/** Busca por nome do produto OU lote — usada tanto na grade quanto na Guia de Teste (pra respeitar o mesmo filtro já aplicado na tela). */
export function filtrarArquivos(arquivos: ArquivoLaudo[], busca: string): ArquivoLaudo[] {
  const termo = busca.trim().toLowerCase();
  if (!termo) return arquivos;
  return arquivos.filter((a) => a.nomeProduto.toLowerCase().includes(termo) || (a.lote ?? '').toLowerCase().includes(termo));
}
