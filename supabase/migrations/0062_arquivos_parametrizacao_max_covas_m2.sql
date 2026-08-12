-- =====================================================================
-- Covas/m² MÁXIMO por produto — em modo Covas, a regra de Densidade (que
-- funciona bem pra "A Lanço") pode exigir mais covas por m² do que a
-- cultivar aguenta fisicamente (competição entre covas vizinhas). Esse
-- campo passa a ser o driver do espaçamento padrão em Covas — junto com
-- Máx. de plântulas/cova (migração 0061) — em vez da Densidade: Espaçamento
-- = direto desse valor; a densidade real (Covas/m² × Máx. plântulas/cova)
-- vira uma CONSEQUÊNCIA, não precisa mais bater a Densidade cadastrada.
-- Ver calcularEspacamentoPadrao/calcularResultado em GuiaPlantioModal.tsx.
-- =====================================================================

alter table arquivos_parametrizacao_produtos
  add column if not exists max_covas_m2 text;
