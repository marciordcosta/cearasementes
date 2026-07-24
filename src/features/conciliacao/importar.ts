import { registrarLogUpload } from '@/features/uploads/api';
import { readFileSmart } from '@/lib/readFileSmart';
import { importarOfx, importarSistema } from './api';
import { detectBankFromOfx, detectarPeriodoCabecalhoSistema, detectarTipoLancamento, parseMatricial, parseOFX } from './parsing';
import type { RegistroBancoParseado } from './parsing';

export type TipoArquivoConciliacao = 'ofx' | 'sistema';

/** Reconhece OFX (Banco) e HTML do Max Data (Sistema) pela extensão — usado pra desviar esses arquivos do fluxo de mapeamento de coluna (124/396/333), que eles não precisam. */
export function ehArquivoConciliacao(nomeArquivo: string): TipoArquivoConciliacao | null {
  const nome = nomeArquivo.toLowerCase();
  if (nome.endsWith('.ofx')) return 'ofx';
  if (nome.endsWith('.html') || nome.endsWith('.htm')) return 'sistema';
  return null;
}

/** Menor/maior data entre os registros — usado só pro OFX, que não tem um período de cabeçalho confiável (o próprio dedup por FITID já cobre reenvio diário sem duplicar). */
function extrairIntervaloLinhas(registros: RegistroBancoParseado[]): { inicio: string; fim: string } | null {
  const datas = registros.map((r) => r.data).filter(Boolean).sort();
  if (datas.length === 0) return null;
  return { inicio: datas[0], fim: datas[datas.length - 1] };
}

function isoDeData(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

/**
 * Lê, parseia e grava um arquivo de Conciliação (OFX ou Sistema) — mesma
 * lógica usada na tela de Uploads. Também grava uma linha em `uploads_log`
 * (tipo 'ofx'/'sistema', sub-grupo = banco ou tipo de lançamento) pra
 * aparecer mesclado na mesma lista "Arquivos processados recentemente" dos
 * relatórios 124/396/333, com período e aviso de atraso.
 */
export async function importarArquivoConciliacao(file: File, tipo: TipoArquivoConciliacao): Promise<void> {
  const texto = await readFileSmart(file);

  if (tipo === 'ofx') {
    const banco = detectBankFromOfx(texto, file.name);
    const registros = parseOFX(texto, file.name);
    const linhasGravadas = await importarOfx(file.name, banco.codigo, banco.nome, registros);

    // Sem período de cabeçalho confiável no OFX — usa a faixa das próprias
    // linhas (o dedup por FITID já garante que reenviar o extrato todo dia
    // não duplica nada, então não precisa fechar mês nem rejeitar linha).
    const intervalo = extrairIntervaloLinhas(registros);
    await registrarLogUpload({
      arquivoNome: file.name,
      tipoRelatorio: 'ofx',
      tabelaPreco: banco.nome,
      linhasImportadas: linhasGravadas,
      dataMin: intervalo?.inicio ?? null,
      dataMax: intervalo?.fim ?? null,
      status: linhasGravadas > 0 ? 'sucesso' : 'aviso',
      mensagem: linhasGravadas === 0 ? 'Nenhum lançamento reconhecido no OFX.' : undefined,
    });
    return;
  }

  const tipoLancamento = detectarTipoLancamento(texto, file.name);
  const registros = parseMatricial(texto, file.name);
  const linhasGravadas = await importarSistema(file.name, tipoLancamento, registros);

  const periodo = detectarPeriodoCabecalhoSistema(texto);
  await registrarLogUpload({
    arquivoNome: file.name,
    tipoRelatorio: 'sistema',
    tabelaPreco: tipoLancamento,
    linhasImportadas: linhasGravadas,
    dataMin: periodo ? isoDeData(periodo.inicio) : null,
    dataMax: periodo ? isoDeData(periodo.fim) : null,
    status: linhasGravadas > 0 ? 'sucesso' : 'aviso',
    mensagem: linhasGravadas === 0 ? 'Nenhum lançamento reconhecido no relatório.' : undefined,
  });
}
