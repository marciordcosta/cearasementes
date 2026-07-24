import type { Database } from '@/types/database';
import type { TipoRelatorioLog } from './types';

export interface Intervalo {
  inicio: Date;
  fim: Date;
}

type LogRow = Database['public']['Tables']['uploads_log']['Row'];

export interface ResumoGrupo {
  tipoRelatorio: TipoRelatorioLog;
  /** Nome do sub-grupo: Tabela de Preço (396), banco (ofx) ou tipo de lançamento (sistema) — null pro 124/333. */
  tabelaPreco: string | null;
  totalLinhas: number;
  temErro: boolean;
  /** Se algum upload do grupo tem data_min/data_max — 333 nunca tem, então não mostra faixa de período. */
  temDados: boolean;
  janela: Intervalo | null;
  ids: string[];
}

function parseISODate(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

export function addDias(data: Date, n: number): Date {
  const r = new Date(data);
  r.setDate(r.getDate() + n);
  return r;
}

/** Chave de agrupamento (tipo_relatorio + tabela_preco) usada tanto pra montar os grupos quanto pra achar o aviso de atraso de cada um. */
export function chaveGrupo(g: { tipoRelatorio: string; tabelaPreco: string | null }): string {
  return `${g.tipoRelatorio}|${g.tabelaPreco ?? ''}`;
}

function inicioDoMes(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), 1);
}

function fimDoMes(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth() + 1, 0);
}

/**
 * Funde intervalos sobrepostos ou adjacentes (sem furo de nenhum dia) em
 * blocos contínuos — é o que permite juntar 2 uploads da mesma tabela que
 * se sobrepõem em vez de tratar cada um isoladamente.
 */
export function mesclarIntervalos(intervalos: Intervalo[]): Intervalo[] {
  if (intervalos.length === 0) return [];
  const ordenados = [...intervalos].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const mesclados: Intervalo[] = [{ ...ordenados[0] }];
  for (const atual of ordenados.slice(1)) {
    const ultimo = mesclados[mesclados.length - 1];
    if (atual.inicio.getTime() <= addDias(ultimo.fim, 1).getTime()) {
      if (atual.fim.getTime() > ultimo.fim.getTime()) ultimo.fim = atual.fim;
    } else {
      mesclados.push({ ...atual });
    }
  }
  return mesclados;
}

/**
 * Corta as pontas de mês quebrado de um intervalo contínuo: o início vira o
 * dia 1 do mês seguinte se não começar exatamente no dia 1, e o fim vira o
 * último dia do mês anterior se não terminar no último dia do mês. Retorna
 * null se não sobrar nenhum mês inteiro (ex.: intervalo cabe todo dentro de
 * um único mês parcial).
 */
export function janelaFechada(inicio: Date, fim: Date): Intervalo | null {
  const inicioFechado = inicio.getDate() === 1 ? inicio : inicioDoMes(new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1));
  const fimFechado = fim.getDate() === fimDoMes(fim).getDate() ? fim : fimDoMes(new Date(fim.getFullYear(), fim.getMonth() - 1, 1));
  if (inicioFechado.getTime() > fimFechado.getTime()) return null;
  return { inicio: inicioFechado, fim: fimFechado };
}

/** Testa se dois intervalos se sobrepõem em algum dia (usado pra saber se o cabeçalho do upload novo repete período de um upload anterior). */
export function seSobrepoe(a: Intervalo, b: Intervalo): boolean {
  return a.inicio.getTime() <= b.fim.getTime() && a.fim.getTime() >= b.inicio.getTime();
}

/**
 * Agrupa as linhas de uploads_log por (tipo_relatorio, tabela_preco) pra
 * exibição na tela — 1 linha por grupo em vez de 1 por arquivo enviado. A
 * janela fechada mostrada é sempre recalculada na leitura (a partir do
 * bloco contínuo mais recente do grupo), nunca fica desatualizada em cache.
 */
export function agruparUploads(uploads: LogRow[]): ResumoGrupo[] {
  const mapa = new Map<string, ResumoGrupo>();
  for (const u of uploads) {
    const chave = chaveGrupo({ tipoRelatorio: u.tipo_relatorio, tabelaPreco: u.tabela_preco });
    let grupo = mapa.get(chave);
    if (!grupo) {
      grupo = { tipoRelatorio: u.tipo_relatorio, tabelaPreco: u.tabela_preco, totalLinhas: 0, temErro: false, temDados: false, janela: null, ids: [] };
      mapa.set(chave, grupo);
    }
    grupo.ids.push(u.id);
    if (u.status === 'erro') grupo.temErro = true;
    else grupo.totalLinhas += u.linhas_importadas;
  }

  for (const grupo of mapa.values()) {
    const intervalos = uploads
      .filter((u) => u.tipo_relatorio === grupo.tipoRelatorio && (u.tabela_preco ?? null) === grupo.tabelaPreco && u.data_min && u.data_max)
      .map((u) => ({ inicio: parseISODate(u.data_min!), fim: parseISODate(u.data_max!) }));
    if (intervalos.length === 0) continue;
    grupo.temDados = true;
    const blocos = mesclarIntervalos(intervalos);
    const blocoMaisRecente = blocos.reduce((a, b) => (b.fim.getTime() > a.fim.getTime() ? b : a));
    grupo.janela = janelaFechada(blocoMaisRecente.inicio, blocoMaisRecente.fim);
  }

  return Array.from(mapa.values());
}

export interface AvisoAtraso {
  /** NaN quando o grupo nunca fechou nenhum mês ainda (sem uma data-base pra contar os dias). */
  diasAtraso: number;
  faltaInicio: Date | null;
  faltaFim: Date;
  referencia: ResumoGrupo;
}

/**
 * Compara a janela fechada de cada grupo (Tabela de Preço, Relatório 124,
 * 333 pelo período do cabeçalho...) com a do grupo mais atualizado — a
 * referência é sempre quem tem o `janela.fim` mais recente entre os que já
 * fecharam algum mês. Todo grupo atrás dessa referência ganha um aviso com
 * quantos dias de atraso e qual faixa de datas falta pra alcançá-la.
 */
export function calcularAvisosAtraso(grupos: ResumoGrupo[]): Map<string, AvisoAtraso> {
  const comDados = grupos.filter((g) => g.temDados);
  const comJanela = comDados.filter((g) => g.janela !== null);
  if (comJanela.length === 0) return new Map();
  const referencia = comJanela.reduce((a, b) => (b.janela!.fim.getTime() > a.janela!.fim.getTime() ? b : a));

  const avisos = new Map<string, AvisoAtraso>();
  for (const g of comDados) {
    if (g === referencia) continue;
    if (!g.janela) {
      avisos.set(chaveGrupo(g), { diasAtraso: NaN, faltaInicio: null, faltaFim: referencia.janela!.fim, referencia });
      continue;
    }
    const diasAtraso = Math.round((referencia.janela!.fim.getTime() - g.janela.fim.getTime()) / 86400000);
    if (diasAtraso <= 0) continue;
    avisos.set(chaveGrupo(g), { diasAtraso, faltaInicio: addDias(g.janela.fim, 1), faltaFim: referencia.janela!.fim, referencia });
  }
  return avisos;
}
