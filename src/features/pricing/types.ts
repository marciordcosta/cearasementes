export type FreteAdicionalTipo = 'fixo' | 'kg';
export type TipoImposto = 'estadual' | 'interestadual';
export type DespesaDestino = 'frete' | 'impostos';

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
  despesaExtraValor: number;
  despesaExtraDestino: DespesaDestino;
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
  despesaParaFrete: number;
  despesaParaImposto: number;
}
