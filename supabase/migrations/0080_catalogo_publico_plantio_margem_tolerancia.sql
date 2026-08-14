-- =====================================================================
-- Margem de tolerância (%) do grupo — mesma regra de arredondamento de
-- embalagens já usada no Guia de Plantio interno (ver arredondarSacos em
-- calculoSemeadura.ts), agora também na calculadora pública do Catálogo
-- Online (antes usava Math.ceil puro, sem tolerância nenhuma).
-- =====================================================================

alter table catalogo_publico_itens add column if not exists plantio_margem_tolerancia numeric;
