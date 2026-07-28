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
  /** Valor bruto da venda de cartão (antes da taxa da maquininha) — só quando a fonte já traz esse dado exato (recebíveis Stone). Null pro Banco do Brasil e manuais. */
  valorBrutoCartao: number | null;
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
  /** Valor exatamente igual (só diferença de ponto flutuante) — mesma data. */
  mesmoValorMesmaData?: LancamentoSistema[];
  /** Dentro da tolerância da regra, mas NÃO exatamente igual — mesma data. Fica separado pra deixar claro que a diferença de centavos é real, não é erro de arredondamento. */
  valorAproximadoMesmaData?: LancamentoSistema[];
  mesmoValorOutraData?: LancamentoSistema[];
  /** Espelho de valorAproximadoMesmaData, mas com outra data. */
  valorAproximadoOutraData?: LancamentoSistema[];
  /** Só Cartão com valor bruto conhecido: mesmo valor, mas parcela (X/Y) diferente da do lançamento do Banco — fica separado da lista principal porque é um candidato menos confiável, o usuário decide se aceita mesmo assim. */
  mesmoValorParcelaDiferente?: LancamentoSistema[];
  /** Só Boleto: nenhum título sozinho bateu, mas a SOMA de vários bate com o valor do Banco — o extrato do BB traz o boleto recebível agregado (1 linha por dia = soma de vários títulos), então isso é o caminho normal, não uma exceção. Concilia o grupo inteiro de uma vez. */
  combinacaoBoleto?: LancamentoSistema[];
  /** Só PIX: nenhum valor exato bateu, mas a SOMA de candidatos de NOME parecido bate com o valor — nunca soma PIX de nomes diferentes, só entra aqui quem já passou pelo filtro de nome (mesmoNome). */
  combinacaoPix?: LancamentoSistema[];
}

/** Espelho de SugestoesConciliacao pro sentido invertido (Sistema → OFX) — mesmas categorias, candidatos vêm do Banco em vez do Sistema. */
export interface SugestoesConciliacaoInversa {
  mesmoNome?: LancamentoBanco[];
  mesmoValorMesmaData?: LancamentoBanco[];
  valorAproximadoMesmaData?: LancamentoBanco[];
  mesmoValorOutraData?: LancamentoBanco[];
  valorAproximadoOutraData?: LancamentoBanco[];
  mesmoValorParcelaDiferente?: LancamentoBanco[];
  combinacaoBoleto?: LancamentoBanco[];
  combinacaoPix?: LancamentoBanco[];
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
