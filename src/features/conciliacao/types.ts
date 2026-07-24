export type FormaPagamento = 'PIX' | 'CARTAO' | 'BOLETO' | 'CHEQUE' | 'RENDIMENTO' | 'OUTRO';
export type OrigemBanco = 'ofx' | 'manual';
export type OrigemSistema = 'sistema' | 'manual' | 'taxa_automatica';
export type TipoLancamentoSistema = 'Entrada' | 'Saída';
export type TipoArquivo = 'ofx' | 'sistema';

export interface LancamentoBanco {
  id: string;
  arquivoId: string | null;
  origem: OrigemBanco;
  bancoCodigo: string | null;
  bancoNome: string | null;
  data: string;
  valor: number;
  descricao: string | null;
  formaPagamento: FormaPagamento;
  conciliado: boolean;
  desativado: boolean;
  marcado: boolean;
  observacao: string | null;
  grupoId: string | null;
}

export interface LancamentoSistema {
  id: string;
  arquivoId: string | null;
  origem: OrigemSistema;
  tipoLancamento: TipoLancamentoSistema;
  cliente: string | null;
  documento: string | null;
  nf: string | null;
  vendedor: string | null;
  formaPagamentoRaw: string | null;
  valor: number;
  data: string | null;
  conciliado: boolean;
  desativado: boolean;
  taxaValor: number;
  taxaPercentual: number;
  grupoId: string | null;
}

export interface ArquivoConciliacao {
  id: string;
  nomeArquivo: string;
  tipo: TipoArquivo;
  bancoCodigo: string | null;
  bancoNome: string | null;
  enviadoEm: string;
}

/** Espelha `resp` do buscarSugestoes() original — cada chave é uma categoria de sugestão, já em ordem de prioridade. */
export interface SugestoesConciliacao {
  mesmoRemetente?: LancamentoBanco[];
  mesmoNome?: LancamentoSistema[];
  mesmoValorMesmaData?: LancamentoSistema[];
  mesmoValorOutraData?: LancamentoSistema[];
  combinacaoCartao?: LancamentoSistema[];
}

export interface FiltrosConciliacao {
  arquivoBancoId: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  formaPagamento: FormaPagamento | null;
  tipoLancamento: TipoLancamentoSistema | null;
  conciliado: 'sim' | 'nao' | 'marcados' | null;
  busca: string;
}

export interface NovoLancamentoManual {
  data: string;
  valor: number;
  cliente: string;
  nf: string;
}
