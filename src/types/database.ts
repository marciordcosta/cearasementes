// Tipos manuais espelhando supabase/migrations/0001_init.sql.
// Se preferir gerar automaticamente no futuro:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts
//
// `Relationships: []` em cada tabela é exigido pelo tipo GenericTable do
// postgrest-js/supabase-js — sem ele o client cai silenciosamente para `never`.

export interface Database {
  public: {
    Tables: {
      entregas_transportadora: {
        Row: {
          id: string;
          transportadora: string;
          valor: number;
          data_pedido: string | null;
          arquivo_origem: string;
          upload_log_id: string | null;
          criado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['entregas_transportadora']['Row'], 'id' | 'criado_em' | 'upload_log_id'> & {
          upload_log_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['entregas_transportadora']['Insert']>;
        Relationships: [];
      };
      vendas_tabela_preco: {
        Row: {
          id: string;
          tabela_preco: string;
          codigo_cliente: string | null;
          valor_bruto: number;
          desconto: number;
          valor_liquido: number;
          data_venda: string | null;
          arquivo_origem: string;
          upload_log_id: string | null;
          /** Nº do documento/NF do relatório de origem — usado como chave (com tabela_preco) pra não duplicar em uploads com datas sobrepostas. Null quando o upload não mapeou essa coluna. */
          num_doc: string | null;
          criado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['vendas_tabela_preco']['Row'], 'id' | 'criado_em' | 'upload_log_id' | 'num_doc'> & {
          upload_log_id?: string | null;
          num_doc?: string | null;
        };
        Update: Partial<Database['public']['Tables']['vendas_tabela_preco']['Insert']>;
        Relationships: [];
      };
      uploads_log: {
        Row: {
          id: string;
          arquivo_nome: string;
          tipo_relatorio: '124' | '396' | '333' | 'ofx' | 'sistema';
          linhas_importadas: number;
          status: 'sucesso' | 'aviso' | 'erro';
          mensagem: string | null;
          /** Nome do sub-grupo pra agrupar numa linha só: Tabela de Preço (396), banco (ofx, ex. "Banco do Brasil") ou tipo de lançamento (sistema, "Entrada"/"Saída"). */
          tabela_preco: string | null;
          /** Menor/maior data BRUTA (sem filtro de período fechado) das linhas do arquivo — alimenta o recálculo da janela fechada. Null pro 333 (sem coluna de data). */
          data_min: string | null;
          data_max: string | null;
          criado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['uploads_log']['Row'], 'id' | 'criado_em' | 'tabela_preco' | 'data_min' | 'data_max'> & {
          tabela_preco?: string | null;
          data_min?: string | null;
          data_max?: string | null;
        };
        Update: Partial<Database['public']['Tables']['uploads_log']['Insert']>;
        Relationships: [];
      };
      upload_mapeamentos: {
        Row: {
          tipo_relatorio: '124' | '396' | '333';
          mapeamento: Record<string, number | null>;
          atualizado_em: string;
        };
        Insert: Database['public']['Tables']['upload_mapeamentos']['Row'];
        Update: Partial<Database['public']['Tables']['upload_mapeamentos']['Row']>;
        Relationships: [];
      };
      canais_preco: {
        Row: {
          id: string;
          nome: string;
          desconto: number;
          comissao: number;
          cartao: number;
          outros_encargos: number;
          frete_kg: number;
          frete_pct: number;
          frete_adicional_tipo: 'fixo' | 'kg';
          frete_adicional_valor: number;
          tipo_imposto: 'estadual' | 'interestadual';
          visivel: boolean;
          frete_incluso: boolean;
          cor_indice: number;
          ordem: number;
          /** Transportadora+Região (tabela `transportadoras`) usada pra alimentar frete_kg/frete_pct automaticamente */
          transportadora_id: string | null;
          criado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['canais_preco']['Row'], 'id' | 'criado_em'>;
        Update: Partial<Database['public']['Tables']['canais_preco']['Insert']>;
        Relationships: [];
      };
      categorias: {
        Row: {
          id: string;
          nome: string;
          estadual: number;
          interestadual: number;
          ordem: number;
          criado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['categorias']['Row'], 'id' | 'criado_em'>;
        Update: Partial<Database['public']['Tables']['categorias']['Insert']>;
        Relationships: [];
      };
      categoria_margens: {
        Row: { categoria_id: string; canal_id: string; margem_pct: number };
        Insert: Database['public']['Tables']['categoria_margens']['Row'];
        Update: Partial<Database['public']['Tables']['categoria_margens']['Row']>;
        Relationships: [];
      };
      produtos: {
        Row: {
          id: string;
          nome: string;
          codigo: string | null;
          categoria_id: string;
          custo: number;
          peso: number;
          despesa_extra_valor: number;
          /** Sem uso a partir da introdução da Cubagem — mantido só por compatibilidade com a coluna já existente no banco. */
          despesa_extra_destino: 'frete' | 'impostos';
          /** "C x L x A" em metros (ex.: "0,60x0,40x0,10") — null/vazio = usa o peso cadastrado no cálculo de frete. */
          cubagem: string | null;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['produtos']['Row'], 'id' | 'criado_em' | 'atualizado_em'>;
        Update: Partial<Omit<Database['public']['Tables']['produtos']['Row'], 'id' | 'criado_em'>>;
        Relationships: [];
      };
      produto_precos: {
        Row: { produto_id: string; canal_id: string; preco: number | null; manual: boolean };
        Insert: Database['public']['Tables']['produto_precos']['Row'];
        Update: Partial<Database['public']['Tables']['produto_precos']['Row']>;
        Relationships: [];
      };

      // ---------------------------------------------------------------
      // Módulo Gestão de Fretes
      // ---------------------------------------------------------------
      transportadoras: {
        Row: {
          id: string;
          nome: string;
          uf: string;
          valor_por_kg: number;
          valor_por_nf: number;
          valor_por_nf_tipo: 'percentual' | 'fixo';
          taxa_coleta: number;
          taxa_coleta_tipo: 'percentual' | 'fixo';
          frete_minimo: number;
          prazo_padrao_horas: number | null;
          prazo_padrao_texto: string | null;
          ativa: boolean;
          ordem: number;
          criado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['transportadoras']['Row'], 'id' | 'criado_em'>;
        Update: Partial<Database['public']['Tables']['transportadoras']['Insert']>;
        Relationships: [];
      };
      transportadora_prazos: {
        Row: {
          id: string;
          transportadora_id: string;
          cidade: string;
          prazo_horas: number | null;
          prazo_texto: string | null;
          criado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['transportadora_prazos']['Row'], 'id' | 'criado_em'>;
        Update: Partial<Database['public']['Tables']['transportadora_prazos']['Insert']>;
        Relationships: [];
      };
      rota_parametros: {
        Row: {
          id: number;
          nome_transporte: string;
          cidade_inicio: string;
          valor_km: number;
          media_km_dia: number;
          velocidade_media: number;
          jornada_inicio_hora: number;
          jornada_fim_hora: number;
          pausa_horas: number;
          peso_minimo_comparativo: number;
          despesa_extra_dia: number;
          horario_inicio: string;
          atualizado_em: string;
        };
        Insert: Partial<Database['public']['Tables']['rota_parametros']['Row']>;
        Update: Partial<Database['public']['Tables']['rota_parametros']['Row']>;
        Relationships: [];
      };
      rota_cidades_cache: {
        Row: {
          id: string;
          cidade_normalizada: string;
          cidade_exibicao: string;
          latitude: number;
          longitude: number;
          criado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['rota_cidades_cache']['Row'], 'id' | 'criado_em'>;
        Update: Partial<Database['public']['Tables']['rota_cidades_cache']['Insert']>;
        Relationships: [];
      };

      // ---------------------------------------------------------------
      // Módulo Conciliação Bancária
      // ---------------------------------------------------------------
      conciliacao_grupos: {
        Row: { id: string; criado_em: string };
        Insert: Partial<Database['public']['Tables']['conciliacao_grupos']['Row']>;
        Update: Partial<Database['public']['Tables']['conciliacao_grupos']['Row']>;
        Relationships: [];
      };
      conciliacao_arquivos: {
        Row: {
          id: string;
          nome_arquivo: string;
          tipo: 'ofx' | 'sistema';
          banco_codigo: string | null;
          banco_nome: string | null;
          /** Só pro tipo 'sistema': "Entrada" ou "Saída" — usado pra apagar certinho o sub-grupo quando a linha mesclada em Uploads é removida. */
          sub_grupo: string | null;
          enviado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['conciliacao_arquivos']['Row'], 'id' | 'enviado_em' | 'sub_grupo'> & { sub_grupo?: string | null };
        Update: Partial<Database['public']['Tables']['conciliacao_arquivos']['Insert']>;
        Relationships: [];
      };
      conciliacao_lancamentos_banco: {
        Row: {
          id: string;
          arquivo_id: string | null;
          origem: 'ofx' | 'manual';
          banco_codigo: string | null;
          banco_nome: string | null;
          data: string;
          valor: number;
          descricao: string | null;
          forma_pagamento: 'PIX' | 'CARTAO' | 'BOLETO' | 'CHEQUE' | 'RENDIMENTO' | 'OUTRO';
          /** Identificador único da transação atribuído pelo próprio banco (tag OFX <FITID>) — usado pra upsert (reenviar extrato com dias sobrepostos não duplica). Null pra lançamentos manuais. */
          fitid: string | null;
          conciliado: boolean;
          desativado: boolean;
          marcado: boolean;
          observacao: string | null;
          grupo_id: string | null;
          criado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['conciliacao_lancamentos_banco']['Row'], 'id' | 'criado_em' | 'fitid'> & { fitid?: string | null };
        Update: Partial<Database['public']['Tables']['conciliacao_lancamentos_banco']['Insert']>;
        Relationships: [];
      };
      conciliacao_lancamentos_sistema: {
        Row: {
          id: string;
          arquivo_id: string | null;
          origem: 'sistema' | 'manual' | 'taxa_automatica';
          tipo_lancamento: 'Entrada' | 'Saída';
          cliente: string | null;
          documento: string | null;
          nf: string | null;
          vendedor: string | null;
          forma_pagamento_raw: string | null;
          valor: number;
          data: string | null;
          conciliado: boolean;
          desativado: boolean;
          taxa_valor: number;
          taxa_percentual: number;
          grupo_id: string | null;
          /** documento, ou (se não tiver) cliente|vendedor|forma_pagamento_raw — chave de upsert junto com data+valor (nem todo lançamento tem nº de documento). */
          chave_dedup: string | null;
          /** True depois que o usuário confirma (na "bolha" de registros manuais) que a NF foi de fato emitida e o lançamento já foi replicado no ERP. */
          lancado_erp: boolean;
          criado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['conciliacao_lancamentos_sistema']['Row'], 'id' | 'criado_em' | 'chave_dedup' | 'lancado_erp'> & {
          chave_dedup?: string | null;
          lancado_erp?: boolean;
        };
        Update: Partial<Database['public']['Tables']['conciliacao_lancamentos_sistema']['Insert']>;
        Relationships: [];
      };
      conciliacao_regras: {
        Row: {
          id: string;
          forma_pagamento: 'PIX' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'BOLETO' | 'CHEQUE';
          tolerancia_valor: number;
          dias_uteis_min: number | null;
          dias_uteis_max: number | null;
          taxa_min_percentual: number | null;
          taxa_max_percentual: number | null;
          nome_min_contido: number | null;
          nome_min_sobrenome: number | null;
          exigir_nf_automatica: boolean;
          atualizado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['conciliacao_regras']['Row'], 'id' | 'atualizado_em'>;
        Update: Partial<Database['public']['Tables']['conciliacao_regras']['Insert']>;
        Relationships: [];
      };

      // ---------------------------------------------------------------
      // Módulo Gerenciador de Arquivos
      // ---------------------------------------------------------------
      arquivos_laudos: {
        Row: {
          id: string;
          nome_produto: string;
          lote: string | null;
          ano_safra: string | null;
          arquivo_nome: string;
          arquivo_url: string;
          arquivo_tipo: string | null;
          tamanho_bytes: number | null;
          enviado_em: string;
          pureza: string | null;
          germinacao: string | null;
          validade: string | null;
        };
        Insert: Omit<Database['public']['Tables']['arquivos_laudos']['Row'], 'id' | 'enviado_em'>;
        Update: Partial<Database['public']['Tables']['arquivos_laudos']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
