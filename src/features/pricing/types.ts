export type FreteAdicionalTipo = 'fixo' | 'kg';
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
  /** Preenchido, a margem alvo (%) da categoria/subcategoria é ignorada — o preço sugerido mira o mesmo valor de Margem R$ que ESSE outro canal calcula, usando os encargos/frete/imposto DESTE canal. */
  margemReferenciaCanalId: string | null;
  /** 0 (padrão) = mira a Margem R$ da referência sem alteração; positivo/negativo = ajusta esse % sobre o valor antes de virar a meta (ex.: -5 tira 5% da margem da referência). Só vale com margemReferenciaCanalId preenchido. */
  margemReferenciaAjustePct: number;
}

export interface Categoria {
  id: string;
  nome: string;
  estadual: number;
  interestadual: number;
  ordem: number;
  /** canalId -> margem alvo (%) */
  margens: Record<string, number>;
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
  impostoPct: number;
  encargosPct: number;
  outrosEncargos: number;
  freteBruto: number;
  freteAdicionalReais: number;
  despesaExtra: number;
  /** Peso realmente usado no cálculo de frete — igual a `produto.peso`, a menos que a cubagem esteja preenchida. */
  pesoUsado: number;
  /** true quando `pesoUsado` veio da cubagem (peso cubado), não do peso cadastrado. */
  pesoCubado: boolean;
}
