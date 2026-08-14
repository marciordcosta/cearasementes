-- =====================================================================
-- VC% e Validade do laudo usado no cálculo de plantio — só pra EXIBIÇÃO
-- discreta no card do Catálogo Online (Fornecedor > VC% > Validade), além
-- do já usado pra calcular kg/ha (ver resolverPlantioParaProduto em
-- calculoSemeadura.ts). Nullable, mesmo critério dos outros campos de
-- plantio: produto sem laudo correspondente fica sem essa informação.
-- =====================================================================

alter table catalogo_publico_itens add column if not exists plantio_vc numeric;
alter table catalogo_publico_itens add column if not exists plantio_validade text;
