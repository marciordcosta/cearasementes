import { fetchAllRows } from '@/lib/fetchAll';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import { kmPorDiaCheio } from './calculations';
import type { PrazoTransportadora, RotaParametros, Transportadora } from './types';

type TransportadoraRow = Database['public']['Tables']['transportadoras']['Row'];
type PrazoRow = Database['public']['Tables']['transportadora_prazos']['Row'];
type RotaParametrosRow = Database['public']['Tables']['rota_parametros']['Row'];

function prazoFromRow(row: PrazoRow): PrazoTransportadora {
  return { id: row.id, cidade: row.cidade, prazoHoras: row.prazo_horas, prazoTexto: row.prazo_texto };
}

function transportadoraFromRow(row: TransportadoraRow, prazos: PrazoTransportadora[]): Transportadora {
  return {
    id: row.id,
    nome: row.nome,
    uf: row.uf,
    valorPorKg: row.valor_por_kg,
    valorPorNf: row.valor_por_nf,
    valorPorNfTipo: row.valor_por_nf_tipo,
    taxaColeta: row.taxa_coleta,
    taxaColetaTipo: row.taxa_coleta_tipo,
    freteMinimo: row.frete_minimo,
    prazoPadraoHoras: row.prazo_padrao_horas,
    prazoPadraoTexto: row.prazo_padrao_texto,
    ativa: row.ativa,
    ordem: row.ordem,
    prazos,
  };
}

/** Busca todas as transportadoras já com os prazos por cidade (tabela grande — usa fetchAllRows). */
export async function fetchTransportadoras(): Promise<Transportadora[]> {
  const [transportadoras, prazos] = await Promise.all([
    fetchAllRows<TransportadoraRow>((from, to) => supabase.from('transportadoras').select('*').order('ordem').range(from, to)),
    fetchAllRows<PrazoRow>((from, to) => supabase.from('transportadora_prazos').select('*').range(from, to)),
  ]);

  const prazosPorTransportadora = new Map<string, PrazoTransportadora[]>();
  prazos.forEach((p) => {
    const lista = prazosPorTransportadora.get(p.transportadora_id) ?? [];
    lista.push(prazoFromRow(p));
    prazosPorTransportadora.set(p.transportadora_id, lista);
  });

  return transportadoras.map((t) => transportadoraFromRow(t, prazosPorTransportadora.get(t.id) ?? []));
}

export interface NovaTransportadoraInput {
  nome: string;
  uf: string;
  valorPorKg: number;
  valorPorNf: number;
  valorPorNfTipo: 'percentual' | 'fixo';
  taxaColeta: number;
  taxaColetaTipo: 'percentual' | 'fixo';
  freteMinimo: number;
}

export async function inserirTransportadora(input: NovaTransportadoraInput, ordem: number): Promise<Transportadora> {
  const { data, error } = await supabase
    .from('transportadoras')
    .insert({
      nome: input.nome,
      uf: input.uf,
      valor_por_kg: input.valorPorKg,
      valor_por_nf: input.valorPorNf,
      valor_por_nf_tipo: input.valorPorNfTipo,
      taxa_coleta: input.taxaColeta,
      taxa_coleta_tipo: input.taxaColetaTipo,
      frete_minimo: input.freteMinimo,
      prazo_padrao_horas: null,
      prazo_padrao_texto: null,
      ativa: true,
      ordem,
    })
    .select('*')
    .single();
  if (error) throw error;
  return transportadoraFromRow(data, []);
}

export async function atualizarTransportadora(id: string, patch: Partial<Database['public']['Tables']['transportadoras']['Update']>): Promise<void> {
  const { error } = await supabase.from('transportadoras').update(patch).eq('id', id);
  if (error) throw error;
}

export async function apagarTransportadora(id: string): Promise<void> {
  const { error } = await supabase.from('transportadoras').delete().eq('id', id);
  if (error) throw error;
}

