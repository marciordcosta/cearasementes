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
  /** Peso de Mil Sementes — editado junto com Pureza/Germinação/Validade, ou direto na grade. Quando preenchido, sobrescreve (só pra esse lote) o PMS base cadastrado na Parametrização de Produtos (ver parametrizacaoProdutos.ts); em branco, a grade mostra e o cálculo usa o PMS base. */
  pms: string | null;
  /** Teste de germinação de campo (nosso, feito com frequência) — editado num modal próprio (ver TesteModal), um resultado por laudo. */
  testeForma: 'sementes' | 'peso' | null;
  testeData: string | null;
  testePlantadas: number | null;
  testeGerminadas: number | null;
  testePesoPlantado: number | null;
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

/**
 * Parametrização por produto (nome) — usada no cálculo de kg/ha pra
 * qualquer laudo desse produto, sem precisar redigitar por lote.
 * `pmsBase` pode ser sobrescrito por lote (`ArquivoLaudo.pms`); `densidadeBase`
 * não tem equivalente por lote (não é mais editável na grade, só aqui).
 * `indiceSobrevivencia` (%, ex.: "35") corrige o VC do laudo quando não há
 * teste de campo (o teste de campo já é medido na terra de verdade, não
 * precisa dessa correção por cima).
 */
export interface ProdutoParametrizacao {
  id: string;
  nomeProduto: string;
  pmsBase: string | null;
  densidadeBase: string | null;
  indiceSobrevivencia: string | null;
}

/**
 * Fator GLOBAL (não é por produto) que corrige o kg/ha conforme a forma
 * real de semeadura — usado só no "Guia de Plantio". 5 linhas fixas (2
 * "modo" + 3 "condicao"); `chave` identifica a linha, só `fator` é editável.
 */
export interface FatorPlantio {
  chave: string;
  categoria: 'modo' | 'condicao';
  rotulo: string;
  fator: string;
}
