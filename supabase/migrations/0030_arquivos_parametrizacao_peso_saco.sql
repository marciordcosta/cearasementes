-- =====================================================================
-- Peso do Saco (kg) por produto — usado no Guia de Plantio pra converter
-- o peso total necessário em quantidade de sacos a comprar/levar a campo.
-- =====================================================================

alter table arquivos_parametrizacao_produtos add column if not exists peso_saco text;
