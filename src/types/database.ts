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
          criado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['vendas_tabela_preco']['Row'], 'id' | 'criado_em' | 'upload_log_id'> & {
          upload_log_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['vendas_tabela_preco']['Insert']>;
        Relationships: [];
      };
      uploads_log: {
        Row: {
          id: string;
          arquivo_nome: string;
          tipo_relatorio: '124' | '396' | '333';
          linhas_importadas: number;
          status: 'sucesso' | 'aviso' | 'erro';
          mensagem: string | null;
          criado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['uploads_log']['Row'], 'id' | 'criado_em'>;
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
          despesa_extra_destino: 'frete' | 'impostos';
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
