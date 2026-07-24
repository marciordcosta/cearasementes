export interface ArquivoLaudo {
  id: string;
  nomeProduto: string;
  lote: string | null;
  anoSafra: string | null;
  arquivoNome: string;
  arquivoUrl: string;
  arquivoTipo: string | null;
  tamanhoBytes: number | null;
  enviadoEm: string;
  /** Lidos automaticamente do Boletim de Análise, só pra consulta — não passam pelo modal de edição. */
  pureza: string | null;
  germinacao: string | null;
  validade: string | null;
}

export interface NovoLaudoInput {
  nomeProduto: string;
  lote: string;
  anoSafra: string;
  arquivo: File;
  pureza?: string;
  germinacao?: string;
  validade?: string;
}
