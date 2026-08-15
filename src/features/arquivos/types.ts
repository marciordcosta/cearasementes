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
  /** Categoria de semente (ex.: "S2", "C1") — lida do laudo quando o documento traz ("Categoria: S2"), editável em EditarLaudoModal quando não. Usada só no Selo impresso (ver etiqueta.ts). */
  categoria: string | null;
  /** Espécie (ex.: "Andropogon Gayanus") — lida do laudo quando o documento traz ("Espécie: ..."). Compõe nomeProduto (Espécie + Cultivar) e é a linha ESPÉCIE do Selo impresso, sozinha (ver etiqueta.ts); sem campo próprio em EditarLaudoModal (corrige-se pelo Nome do Produto). */
  especie: string | null;
  /** Processo (ex.: "Tradicional", "Incrustado") — lido do laudo quando o documento traz ("Processo: ..."), editável em EditarLaudoModal quando não. Usada só no Selo impresso (ver etiqueta.ts). */
  processo: string | null;
  /** Cultivar (ex.: "Massai", "Marandu") — lido do laudo quando o documento traz ("Cultivar: ..."), editável em EditarLaudoModal quando não. Sem preencher, o Cultivar é derivado do Nome do Produto (ver derivarCultivar em etiqueta.ts). Preenchido nos 2 lados (aqui e em Produto.cultivar, na Tabela de Preço), o casamento laudo↔produto do Catálogo Online compara os 2 direto, sem depender de heurística de nome (ver laudoCasaComProduto em calculoSemeadura.ts). */
  cultivar: string | null;
  /** Fornecedor (ex.: "Barenbrug") — lido do laudo quando o documento traz ("Fornecedor: ..."), editável em EditarLaudoModal quando não. */
  fornecedor: string | null;
  /** Peso por Embalagem (kg) — lido do Boletim de Análise quando o documento traz, editável em EditarLaudoModal quando não. Linha PESO do Selo impresso, com prioridade sobre o peso casado por nome na Tabela de Preço (ver etiqueta.ts). Não confundir com "pms" (Peso de Mil Sementes). */
  pesoEmbalagem: string | null;
  /** Peso de Mil Sementes — editado junto com Pureza/Germinação/Validade, ou direto na grade. Quando preenchido, sobrescreve (só pra esse lote) o PMS base cadastrado na Parametrização de Produtos (ver parametrizacaoProdutos.ts); em branco, a grade mostra e o cálculo usa o PMS base. */
  pms: string | null;
  /**
   * Teste de germinação de campo (nosso, feito com frequência) — editado num
   * modal próprio (ver TesteModal), um resultado por laudo. Em 2 etapas:
   * Plantio (testeForma/testeData/testePlantadas/testePesoPlantado) e,
   * semanas depois, Resultado (testeGerminadas/testeDataResultado/
   * testeObservacao/testeFotos). Sem testeGerminadas ainda, o status é
   * "Em análise" (ver statusTeste em testeGerminacao.ts).
   */
  testeForma: 'sementes' | 'peso' | null;
  /** Data do PLANTIO (etapa 1) — não confundir com testeDataResultado (etapa 2). */
  testeData: string | null;
  testePlantadas: number | null;
  testeGerminadas: number | null;
  testePesoPlantado: number | null;
  /** Fotos do teste de campo (URLs públicas, bucket "laudos") — sempre array, nunca null; mesmo modelo "1 teste por laudo": editar/excluir o teste também substitui/limpa as fotos. */
  testeFotos: string[];
  /** Observação livre do teste de campo (anotação do operador) — mesmo modelo "1 teste por laudo" das demais colunas teste_*. */
  testeObservacao: string | null;
  /** Data do RESULTADO (etapa 2, quando as germinadas são contadas) — null enquanto o teste está "Em análise". */
  testeDataResultado: string | null;
}

