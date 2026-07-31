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
          /** Nº do documento/NF do relatório de origem (formato antigo) — histórico apenas, o formato novo usa `num_venda` (por venda, não por parcela). */
          num_doc: string | null;
          /** Nº da venda do relatório 396 novo — chave (com tabela_preco) pra não duplicar em reenvio/upload sobreposto. Null nas linhas do formato antigo. */
          num_venda: number | null;
          cliente: string | null;
          vendedor: string | null;
          cpf_cnpj: string | null;
          num_nf: string | null;
          /** Hora da venda (o relatório novo traz data+hora, só a data vai em `data_venda`). */
          hora_venda: string | null;
          criado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['vendas_tabela_preco']['Row'], 'id' | 'criado_em' | 'upload_log_id' | 'num_doc' | 'num_venda' | 'cliente' | 'vendedor' | 'cpf_cnpj' | 'num_nf' | 'hora_venda'> & {
          upload_log_id?: string | null;
          num_doc?: string | null;
          num_venda?: number | null;
          cliente?: string | null;
          vendedor?: string | null;
          cpf_cnpj?: string | null;
          num_nf?: string | null;
          hora_venda?: string | null;
        };
        Update: Partial<Database['public']['Tables']['vendas_tabela_preco']['Insert']>;
        Relationships: [];
      };
      vendas_tabela_preco_itens: {
        Row: {
          id: string;
          venda_id: string;
          cod_interno: string | null;
          produto: string;
          vlr_unitario: number;
          qtd: number;
          vlr_sem_desc: number;
          vlr_desc: number;
          vlr_com_desc: number;
          custo_unitario: number;
          criado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['vendas_tabela_preco_itens']['Row'], 'id' | 'criado_em'>;
        Update: Partial<Database['public']['Tables']['vendas_tabela_preco_itens']['Insert']>;
        Relationships: [];
      };
      vendas_tabela_preco_pagamentos: {
        Row: {
          id: string;
          venda_id: string;
          forma_pagamento: string;
          num_doc: string | null;
          vencimento: string | null;
          valor: number;
          criado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['vendas_tabela_preco_pagamentos']['Row'], 'id' | 'criado_em'>;
        Update: Partial<Database['public']['Tables']['vendas_tabela_preco_pagamentos']['Insert']>;
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
          /** Menor/maior data das linhas do arquivo, exatamente como vieram (sem nenhum arredondamento) — usado pra mostrar o período coberto na tela de Uploads. Null pro 333 (sem coluna de data). */
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
        Row: { id: string; criado_em: string; aviso_diferenca: string | null; aviso_dispensado: boolean };
        Insert: Partial<Database['public']['Tables']['conciliacao_grupos']['Row']>;
        Update: Partial<Database['public']['Tables']['conciliacao_grupos']['Row']>;
        Relationships: [];
      };
      conciliacao_sugestoes_descartadas: {
        Row: { id: string; banco_id: string; sistema_id: string; criado_em: string };
        Insert: Omit<Database['public']['Tables']['conciliacao_sugestoes_descartadas']['Row'], 'id' | 'criado_em'>;
        Update: Partial<Database['public']['Tables']['conciliacao_sugestoes_descartadas']['Insert']>;
        Relationships: [];
      };
      conciliacao_rotulos_categoria: {
        Row: { chave: string; rotulo: string };
        Insert: Database['public']['Tables']['conciliacao_rotulos_categoria']['Row'];
        Update: Partial<Database['public']['Tables']['conciliacao_rotulos_categoria']['Insert']>;
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
          /** 'ofx' = veio de arquivo importado (nome histórico — hoje é extrato .xlsx do BB ou recebíveis .csv da Stone, não mais .ofx de verdade). */
          origem: 'ofx' | 'manual';
          banco_codigo: string | null;
          banco_nome: string | null;
          data: string;
          valor: number;
          descricao: string | null;
          forma_pagamento: 'PIX' | 'CARTAO' | 'BOLETO' | 'CHEQUE' | 'RENDIMENTO' | 'OUTRO';
          /** Chave única da transação usada pra upsert (reenviar arquivo com dias sobrepostos não duplica) — hoje é uma chave composta a partir das colunas do próprio extrato/recebíveis (não existe mais tag <FITID>). Null pra lançamentos manuais. */
          fitid: string | null;
          /** Valor BRUTO da venda de cartão (antes da taxa da maquininha) — só preenchido quando a fonte já traz esse dado exato (recebíveis Stone). Usado pra casar a sugestão direto com o valor do Sistema, sem precisar de faixa de %. Null pro Banco do Brasil e lançamentos manuais. */
          valor_bruto_cartao: number | null;
          conciliado: boolean;
          desativado: boolean;
          marcado: boolean;
          observacao: string | null;
          grupo_id: string | null;
          criado_em: string;
        };
        Insert: Omit<
          Database['public']['Tables']['conciliacao_lancamentos_banco']['Row'],
          'id' | 'criado_em' | 'fitid' | 'valor_bruto_cartao' | 'conciliado' | 'desativado' | 'marcado' | 'observacao' | 'grupo_id'
        > & {
          fitid?: string | null;
          valor_bruto_cartao?: number | null;
          conciliado?: boolean;
          desativado?: boolean;
          marcado?: boolean;
          observacao?: string | null;
          grupo_id?: string | null;
        };
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
          /** Data de vencimento impressa no relatório do Sistema — só usada na busca/conciliação de CHEQUE. Null nos demais tipos e em lançamentos importados antes desse campo existir. */
          data_vencimento: string | null;
          conciliado: boolean;
          desativado: boolean;
          taxa_valor: number;
          taxa_percentual: number;
          grupo_id: string | null;
          /** documento, ou (se não tiver) cliente|vendedor|forma_pagamento_raw — chave de upsert junto com data+valor (nem todo lançamento tem nº de documento). */
          chave_dedup: string | null;
          /** True depois que o usuário confirma (na "bolha" de registros manuais) que a NF foi de fato emitida e o lançamento já foi replicado no ERP. */
          lancado_erp: boolean;
          /** Anotação livre do usuário — mesma regra do Banco, independente de conciliado/desativado. */
          observacao: string | null;
          criado_em: string;
        };
        Insert: Omit<
          Database['public']['Tables']['conciliacao_lancamentos_sistema']['Row'],
          'id' | 'criado_em' | 'chave_dedup' | 'lancado_erp' | 'conciliado' | 'desativado' | 'grupo_id' | 'taxa_valor' | 'taxa_percentual' | 'observacao'
        > & {
          chave_dedup?: string | null;
          lancado_erp?: boolean;
          conciliado?: boolean;
          desativado?: boolean;
          grupo_id?: string | null;
          taxa_valor?: number;
          taxa_percentual?: number;
          observacao?: string | null;
        };
        Update: Partial<Database['public']['Tables']['conciliacao_lancamentos_sistema']['Insert']>;
        Relationships: [];
      };
      conciliacao_regras: {
        Row: {
          id: string;
          forma_pagamento: 'GENERICA' | 'CARTAO' | 'BOLETO';
          tolerancia_valor: number;
          /** Só Cartão/Boleto: dias ÚTEIS entre a venda e o recebimento, sem mínimo (aceita do dia 0 até esse máximo). */
          dias_uteis_max: number | null;
          nome_min_contido: number | null;
          nome_min_sobrenome: number | null;
          /** Só GENERICA (PIX/Cheque/Rendimento/Outro): dias corridos de diferença ainda considerados dentro da janela de sugestão, e janela da rede de segurança "recebimento diferente" (todas as formas). */
          dias_tolerancia: number;
          atualizado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['conciliacao_regras']['Row'], 'id' | 'atualizado_em'> & { atualizado_em?: string };
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
          /** Peso de Mil Sementes — quando preenchido, sobrescreve (só pra esse lote) o PMS base da Parametrização de Produtos. */
          pms: string | null;
          /** Teste de germinação de campo (nosso, feito com frequência) — um resultado por laudo, editar substitui o anterior. */
          teste_forma: 'sementes' | 'peso' | null;
          teste_data: string | null;
          teste_plantadas: number | null;
          teste_germinadas: number | null;
          teste_peso_plantado: number | null;
        };
        Insert: Omit<Database['public']['Tables']['arquivos_laudos']['Row'], 'id' | 'enviado_em'>;
        Update: Partial<Database['public']['Tables']['arquivos_laudos']['Insert']>;
        Relationships: [];
      };

      /** PMS base, Densidade base e Índice de Sobrevivência por produto (nome) — parametrização usada no cálculo de kg/ha sempre que o nome do produto do laudo bater com um cadastrado aqui. */
      arquivos_parametrizacao_produtos: {
        Row: {
          id: string;
          nome_produto: string;
          pms_base: string | null;
          densidade_base: string | null;
          indice_sobrevivencia: string | null;
          atualizado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['arquivos_parametrizacao_produtos']['Row'], 'id' | 'atualizado_em'> & { id?: string; atualizado_em?: string };
        Update: Partial<Database['public']['Tables']['arquivos_parametrizacao_produtos']['Insert']>;
        Relationships: [];
      };

      /** Fatores GLOBAIS (Modo de Plantio, Condição de Implantação) que corrigem o kg/ha no Guia de Plantio — 5 linhas fixas, só o fator (e o resumo, nas de condição) são editáveis. */
      arquivos_fatores_plantio: {
        Row: {
          chave: string;
          categoria: 'modo' | 'condicao';
          rotulo: string;
          fator: string;
          resumo: string | null;
          atualizado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['arquivos_fatores_plantio']['Row'], 'atualizado_em'> & { atualizado_em?: string };
        Update: Partial<Database['public']['Tables']['arquivos_fatores_plantio']['Insert']>;
        Relationships: [];
      };

      /** Perguntas do Checklist de Diagnóstico de Campo (Guia de Plantio) — cada uma com N opções em arquivos_checklist_opcoes. */
      arquivos_checklist_perguntas: {
        Row: {
          id: string;
          ordem: number;
          pergunta: string;
          atualizado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['arquivos_checklist_perguntas']['Row'], 'id' | 'atualizado_em'> & { id?: string; atualizado_em?: string };
        Update: Partial<Database['public']['Tables']['arquivos_checklist_perguntas']['Insert']>;
        Relationships: [];
      };

      /** Opções marcáveis de cada pergunta do Checklist — cada opção aponta pra uma condição (arquivos_fatores_plantio.chave). */
      arquivos_checklist_opcoes: {
        Row: {
          id: string;
          pergunta_id: string;
          ordem: number;
          texto: string;
          condicao_chave: string;
          atualizado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['arquivos_checklist_opcoes']['Row'], 'id' | 'atualizado_em'> & { id?: string; atualizado_em?: string };
        Update: Partial<Database['public']['Tables']['arquivos_checklist_opcoes']['Insert']>;
        Relationships: [];
      };

      /** Manual de Plantio (texto opcional impresso junto do PDF do Guia de Plantio) — uma linha só, id fixo 'default'. */
      arquivos_manual_plantio: {
        Row: {
          id: string;
          titulo: string;
          corpo: string;
          atualizado_em: string;
        };
        Insert: Omit<Database['public']['Tables']['arquivos_manual_plantio']['Row'], 'atualizado_em'> & { atualizado_em?: string };
        Update: Partial<Database['public']['Tables']['arquivos_manual_plantio']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
