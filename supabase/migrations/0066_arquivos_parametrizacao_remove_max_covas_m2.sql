-- =====================================================================
-- Remove Máx. Cov/m² (por produto) — só os capins usavam essa condição
-- (Milho/Sorgo têm regra própria, nem olhavam pra esse campo), e todos
-- os capins cadastrados hoje já usam o mesmo valor (4). Padroniza pra
-- uma constante fixa no código (ver covasM2Alvo em GuiaPlantioModal.tsx)
-- em vez de manter um campo por produto que nunca varia na prática.
-- =====================================================================

alter table arquivos_parametrizacao_produtos
  drop column if exists max_covas_m2;
