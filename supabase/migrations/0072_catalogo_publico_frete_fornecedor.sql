-- =====================================================================
-- Catálogo Online — dados extras pro Orçamento (carrinho + frete
-- calculado) e pra exibição (fornecedor no card). Mesma filosofia das
-- migrations 0069/0070: só o já resolvido (nunca Custo/Margem) fica
-- público — Frete Kg/%/Mínimo aqui são taxa de transporte, não segredo
-- de margem, e são exatamente o que o cliente precisa saber pra
-- calcular o frete do próprio orçamento.
-- =====================================================================

alter table catalogo_publico_itens add column if not exists fornecedor_nome text;
alter table catalogo_publico_itens add column if not exists peso_usado numeric not null default 0;

alter table catalogo_publico_canais add column if not exists frete_kg_efetivo numeric not null default 0;
alter table catalogo_publico_canais add column if not exists frete_pct_efetivo numeric not null default 0;
alter table catalogo_publico_canais add column if not exists frete_minimo numeric not null default 0;
alter table catalogo_publico_canais add column if not exists whatsapp text;
