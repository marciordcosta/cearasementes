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

export interface PrecoCanal {
  preco: number | null;
  manual: boolean;
}

export interface Produto {
  id: string;
  nome: string;
  codigo: string | null;
  categoriaId: string;
  custo: number;
  peso: number;
  /** Sempre entra como Encargos na precificação (não afeta mais o frete — pra isso, ver `cubagem`). */
  despesaExtraValor: number;
  /** "C x L x A" em metros (ex.: "0,60x0,40x0,10") — preenchida, o cálculo de frete usa o peso cubado (volume x 300) no lugar de `peso`. */
  cubagem: string | null;
  /** Aparece na Tabela de Preços logo depois do nome do produto — segue a mesma marcação (asterisco = negrito, underscore = itálico) do nome (ver NomeComDestaque em PricingTable.tsx). */
  fornecedor: string | null;
  /** false = produto some do catálogo em PDF (Exportar), mas continua normal em todo o resto do sistema. Padrão true. */
  imprimir: boolean;
  /** canalId -> preço sugerido/manual daquele canal */
  precos: Record<string, PrecoCanal>;
}

export interface ResultadoCalculo {
  preco: number;
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
