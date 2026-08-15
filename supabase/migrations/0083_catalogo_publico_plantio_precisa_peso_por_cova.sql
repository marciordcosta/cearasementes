-- =====================================================================
-- Sementes Tradicionais (soltas, pequenas) não dá pra contar uma a uma
-- pra colocar na cova, só pesar — a calculadora pública precisa saber
-- disso pra mostrar "Peso/cova (g)" em vez de "Sementes/cova" (contagem)
-- no modo Covas. Ver precisaPesoPorCova em calculoSemeadura.ts.
-- =====================================================================

alter table catalogo_publico_itens add column if not exists plantio_precisa_peso_por_cova boolean not null default false;
