-- Ajuste (%) aplicado sobre a Margem R$ da tabela de referência antes de virar
-- a meta de preço — 0 (padrão) = usa a margem da referência sem alteração.
alter table canais_preco
  add column if not exists margem_referencia_ajuste_pct numeric not null default 0;
