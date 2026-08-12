-- =====================================================================
-- Máximo de plântulas estabelecidas (pós-perdas) por cova, por produto —
-- gêneros diferentes (Panicum/Brachiaria perfilham e ocupam espaço; Milho/
-- Sorgo são plantas unitárias) têm limites bem diferentes de quanto cabe
-- numa mesma cova sem competir demais entre si. Usado no Guia de Plantio
-- pra calcular o espaçamento (Cova × Corredor) padrão em modo Covas — ver
-- calcularEspacamentoPadrao em GuiaPlantioModal.tsx — em vez do 50×50 fixo.
-- =====================================================================

alter table arquivos_parametrizacao_produtos
  add column if not exists max_plantulas_cova text;
