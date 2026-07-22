export type TipoRelatorio = '124' | '396' | '333';

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
  tipoRelatorio: TipoRelatorio;
  linhasImportadas: number;
  status: 'sucesso' | 'aviso' | 'erro';
  mensagem?: string;
}
