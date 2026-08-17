/** 'transportadora' = Frete cobrado do cliente passa a ser o valor AO VIVO da Transportadora vinculada ao canal (mesma fonte usada no custo interno), não um valor fixo/por Kg digitado à mão — ver freteAdicionalReais em calculations.ts. */
export type FreteAdicionalTipo = 'fixo' | 'kg' | 'transportadora';
export type TipoImposto = 'estadual' | 'interestadual';

export interface Canal {
  id: string;
  nome: string;
  desconto: number;
  comissao: number;
  cartao: number;
  outrosEncargos: number;
  freteKg: number;
  fretePct: number;
  freteAdicionalTipo: FreteAdicionalTipo;
  freteAdicionalValor: number;
  tipoImposto: TipoImposto;
  visivel: boolean;
  freteIncluso: boolean;
  corIndice: number;
  ordem: number;
  /** Transportadora+Região (módulo Fretes) que alimentou frete_kg/frete_pct — null se preenchido manualmente */
  transportadoraId: string | null;
  /** true = a margem alvo (%) da categoria/subcategoria é ignorada — o preço sugerido mira o mesmo valor de Margem R$ que OUTRA Tabela calcula, usando os encargos/frete/imposto DESTE canal. Qual Tabela referenciar (e o ajuste %) é escolhido por Categoria — ver Categoria.referenciaCanalId/referenciaAjustePct. */
  margemPorReferencia: boolean;
  /** Número de WhatsApp (com DDI+DDD, só dígitos) usado no Catálogo Online desse canal — botão flutuante e envio de orçamento. Cada Tabela tem o seu, null = sem WhatsApp cadastrado (esconde o botão no link público). */
  whatsapp: string | null;
  /** true = o card do Catálogo Online desse canal mostra VC%/Validade (além de Fornecedor) — false (padrão) mostra só o nome e o Fornecedor, sem esses detalhes agronômicos. Por Tabela, porque o público de cada uma pode ser diferente (produtor final x revenda). */
  mostrarDetalhesPlantio: boolean;
}

export interface Categoria {
  id: string;
  nome: string;
  estadual: number;
  interestadual: number;
  ordem: number;
  /** canalId -> margem alvo (%) */
  margens: Record<string, number>;
  /** canalId -> tolerância (pontos percentuais) em volta da margem alvo — chave ausente = sem alerta configurado. Só vale quando o canal calcula "por categoria" (não "por referência"). */
  tolerancias: Record<string, number>;
  /** canalId -> id de OUTRA Tabela a referenciar — só lido quando esse canal está em "por referência" (Canal.margemPorReferencia). Cada Categoria escolhe a sua própria referência por Tabela (ex.: Capim mira Revenda PI na Revenda CE, Milho mira Padrão na mesma Revenda CE). Chave ausente = essa categoria ainda não escolheu. */
  referenciaCanalId: Record<string, string>;
  /** canalId -> ajuste (%) sobre a Margem R$ da referência dessa categoria — positivo/negativo, 0 = sem ajuste (padrão). Só vale com referenciaCanalId preenchido pra esse canal. */
  referenciaAjustePct: Record<string, number>;
}

/** Subcategoria (Parametrização) — não tem alíquota própria (imposto sempre vem da categoria pai). */
export interface Subcategoria {
  id: string;
  categoriaId: string;
  nome: string;
  ordem: number;
  /** canalId -> margem (%) só quando sobrescreve a da categoria pai — chave ausente = herda. */
  margens: Record<string, number>;
}

export interface PrecoCanal {
  preco: number | null;
  manual: boolean;
  /** Marca essa linha, só nesse canal, como precisando de ajuste — destaca na tabela e some do catálogo em PDF desse canal. */
  precisaAjuste: boolean;
}

/** Cadastro de Fornecedor (Parametrização de Custos) — o nome pode conter a mesma marcação (asterisco = negrito, underscore = itálico) do nome do produto (ver NomeComDestaque em PricingTable.tsx). */
export interface Fornecedor {
  id: string;
  nome: string;
  ordem: number;
  /** false = produtos desse fornecedor somem da grade da Tabela de Preços (e, por consequência, do PDF também). Padrão true. */
  visivelGrade: boolean;
  /** false = produtos desse fornecedor somem só do PDF (Exportar), continuam normais na grade. Sem efeito se visivelGrade já for false. Padrão true. */
  visivelPdf: boolean;
}

/** 'reais' = valor fixo em R$ (ex.: aluguel); 'percentual' = já expresso como % das vendas (ex.: taxa de plataforma). */
export type TipoCustoPersonalizado = 'reais' | 'percentual';

