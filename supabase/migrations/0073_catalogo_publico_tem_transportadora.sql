-- =====================================================================
-- Marca se o canal publicado tem Transportadora vinculada (frete
-- calculável ao vivo) ou é "Manual" (Frete Kg/% digitado à mão, sem
-- referência real de frete pra cotar pro cliente). No Orçamento
-- (CatalogoPublicoPage.tsx), canal Manual não calcula frete — mostra
-- "Cotação de frete" (abre WhatsApp) em vez de um valor.
-- =====================================================================

alter table catalogo_publico_canais add column if not exists tem_transportadora boolean not null default false;
