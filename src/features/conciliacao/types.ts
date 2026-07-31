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
  /** Data de vencimento impressa no relatório do Sistema — só usada na busca/conciliação de CHEQUE (o banco compensa no vencimento, não no recebimento). Null nos demais tipos e em lançamentos importados antes desse campo existir. */
  dataVencimento: string | null;
  conciliado: boolean;
  desativado: boolean;
  taxaValor: number;
  taxaPercentual: number;
  grupoId: string | null;
  /** Anotação livre do usuário (observações, informações adicionais) — mesma regra do Banco, independente de conciliado/desativado. */
  observacao: string | null;
  /** true quando `cliente` foi trocado pelo nome completo que vem no pedido (Relatório 396, achado pelo documento) — o HTML matricial do Sistema trunca o nome na largura fixa da coluna. Também decide se o ícone de produtos aparece (só quando achou uma venda de verdade, não só por ter `documento` preenchido). Calculado na hora de montar a lista (ConciliacaoPage), não vem do banco — ausente (undefined) em lançamentos sintéticos (combinação, manual). */
  temVenda396?: boolean;
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
  /** Valor dentro da tolerância da regra (exato ou não — não distingue mais os dois) e mesma data exata. */
  mesmaData?: LancamentoSistema[];
  /** Valor dentro da tolerância, mas o Banco recebeu DEPOIS da data do Sistema (pagamento atrasado) — dentro da tolerância de dias (corridos pra PIX/Cheque/Rendimento/Outro, dias úteis pra Boleto/Cartão) da regra da forma. */
  pagoPosteriormente?: LancamentoSistema[];
  /** Espelho de pagoPosteriormente: o Banco recebeu ANTES da data do Sistema (pagamento antecipado). */
  pagoAntecipado?: LancamentoSistema[];
  /** Só Cartão com valor bruto conhecido: mesmo valor, mas parcela (X/Y) diferente da do lançamento do Banco — fica separado da lista principal porque é um candidato menos confiável, o usuário decide se aceita mesmo assim. */
  parcelaDivergente?: LancamentoSistema[];
  /** Só Boleto: nenhum título sozinho bateu, mas a SOMA de vários bate com o valor do Banco — o extrato do BB traz o boleto recebível agregado (1 linha por dia = soma de vários títulos), então isso é o caminho normal, não uma exceção. Concilia o grupo inteiro de uma vez. */
  combinacaoBoleto?: LancamentoSistema[];
  /** Só PIX: nenhum valor exato bateu, mas a SOMA de candidatos de NOME parecido bate com o valor — nunca soma PIX de nomes diferentes, só entra aqui quem já passou pelo filtro de nome (mesmoNome). */
  combinacaoPix?: LancamentoSistema[];
  /** Rede de segurança: mesmo valor (tolerância da forma do lançamento do Banco), mas o lançamento do Sistema tem outra forma/tag — cobre o caso de erro de categorização no Sistema (ex.: venda de cartão lançada como "Outro"), que senão nunca apareceria em nenhuma categoria. Sempre a última, ordenada por data. */
  recebimentoDiferente?: LancamentoSistema[];
}

/** Espelho de SugestoesConciliacao pro sentido invertido (Sistema → OFX) — mesmas categorias, candidatos vêm do Banco em vez do Sistema. */
export interface SugestoesConciliacaoInversa {
  mesmoNome?: LancamentoBanco[];
  mesmaData?: LancamentoBanco[];
  pagoPosteriormente?: LancamentoBanco[];
  pagoAntecipado?: LancamentoBanco[];
  parcelaDivergente?: LancamentoBanco[];
  combinacaoBoleto?: LancamentoBanco[];
  combinacaoPix?: LancamentoBanco[];
  recebimentoDiferente?: LancamentoBanco[];
}

/** Ordem de prioridade das categorias — usada pra iterar (não pro rótulo, ver rotuloCategoria). */
export const ORDEM_CATEGORIAS_SUGESTAO: (keyof SugestoesConciliacao)[] = [
  'mesmoNome',
  'mesmaData',
  'pagoPosteriormente',
  'pagoAntecipado',
  'parcelaDivergente',
  'combinacaoBoleto',
  'combinacaoPix',
  'recebimentoDiferente',
];

/**
 * Chave de cada texto de categoria editável em Parametrização — a maioria
 * bate 1:1 com uma chave de SugestoesConciliacao, mas `pagoPosteriormente`/
 * `pagoAntecipado` viram DUAS chaves cada (uma por direção da busca: o
 * CANDIDATO exibido é diferente — Banco→Sistema mostra um registro do
 * Sistema, Sistema→Banco mostra um pagamento — dizer "pagamento" quando o
 * candidato é na verdade o registro do Sistema, e vice-versa, confunde mais
 * do que ajuda).
 */
