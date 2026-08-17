-- =====================================================================
-- "Frete Cobrado" (canais_preco.frete_adicional_tipo) ganha um 3º modo,
-- "transportadora" — a tabela passa a cobrar do cliente o frete AO VIVO
-- da Transportadora vinculada, em vez de um valor fixo/por Kg digitado à
-- mão (ver freteAdicionalReais em calculations.ts).
--
-- catalogo_publico_canais ganha frete_fixo — o Catálogo Online passa a
-- calcular o frete do Orçamento a partir do "Frete cobrado do cliente"
-- do canal (Fixo ou R$/Kg), não mais direto do custo real da
-- Transportadora (esse continua valendo só como PISO mínimo, e direto
-- quando o modo escolhido for "Transportadora" — ver resolverFreteCatalogo
-- em calculations.ts).
-- =====================================================================

alter table canais_preco drop constraint if exists canais_preco_frete_adicional_tipo_check;
alter table canais_preco add constraint canais_preco_frete_adicional_tipo_check check (frete_adicional_tipo in ('fixo', 'kg', 'transportadora'));

alter table catalogo_publico_canais add column if not exists frete_fixo numeric not null default 0;
