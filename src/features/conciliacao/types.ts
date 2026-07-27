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
  grupoId: string | null;
  /** Anotação livre do usuário (observações, informações adicionais) — independente de conciliado/desativado. */
  observacao: string | null;
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
  mesmoNome?: LancamentoSistema[];
  mesmoValorMesmaData?: LancamentoSistema[];
  mesmoValorOutraData?: LancamentoSistema[];
  combinacaoCartao?: LancamentoSistema[];
}

/** Espelho de SugestoesConciliacao pro sentido invertido (Sistema → OFX) — mesmas categorias, candidatos vêm do Banco em vez do Sistema. */
export interface SugestoesConciliacaoInversa {
  mesmoNome?: LancamentoBanco[];
  mesmoValorMesmaData?: LancamentoBanco[];
  mesmoValorOutraData?: LancamentoBanco[];
  combinacaoCartao?: LancamentoBanco[];
}

export interface FiltrosConciliacao {
  bancoNome: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  formaPagamento: FormaPagamento | null;
  tipoLancamento: TipoLancamentoSistema | null;
  conciliado: 'sim' | 'nao' | 'preConciliados' | 'preLancamentos' | 'divergentes' | 'editados' | null;
  busca: string;
}

export interface NovoLancamentoManual {
  data: string;
  valor: number;
  formaPagamento: FormaPagamento;
  /** Cliente/Documento(pedido)/NF ficam em branco quando o registro vem do fluxo "pré-lançamento" (criado a partir de um OFX sem par no Sistema) — são completados depois, na baixa. */
  cliente: string;
  documento: string;
  nf: string;
}
