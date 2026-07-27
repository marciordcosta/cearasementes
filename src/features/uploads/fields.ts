import type { CampoAlvo, TipoRelatorioLog, TipoRelatorioMapeado } from './types';

// Campos que o ERP realmente precisa gravar no Supabase para cada relatório
// que ainda passa por mapeamento manual de coluna. Qualquer outra coluna da
// planilha original é ignorada — é isso que evita salvar lixo/colunas
// inúteis no banco. O 396 (formato matricial novo) não entra aqui: tem
// parser dedicado (vendas396/parsing.ts), que já sabe onde cada campo fica
// sem precisar que o usuário aponte coluna por coluna.
export const CAMPOS_POR_RELATORIO: Record<TipoRelatorioMapeado, CampoAlvo[]> = {
  '124': [
    { chave: 'transportadora', rotulo: 'Transportadora (Entregador)', obrigatorio: true, palpiteCabecalho: /entregador/i },
    { chave: 'valor', rotulo: 'Valor', obrigatorio: true, palpiteCabecalho: /^valor$/i },
    { chave: 'data_pedido', rotulo: 'Data do Pedido', obrigatorio: false, palpiteCabecalho: /^data$/i },
  ],
};

export const NOME_RELATORIO: Record<TipoRelatorioLog, string> = {
  '124': 'Relatório 124 — Entregas por Transportadora',
  '396': 'Relatório 396 — Vendas por Tabela de Preço (detalhado)',
  '333': 'Relatório 333 — Produtos Vendidos (CMV) — descontinuado',
  ofx: 'Conciliação — Extrato Bancário (OFX)',
  sistema: 'Conciliação — Relatório do Sistema',
};
