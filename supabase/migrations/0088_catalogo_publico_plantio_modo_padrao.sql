-- =====================================================================
-- Modo de Plantio (Lanço/Covas/Linha) cadastrado em Parametrização pra
-- cada Cultivar+Processo, agora publicado junto do snapshot do Catálogo
-- Online — a Calculadora de plantio pública usa isso como modo INICIAL
-- de cada produto (em vez do critério antigo, "Lanço se o laudo tiver
-- dado de Lanço, senão Covas"). Ver resolverModoPlantioPadrao em
-- parametrizacaoProdutos.ts / PlantioPublicoResultado.modoPadrao em
-- calculoSemeadura.ts. Null = sem cadastro (ou publicado antes dessa
-- coluna existir) — cai no critério antigo na leitura.
-- =====================================================================

alter table catalogo_publico_itens add column if not exists plantio_modo_padrao text;
