/**
 * Formato novo do Relatório 396 (Max-Manager) — exportação "matricial": um
 * bloco por venda, com o(s) item(ns) e a(s) forma(s) de pagamento aninhados
 * dentro do bloco. Um arquivo = uma Tabela de Preço (o Max-Manager só
 * exporta filtrado por tabela, não dá pra pedir "todas de uma vez").
 */

export interface ItemVenda396 {
  codInterno: string | null;
  produto: string;
  vlrUnitario: number;
  qtd: number;
  vlrSemDesc: number;
  vlrDesc: number;
  vlrComDesc: number;
  custoUnitario: number;
}

export interface PagamentoVenda396 {
  formaPagamento: string;
  numDoc: string | null;
  /** ISO (YYYY-MM-DD) */
  vencimento: string | null;
  valor: number;
}

export interface Venda396 {
  /** Nº da linha da planilha onde essa venda começa — só para diagnóstico/mensagem de erro, não é gravado. */
  linha: number;
  codCliente: string;
  cliente: string;
  numVenda: number;
  /** ISO (YYYY-MM-DD) */
  data: string;
  /** HH:MM:SS — o relatório traz data+hora, mas só a data tem uso hoje (BI/Precificação); a hora fica guardada pra quando for útil (ex.: horário de pico). */
  hora: string | null;
  vendedor: string;
  cpfCnpj: string | null;
  numNf: string | null;
  itens: ItemVenda396[];
  pagamentos: PagamentoVenda396[];
}

export interface ResultadoParseVendas396 {
  tabelaPreco: string;
  periodoCabecalho: { inicio: Date; fim: Date } | null;
  vendas: Venda396[];
  /** Linhas do relatório que não bateram com nenhum padrão reconhecido (cabeçalho/rodapé repetido a cada página impressa) — informativo, não é erro. */
  ignoradas: number;
}