export type ChaveRotuloCategoria =
  | 'mesmoNome'
  | 'mesmaData'
  | 'parcelaDivergente'
  | 'combinacaoBoleto'
  | 'combinacaoPix'
  | 'recebimentoDiferente'
  | 'pagoPosteriormenteBanco'
  | 'pagoAntecipadoBanco'
  | 'pagoPosteriormenteSistema'
  | 'pagoAntecipadoSistema';

/** Rótulo de cada categoria de sugestão, ANTES de qualquer customização salva pelo usuário (ver fetchRotulosCategoria/salvarRotuloCategoria em api.ts) — nomes editáveis em Parametrização, sem mexer nas regras de conciliação. */
export const ROTULOS_CATEGORIA_PADRAO: Record<ChaveRotuloCategoria, string> = {
  mesmoNome: 'Nome parecido',
  mesmaData: 'Mesma data',
  pagoPosteriormenteBanco: 'Registro anterior ao pagamento',
  pagoAntecipadoBanco: 'Registro posterior ao pagamento',
  pagoPosteriormenteSistema: 'Pagamento posterior ao registro',
  pagoAntecipadoSistema: 'Pagamento anterior ao registro',
  parcelaDivergente: 'Parcela divergente',
  combinacaoBoleto: 'Combinação de títulos (soma bate com o valor)',
  combinacaoPix: 'Combinação por nome parecido (soma bate com o valor)',
  recebimentoDiferente: 'Forma de recebimento divergente',
};

/** Nomes exibidos em Parametrização pra cada chave editável (rótulo do rótulo, por assim dizer) — só pra dar contexto de qual categoria é qual na tela de edição. */
export const DESCRICAO_CHAVE_ROTULO: Record<ChaveRotuloCategoria, string> = {
  mesmoNome: 'Nome parecido',
  mesmaData: 'Mesma data',
  pagoPosteriormenteBanco: 'Pago depois (buscando a partir de um item do Banco)',
  pagoAntecipadoBanco: 'Pago antes (buscando a partir de um item do Banco)',
  pagoPosteriormenteSistema: 'Pago depois (buscando a partir de um item do Sistema)',
  pagoAntecipadoSistema: 'Pago antes (buscando a partir de um item do Sistema)',
  parcelaDivergente: 'Parcela divergente (Cartão)',
  combinacaoBoleto: 'Combinação de títulos (Boleto)',
  combinacaoPix: 'Combinação por nome (PIX)',
  recebimentoDiferente: 'Forma de recebimento divergente',
};

/**
 * Rótulo de uma categoria pra exibir no painel de sugestões — usa o mapa de
 * customizações (`rotulos`, vindo de fetchRotulosCategoria) quando existir
 * uma entrada pra essa chave, senão cai pro texto padrão.
 */
export function rotuloCategoria(cat: keyof SugestoesConciliacao, direcao: 'banco' | 'sistema', rotulos: Partial<Record<ChaveRotuloCategoria, string>> = {}): string {
  const chave: ChaveRotuloCategoria =
    cat === 'pagoPosteriormente'
      ? direcao === 'banco'
        ? 'pagoPosteriormenteBanco'
        : 'pagoPosteriormenteSistema'
      : cat === 'pagoAntecipado'
        ? direcao === 'banco'
          ? 'pagoAntecipadoBanco'
          : 'pagoAntecipadoSistema'
        : (cat as ChaveRotuloCategoria);
  return rotulos[chave] ?? ROTULOS_CATEGORIA_PADRAO[chave];
}

/** Explicação curta (tooltip) de uma categoria, em bom português direto — mesma explicação nas duas direções (só o rótulo principal muda, ver rotuloCategoria). Não é customizável (só os nomes principais, por enquanto). `undefined` = sem tooltip (rótulo já é autoexplicativo). */
export function descricaoCategoria(cat: keyof SugestoesConciliacao): string | undefined {
  if (cat === 'mesmaData') return 'Pago no dia';
  if (cat === 'pagoPosteriormente') return 'Pagamento atrasado';
  if (cat === 'pagoAntecipado') return 'Pagamento antecipado';
  return undefined;
}

/** Em qual(is) grade(s) um filtro se aplica — "ambos" é o padrão (comportamento de sempre). */
export type EscopoFiltro = 'banco' | 'sistema' | 'ambos';

export interface FiltrosConciliacao {
  bancoNome: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  /** Em qual grade o filtro de Data vale — só Banco, só Sistema, ou as duas. */
  escopoData: EscopoFiltro;
  formaPagamento: FormaPagamento | null;
  /** Em qual grade o filtro de Pagamento vale — só Banco, só Sistema, ou as duas. */
  escopoPagamento: EscopoFiltro;
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
