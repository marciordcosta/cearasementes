export type TipoValorFrete = 'percentual' | 'fixo';

export interface PrazoTransportadora {
  id: string;
  cidade: string;
  /** horas úteis — null quando o prazo é em texto (ex.: "Semanal") */
  prazoHoras: number | null;
  prazoTexto: string | null;
}

export interface Transportadora {
  id: string;
  nome: string;
  uf: string;
  valorPorKg: number;
  valorPorNf: number;
  valorPorNfTipo: TipoValorFrete;
  taxaColeta: number;
  taxaColetaTipo: TipoValorFrete;
  freteMinimo: number;
  prazoPadraoHoras: number | null;
  prazoPadraoTexto: string | null;
  ativa: boolean;
  ordem: number;
  /** carregados sob demanda (tela de detalhe/cotação); vazio na listagem simples */
  prazos: PrazoTransportadora[];
}

export interface CotacaoFreteInput {
  cidade: string;
  peso: number;
  valorMercadoria: number;
}

export interface CotacaoFreteResultado {
  transportadoraId: string;
  nome: string;
  uf: string;
  prazo: number | string;
  valorNf: number;
  taxaColeta: number;
  total: number;
  /** % que o frete representa do valor da mercadoria. */
  pctValorCarga: number;
  /** Quanto do frete "pesa" por kg transportado (total / peso). */
  custoPorKg: number;
}

export type ModoCotacao = 'direta' | 'orcamento';

/** Parametrização única (não por transportadora) da Rota de Frota Própria. */
export interface RotaParametros {
  nomeTransporte: string;
  cidadeInicio: string;
  valorKm: number;
  /** km/h médios do veículo — junto com a jornada diária, define quanto se roda por dia. */
  velocidadeMedia: number;
  /** Hora do dia (0-23, pode ter fração — ex.: 6.5 = 06:30) em que a jornada de condução começa. */
  jornadaInicioHora: number;
  /** Hora do dia em que a jornada de condução termina. */
  jornadaFimHora: number;
  /** Duração fixa (h) de pausa (almoço/descanso) descontada do total de horas dirigíveis de cada dia, inclusive o 1º dia parcial. */
  pausaHoras: number;
  /** Peso (kg) mínimo do frete de Cidade única a partir do qual o comparativo com Frota Própria dispara sozinho — 0 desliga o gatilho automático. */
  pesoMinimoComparativo: number;
  despesaExtraDia: number;
  /** "HH:mm" — horário real de saída do 1º dia; define quantas horas de condução sobram nesse primeiro dia (dia parcial se sair no meio da jornada). */
  horarioInicio: string;
}

export interface RotaTrecho {
  de: string;
  para: string;
  km: number;
  /** Dia da viagem (1-indexado) em que a carga chega nesse trecho. */
  chegadaDia: number;
  /** Horário aproximado de chegada nesse dia, "HH:MM". */
  chegadaHorario: string;
}

export interface RotaResultado {
  kmTotal: number;
  diasViagem: number;
  valorFrete: number;
  pctValorCarga: number;
  custoPorKg: number;
  trechos: RotaTrecho[];
}

/**
 * Um produto adicionado ao orçamento — peso/preço-tabela/despesa-extra vêm
 * SEMPRE calculados na hora a partir do Produto+Tabela de Preço escolhidos
 * (não são "congelados" ao adicionar), só quantidade e o override manual de
 * valor (se houver) são de fato estado local do orçamento.
 */
export interface ItemOrcamento {
  produtoId: string;
  quantidade: number;
  /** Preço unitário digitado manualmente pelo usuário — null = usa o preço da tabela (calculado). Só vale pra esse orçamento, nunca é gravado no produto/tabela. */
  valorManual: number | null;
}