export interface NovoLaudoInput {
  nomeProduto: string;
  lote: string;
  anoSafra: string;
  arquivo: File;
  pureza?: string;
  germinacao?: string;
  validade?: string;
  categoria?: string;
  especie?: string;
  processo?: string;
  cultivar?: string;
  fornecedor?: string;
  pesoEmbalagem?: string;
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
  /** Máximo de plântulas estabelecidas (pós-perdas) que cabem numa mesma cova sem competir demais — depende do gênero (Panicum/Brachiaria perfilham e ocupam espaço; Milho/Sorgo são plantas unitárias). Usado no Guia de Plantio pra calcular o espaçamento padrão em modo Covas (Covas/m² = Densidade ÷ esse valor), substituindo o 50×50 fixo. Null = sem limite cadastrado, cai no 50×50. */
  maxPlantulasCova: string | null;
  /** Perda (%) na Condição "Média" — sobrepõe o fator GLOBAL (Parametrização > Plantio) só pra esse produto; a sensibilidade a condição ruim varia por cultivar (Milho aguenta bem menos que um capim já estabelecido). Texto cru (ex.: "25"); null cai no fator global. Ver resolverFatorCondicao. */
  perdaMedia: string | null;
  /** Igual perdaMedia, pra Condição "Baixa". "Ideal" não tem override — é sempre 0% de perda por definição. */
  perdaBaixa: string | null;
  /**
   * Máximo de plântulas ESTABELECIDAS por metro linear de linha (pós-perdas) — 3ª dimensão de
   * densidade, junto com densidadeBase (por m²) e maxPlantulasCova (por cova): cada modo de plantio usa
   * a coluna correspondente (A Lanço → densidadeBase; Covas discretas → maxPlantulasCova; Milho/Sorgo →
   * esta, trava o Corredor sozinho; Linha → esta + densidadeBase juntas, trava o Corredor no máximo que
   * ainda cabe nessa Densidade — ver GuiaPlantioModal.tsx). Null = sem limite cadastrado, sem essa trava.
   */
  maxPlantulasMetroLinear: string | null;
  /** Modo de plantio padrão do grupo (Cova, Lanço ou Linha) — só pré-seleciona o modo ao adicionar o produto no Guia de Plantio, não entra em nenhum cálculo. Null = sem preferência cadastrada (o Guia cai no padrão dele, Lanço). */
  modoPlantio: 'cova' | 'lanco' | 'linha' | null;
  /** Margem de tolerância (%) pra arredondar sacos — até essa % de saco faltando ainda arredonda pra baixo, acima arredonda pra cima. Texto cru (ex.: "25"); null cai no padrão de 25%. */
  margemTolerancia: string | null;
  /** Texto livre impresso na linha "Observação" do Selo (ex.: registro RENASEM do produtor) — fixo por grupo, não muda por lote. */
  observacaoEtiqueta: string | null;
}

/**
 * Fator GLOBAL (não é por produto) que corrige o kg/ha conforme a forma
 * real de semeadura — usado só no "Guia de Plantio". 5 linhas fixas (2
 * "modo" + 3 "condicao"); `chave` identifica a linha, só `fator` e (nas
 * linhas de condição) `resumo` são editáveis.
 */
export interface FatorPlantio {
  chave: string;
  categoria: 'modo' | 'condicao';
  rotulo: string;
  fator: string;
  /** Texto curto explicando a condição (só faz sentido pra categoria 'condicao') — mostrado discreto no Guia de Plantio ao escolher a opção. */
  resumo: string | null;
}

/** Uma opção marcável do Checklist de Diagnóstico de Campo — ligada a UMA das 3 condições (arquivos_fatores_plantio.chave, categoria='condicao'). */
export interface ChecklistOpcao {
  id: string;
  perguntaId: string;
  ordem: number;
  texto: string;
  condicaoChave: string;
}

/** Uma pergunta do Checklist — vem sempre com suas opções (já ordenadas). */
export interface ChecklistPergunta {
  id: string;
  ordem: number;
  pergunta: string;
  opcoes: ChecklistOpcao[];
}

/** Manual de Plantio (texto que acompanha o PDF do Guia de Plantio, se o operador escolher incluir) — uma linha só, editável na Parametrização de Produtos. */
export interface ManualPlantio {
  titulo: string;
  corpo: string;
}
