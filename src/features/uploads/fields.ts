import type { CampoAlvo, TipoRelatorio } from './types';

// Campos que o ERP realmente precisa gravar no Supabase para cada relatório.
// Qualquer outra coluna da planilha original é ignorada — é isso que evita
// salvar lixo/colunas inúteis no banco.
export const CAMPOS_POR_RELATORIO: Record<TipoRelatorio, CampoAlvo[]> = {
  '124': [
    { chave: 'transportadora', rotulo: 'Transportadora (Entregador)', obrigatorio: true, palpiteCabecalho: /entregador/i },
    { chave: 'valor', rotulo: 'Valor', obrigatorio: true, palpiteCabecalho: /^valor$/i },
    { chave: 'data_pedido', rotulo: 'Data do Pedido', obrigatorio: false, palpiteCabecalho: /^data$/i },
  ],
  '396': [
    { chave: 'valor_bruto', rotulo: 'Valor Bruto (Vlr. S/Desc.)', obrigatorio: true, palpiteCabecalho: /^Vlr\.?\s*S\.?\s*Desc\.?$/i },
    { chave: 'desconto', rotulo: 'Desconto (V. Desc.)', obrigatorio: true, palpiteCabecalho: /^V\.?\s*Desc\.?$/i },
    { chave: 'valor_liquido', rotulo: 'Valor Líquido (Vlr. C/Desc.)', obrigatorio: true, palpiteCabecalho: /^Vlr\.?\s*C\.?\s*Desc\.?$/i },
    { chave: 'data_venda', rotulo: 'Data da Venda', obrigatorio: false, palpiteCabecalho: /^Data$/i },
    { chave: 'codigo_cliente', rotulo: 'Código do Cliente', obrigatorio: false, palpiteCabecalho: /^C[oó]d\.?\s*Cli/i },
  ],
  '333': [
    { chave: 'codigo', rotulo: 'Código Interno', obrigatorio: true, palpiteCabecalho: /^C[oó]digo$/i },
    { chave: 'nome', rotulo: 'Produto', obrigatorio: true, palpiteCabecalho: /^Produto:?$/i },
    { chave: 'custo', rotulo: 'Custo Unitário', obrigatorio: true, palpiteCabecalho: /^Custo$/i },
  ],
};

export const NOME_RELATORIO: Record<TipoRelatorio, string> = {
  '124': 'Relatório 124 — Entregas por Transportadora',
  '396': 'Relatório 396 — Vendas por Tabela de Preço',
  '333': 'Relatório 333 — Produtos Vendidos (CMV)',
};
