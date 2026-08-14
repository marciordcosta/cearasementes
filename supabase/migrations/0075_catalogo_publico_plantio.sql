-- =====================================================================
-- Calculadora de Plantio no Catálogo Online — snapshot público (kg/ha em
-- A Lanço já pronto; base pra recalcular Covas ao vivo conforme o Corredor
-- que o cliente digitar, ver resolverPlantioParaProduto em
-- calculoSemeadura.ts e ModalCalculadoraPlantio em CatalogoPublicoPage.tsx).
-- Nullable: produto sem laudo correspondente fica sem dado de plantio, a
-- calculadora simplesmente não o oferece na busca.
-- =====================================================================

alter table catalogo_publico_itens add column if not exists plantio_kg_ha_lanco numeric;
alter table catalogo_publico_itens add column if not exists plantio_sementes_cova_base numeric;
alter table catalogo_publico_itens add column if not exists plantio_pms numeric;
