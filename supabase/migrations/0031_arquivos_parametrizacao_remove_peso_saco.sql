-- =====================================================================
-- Reverte 0030: Peso do Saco não fica mais na Parametrização de Produtos
-- — é redundante com o peso já cadastrado por produto na Tabela de Preço
-- (módulo Precificação), que o Guia de Plantio passou a usar direto.
-- =====================================================================

alter table arquivos_parametrizacao_produtos drop column if exists peso_saco;
