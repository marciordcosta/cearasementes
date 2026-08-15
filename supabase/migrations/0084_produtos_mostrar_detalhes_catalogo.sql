-- =====================================================================
-- "Mostrar detalhes no catálogo" por PRODUTO — sobrepõe a configuração da
-- Tabela (canais_preco.mostrar_detalhes_plantio) só pra baixo: produto com
-- essa coluna false nunca mostra VC%/Validade/PMS no card, mesmo com a
-- Tabela mostrando pros demais produtos. Padrão true = não esconde nada
-- (segue a Tabela normalmente).
-- =====================================================================

alter table produtos add column if not exists mostrar_detalhes_catalogo boolean not null default true;
alter table catalogo_publico_itens add column if not exists mostrar_detalhes_catalogo boolean not null default true;