export async function upsertPrazo(transportadoraId: string, cidade: string, prazoHoras: number | null, prazoTexto: string | null): Promise<void> {
  const { error } = await supabase
    .from('transportadora_prazos')
    .upsert({ transportadora_id: transportadoraId, cidade, prazo_horas: prazoHoras, prazo_texto: prazoTexto }, { onConflict: 'transportadora_id,cidade' });
  if (error) throw error;
}

export async function apagarPrazo(id: string): Promise<void> {
  const { error } = await supabase.from('transportadora_prazos').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Aplica a Transportadora+Região escolhida na Parametrização de um canal:
 * copia valor_por_kg -> frete_kg sempre; valor_por_nf -> frete_pct SÓ
 * quando for percentual (fretePct do canal é sempre uma porcentagem — um
 * valor fixo de NF, tipo o da Potyguar, não tem como virar % automaticamente,
 * o usuário ajusta manualmente esse caso em Outros Encargos).
 */
export async function aplicarTransportadoraNoCanal(canalId: string, transportadora: Transportadora): Promise<{ pctAplicado: boolean }> {
  const patch: Database['public']['Tables']['canais_preco']['Update'] = {
    transportadora_id: transportadora.id,
    frete_kg: transportadora.valorPorKg,
  };
  const pctAplicado = transportadora.valorPorNfTipo === 'percentual';
  if (pctAplicado) {
    patch.frete_pct = transportadora.valorPorNf * 100;
  }
  const { error } = await supabase.from('canais_preco').update(patch).eq('id', canalId);
  if (error) throw error;
  return { pctAplicado };
}

function rotaParametrosFromRow(row: RotaParametrosRow): RotaParametros {
  return {
    nomeTransporte: row.nome_transporte,
    cidadeInicio: row.cidade_inicio,
    valorKm: row.valor_km,
    velocidadeMedia: row.velocidade_media,
    jornadaInicioHora: row.jornada_inicio_hora,
    jornadaFimHora: row.jornada_fim_hora,
    pausaHoras: row.pausa_horas,
    pesoMinimoComparativo: row.peso_minimo_comparativo,
    despesaExtraDia: row.despesa_extra_dia,
    horarioInicio: row.horario_inicio.slice(0, 5),
  };
}

/** Parametrização única (singleton, id=1) da Rota de Frota Própria — a migração já garante que a linha existe. */
export async function fetchRotaParametros(): Promise<RotaParametros> {
  const { data, error } = await supabase.from('rota_parametros').select('*').eq('id', 1).single();
  if (error) throw error;
  return rotaParametrosFromRow(data);
}

/** Cidades já usadas em rotas anteriores (geocodificadas e cacheadas) — reforça a sugestão de autocomplete da Rota além das cidades das transportadoras. */
export async function fetchCidadesRotaCache(): Promise<string[]> {
  const { data, error } = await supabase.from('rota_cidades_cache').select('cidade_exibicao').order('cidade_exibicao');
  if (error) throw error;
  return data.map((r) => r.cidade_exibicao);
}

export async function salvarRotaParametros(input: RotaParametros): Promise<void> {
  const { error } = await supabase
    .from('rota_parametros')
    .update({
      nome_transporte: input.nomeTransporte,
      cidade_inicio: input.cidadeInicio,
      valor_km: input.valorKm,
      velocidade_media: input.velocidadeMedia,
      jornada_inicio_hora: input.jornadaInicioHora,
      jornada_fim_hora: input.jornadaFimHora,
      pausa_horas: input.pausaHoras,
      peso_minimo_comparativo: input.pesoMinimoComparativo,
      // Calculado a partir de velocidade + jornada (já descontada a pausa) — não é mais digitado direto, mas continua gravado pra quem quiser consultar direto no banco.
      media_km_dia: kmPorDiaCheio(input),
      despesa_extra_dia: input.despesaExtraDia,
      horario_inicio: input.horarioInicio,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', 1);
  if (error) throw error;
}