/**
 * Custo Personalizado (Parametrização de Custos > aba "Custos") — lista global de
 * custos da empresa, puramente informativa: NÃO entra no cálculo do preço sugerido.
 * A tela mostra, ao lado de cada um, quanto representa do total desses custos e do
 * total das vendas (média das últimas safras) — ver CustosPersonalizadosPanel.tsx.
 */
export interface CustoPersonalizado {
  id: string;
  descricao: string;
  tipo: TipoCustoPersonalizado;
  valor: number;
  ordem: number;
}

export interface Produto {
  id: string;
  nome: string;
  codigo: string | null;
  categoriaId: string;
  /** custo = valorKg x peso — calculado e salvo a partir do Editar Produto, não é mais digitado direto na Tabela de Preços. */
  custo: number;
  /** R$/Kg cadastrado no Editar Produto — junto com o peso, define o Custo (R$) da Tabela de Preços. */
  valorKg: number;
  peso: number;
  /** Sempre entra como Encargos na precificação (não afeta mais o frete — pra isso, ver `cubagem`). */
  despesaExtraValor: number;
  /** "C x L x A" em metros (ex.: "0,60x0,40x0,10") — preenchida, o cálculo de frete usa o peso cubado (volume x 300) no lugar de `peso`. */
  cubagem: string | null;
  /** Cadastrado em Parametrização (ver Fornecedor abaixo) — aparece na Tabela de Preços logo depois do nome do produto, mesma marcação (asterisco = negrito, underscore = itálico) do nome (ver NomeComDestaque em PricingTable.tsx). */
  fornecedorId: string | null;
  /** Escolhida junto com a categoria no campo "Classe" do Editar Produto — a margem dela sobrepõe a da categoria pai quando preenchida. */
  subcategoriaId: string | null;
  /** false = produto some do catálogo em PDF (Exportar), mas continua normal em todo o resto do sistema. Padrão true. */
  imprimir: boolean;
  /** true = Encargos "Desconto" usa o desconto médio real do BI (última Safra, ver historicoBi.ts) pra esse produto, quando houver dado; false (padrão) = sempre usa o Canal.desconto cadastrado, mesmo com dado disponível — opt-in, não é mais automático. */
  usarDescontoReal: boolean;
  /** true (padrão) = segue a configuração da Tabela (Canal.mostrarDetalhesPlantio) pra VC%/Validade/PMS no card do Catálogo Online; false SOBREPÕE a Tabela e esconde esses detalhes só pra ESSE produto, mesmo com a Tabela mostrando pros demais. */
  mostrarDetalhesCatalogo: boolean;
  /** Opcional (ex.: "Massai", "Marandu"). Preenchido nos 2 lados (aqui e em ArquivoLaudo.cultivar), o Catálogo Online casa esse produto com o laudo certo comparando os 2 campos direto, sem depender de o nome bater por texto (ver laudoCasaComProduto em calculoSemeadura.ts) — em branco, continua casando por nome como hoje. */
  cultivar: string | null;
  /** canalId -> preço sugerido/manual daquele canal */
  precos: Record<string, PrecoCanal>;
}

export interface ResultadoCalculo {
  preco: number;
  /** Preço calculado pela fórmula (markup por dentro), ignorando preço manual — usado só pra exibir "sugerido: R$ X" quando o preço estiver em modo manual. */
  precoSugerido: number;
  freteReais: number;
  impostoReais: number;
  margemReais: number;
  margemPct: number;
  margemAlvo: number;
  /** Base do alerta de tolerância: igual a margemAlvo em canal "por categoria"; em "por referência", é o ML% REAL que a tabela referenciada está aplicando pra esse produto agora (não a % sugerida da categoria) — é isso que esse canal está espelhando. */
  margemAlvoTolerancia: number;
  /** Pontos percentuais em volta de margemAlvoTolerancia — undefined = sem alerta configurado pra essa categoria+canal. */
  toleranciaPct: number | undefined;
  impostoPct: number;
  encargosPct: number;
  /** A parcela "Desconto" dentro de encargosPct — vem do BI (desconto médio real da última Safra pra esse produto+canal) quando há dado; senão cai pro Canal.desconto cadastrado (ver descontoFonte). */
  descontoPct: number;
  descontoFonte: 'bi' | 'cadastro';
  outrosEncargos: number;
  freteBruto: number;
  freteAdicionalReais: number;
  despesaExtra: number;
  /** Peso realmente usado no cálculo de frete — igual a `produto.peso`, a menos que a cubagem esteja preenchida. */
  pesoUsado: number;
  /** true quando `pesoUsado` veio da cubagem (peso cubado), não do peso cadastrado. */
  pesoCubado: boolean;
}
