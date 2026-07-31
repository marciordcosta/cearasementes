import type { Database } from '@/types/database';
import type { TipoRelatorioLog } from './types';

type LogRow = Database['public']['Tables']['uploads_log']['Row'];

export interface ResumoGrupo {
  tipoRelatorio: TipoRelatorioLog;
  /** Nome do sub-grupo: Tabela de Preço (396), banco (ofx) ou tipo de lançamento (sistema) — null pro 124/333. */
  tabelaPreco: string | null;
  totalLinhas: number;
  temErro: boolean;
  /** Se algum upload do grupo tem data_min/data_max — 333 nunca tem, então não mostra faixa de datas. */
  temDados: boolean;
  /** Menor/maior data BRUTA entre todos os uploads do grupo — exatamente como veio nos arquivos, sem arredondar pra mês fechado. */
  dataMin: Date | null;
  dataMax: Date | null;
  /** Upload mais recente do grupo (data de carregamento exibida na tela). */
  carregadoEm: Date;
  ids: string[];
}

function parseISODate(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

/** Chave de agrupamento (tipo_relatorio + tabela_preco) usada tanto pra montar os grupos quanto pra achar o aviso de atraso de cada um. */
export function chaveGrupo(g: { tipoRelatorio: string; tabelaPreco: string | null }): string {
  return `${g.tipoRelatorio}|${g.tabelaPreco ?? ''}`;
}

/**
 * Agrupa as linhas de uploads_log por (tipo_relatorio, tabela_preco) pra
 * exibição na tela — 1 linha por grupo em vez de 1 por arquivo enviado.
 * data_min/data_max mostrados são os brutos (menor/maior entre todos os
 * uploads do grupo), exatamente como vieram nos arquivos — sem nenhum
 * arredondamento ou corte de mês quebrado.
 */
export function agruparUploads(uploads: LogRow[]): ResumoGrupo[] {
  const mapa = new Map<string, ResumoGrupo>();
  for (const u of uploads) {
    const chave = chaveGrupo({ tipoRelatorio: u.tipo_relatorio, tabelaPreco: u.tabela_preco });
    const carregadoEm = new Date(u.criado_em);
    let grupo = mapa.get(chave);
    if (!grupo) {
      grupo = { tipoRelatorio: u.tipo_relatorio, tabelaPreco: u.tabela_preco, totalLinhas: 0, temErro: false, temDados: false, dataMin: null, dataMax: null, carregadoEm, ids: [] };
      mapa.set(chave, grupo);
    }
    grupo.ids.push(u.id);
    if (u.status === 'erro') grupo.temErro = true;
    else grupo.totalLinhas += u.linhas_importadas;
    if (carregadoEm > grupo.carregadoEm) grupo.carregadoEm = carregadoEm;
    if (u.data_min) {
      grupo.temDados = true;
      const d = parseISODate(u.data_min);
      if (!grupo.dataMin || d < grupo.dataMin) grupo.dataMin = d;
    }
    if (u.data_max) {
      const d = parseISODate(u.data_max);
      if (!grupo.dataMax || d > grupo.dataMax) grupo.dataMax = d;
    }
  }
  return Array.from(mapa.values());
}
