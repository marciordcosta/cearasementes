-- =====================================================================
-- Renomeia "Distância mínima (cm)" para "Máx. plântulas/metro linear" —
-- mesmo princípio (limite físico de adensamento na linha), unidade mais
-- intuitiva de cadastrar (100 ÷ plântulas/m = distância mínima em cm,
-- convertido direto no código, ver GuiaPlantioModal.tsx). Junto com
-- Densidade (plântulas/m²) e Máx. plântulas/cova, fecha as 3 dimensões
-- de densidade (área, linha, cova) — cada modo de plantio usa a coluna
-- correspondente.
-- =====================================================================

alter table arquivos_parametrizacao_produtos
  rename column distancia_minima to max_plantulas_metro_linear;
