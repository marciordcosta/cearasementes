/** Tipos de relatório reconhecidos pelo cabeçalho do arquivo. '333' fica só por compatibilidade com uploads antigos já gravados — não é mais reconhecido/importado (ver detectarTipoRelatorio). */
export type TipoRelatorio = '124' | '396' | '333';

/** Únicos que ainda passam pela tela de mapeamento de coluna — o 396 (formato matricial novo) tem parser dedicado, sem mapeamento. */
export type TipoRelatorioMapeado = '124';

/** TipoRelatorio + os tipos da Conciliação Bancária (ofx/sistema) — não passam por mapeamento, mas mesclam na mesma lista "Arquivos processados recentemente". */
export type TipoRelatorioLog = TipoRelatorio | 'ofx' | 'sistema';

export interface GrupoLinhas {
  /** Nome do arquivo (+ aba, se a planilha tiver mais de uma) */
  label: string;
  rows: unknown[][];
}

export interface GrupoClassificado {
  grupo: GrupoLinhas;
  tipo: TipoRelatorio | null;
}

export interface CampoAlvo {
  chave: string;
  rotulo: string;
  obrigatorio: boolean;
  /** Regex usada para tentar adivinhar a coluna certa pelo cabeçalho do arquivo */
  palpiteCabecalho?: RegExp;
}

/** chave do campo alvo -> índice da coluna na planilha (ou null se não mapeado) */
export type MapeamentoColunas = Record<string, number | null>;

export interface LogUpload {
  arquivoNome: string;
  tipoRelatorio: TipoRelatorioLog;
  linhasImportadas: number;
  status: 'sucesso' | 'aviso' | 'erro';
  mensagem?: string;
  /** Nome do sub-grupo pra mesclar numa linha só: Tabela de Preço (396), banco (ofx) ou tipo de lançamento (sistema). */
  tabelaPreco?: string | null;
  /** Menor/maior data (do cabeçalho ou das linhas, conforme o tipo), formato ISO (YYYY-MM-DD). Null pro 333. */
  dataMin?: string | null;
  dataMax?: string | null;
}
