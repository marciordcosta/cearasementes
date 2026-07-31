import { registrarLogUpload } from '@/features/uploads/api';
import type { GrupoLinhas } from '@/features/uploads/types';
import { readFileSmart } from '@/lib/readFileSmart';
import { importarLancamentosBanco, importarSistema } from './api';
import { detectarPeriodoCabecalhoSistema, detectarTipoLancamento, parseExtratoBB, parseMatricial, parseRecebiveisStone } from './parsing';
import type { RegistroBancoParseado, RegistroSistemaParseado } from './parsing';

export type TipoBanco = 'bb' | 'stone';

/**
 * Só o lado Sistema (HTML do Max-Manager) ainda é reconhecido pela extensão
 * — o lado Banco (extrato BB / recebíveis Stone) precisa olhar o CONTEÚDO
 * do arquivo (ver ehExtratoBB/ehRecebiveisStone em parsing.ts), já que os
 * dois vêm em .xlsx/.csv, os mesmos formatos usados pelos relatórios 124/396.
 */
export function ehArquivoConciliacaoSistema(nomeArquivo: string): boolean {
  const nome = nomeArquivo.toLowerCase();
  return nome.endsWith('.html') || nome.endsWith('.htm');
}

/** Menor/maior data entre os registros — nem BB nem Stone trazem um "período do filtro" confiável no cabeçalho como o relatório do Sistema. */
function extrairIntervaloLinhas(registros: RegistroBancoParseado[]): { inicio: string; fim: string } | null {
  const datas = registros
    .map((r) => r.data)
    .filter(Boolean)
    .sort();
  if (datas.length === 0) return null;
  return { inicio: datas[0], fim: datas[datas.length - 1] };
}

function isoDeData(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

const NOME_BANCO: Record<TipoBanco, { codigo: string; nome: string }> = {
  bb: { codigo: '001', nome: 'Banco do Brasil' },
  stone: { codigo: '197', nome: 'Stone' },
};

/** Só parseia (não grava) um arquivo do lado Banco — usado pra detectar conflitos com registros já conciliados ANTES de gravar (ver detectarConflitosConciliados em api.ts). */
export function parseGrupoBanco(grupo: GrupoLinhas, tipoBanco: TipoBanco): RegistroBancoParseado[] {
  return tipoBanco === 'bb' ? parseExtratoBB(grupo.rows) : parseRecebiveisStone(grupo.rows);
}

/**
 * Grava um arquivo do lado Banco (extrato BB ou recebíveis Stone) — `grupo`
 * já veio extraído (extractRowGroups) e classificado (ehExtratoBB/
 * ehRecebiveisStone) por quem chama, então aqui só falta parsear e salvar.
 * `fitidsParaManter`: registros que o usuário escolheu manter como estavam
 * (conflito com um lançamento já conciliado) — ver detectarConflitosConciliados.
 */
export async function importarGrupoBanco(grupo: GrupoLinhas, tipoBanco: TipoBanco, fitidsParaManter: Set<string> = new Set()): Promise<void> {
  const { codigo, nome } = NOME_BANCO[tipoBanco];
  const registros = parseGrupoBanco(grupo, tipoBanco);
  const linhasGravadas = await importarLancamentosBanco(grupo.label, codigo, nome, registros, fitidsParaManter);

  const intervalo = extrairIntervaloLinhas(registros);
  await registrarLogUpload({
    arquivoNome: grupo.label,
    tipoRelatorio: 'ofx',
    tabelaPreco: nome,
    linhasImportadas: linhasGravadas,
    dataMin: intervalo?.inicio ?? null,
    dataMax: intervalo?.fim ?? null,
    status: linhasGravadas > 0 ? 'sucesso' : 'aviso',
    mensagem: linhasGravadas === 0 ? 'Nenhum lançamento reconhecido no arquivo.' : undefined,
  });
}

export interface ArquivoSistemaParseado {
  tipoLancamento: 'Entrada' | 'Saída';
  registros: RegistroSistemaParseado[];
  periodo: { inicio: Date; fim: Date } | null;
}

/**
 * Só lê e parseia (não grava) um arquivo do Sistema — usado pra detectar
 * conflitos com registros já conciliados ANTES de gravar (ver
 * detectarConflitosConciliadosSistema em api.ts).
 *
 * Se NENHUM registro reconhecido tiver NF, o relatório provavelmente não é o
 * esperado (operador puxou o relatório errado, ou esqueceu de informar a
 * coluna de NF na exportação) — recusa o arquivo inteiro em vez de gravar
 * tudo sem NF, o que travaria cada lançamento como "pendente" na Conciliação.
 */
export async function parseArquivoSistema(file: File): Promise<ArquivoSistemaParseado> {
  const texto = await readFileSmart(file);
  const tipoLancamento = detectarTipoLancamento(texto, file.name);
  const registros = parseMatricial(texto, file.name);
  if (registros.length > 0 && !registros.some((r) => r.nf && r.nf.trim())) {
    throw new Error(`Arquivo sem informação de NF: "${file.name}".`);
  }
  return { tipoLancamento, registros, periodo: detectarPeriodoCabecalhoSistema(texto) };
}

/**
 * Lê, parseia e grava um arquivo do Sistema (Max Data, HTML) — mesma lógica
 * de sempre, não afetada pela troca do OFX.
 * `chavesParaExcluir`: registros que o usuário escolheu manter/atualizar
 * manualmente num conflito com um lançamento já conciliado — ver
 * detectarConflitosConciliadosSistema (ficam de fora do upsert normal pra
 * não criar uma linha nova duplicada).
 */
export async function importarArquivoSistema(file: File, chavesParaExcluir: Set<string> = new Set()): Promise<void> {
  const { tipoLancamento, registros, periodo } = await parseArquivoSistema(file);
  const linhasGravadas = await importarSistema(file.name, tipoLancamento, registros, chavesParaExcluir);

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
