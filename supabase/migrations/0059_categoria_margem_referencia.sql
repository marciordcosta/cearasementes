-- Referência de margem passa a ser configurável por Categoria, não mais só por Tabela inteira
-- — cada Categoria escolhe, por Tabela, se/qual outra Tabela referenciar (ex.: Capim referencia
-- Revenda PI na Revenda CE, Milho referencia Padrão na mesma Revenda CE). margem_por_referencia
-- em canais_preco vira só o "liga/desliga" da Tabela inteira; o alvo (qual Tabela) e o ajuste (%)
-- agora vivem em categoria_margens, junto da margem/tolerância que já eram por categoria+canal.
alter table canais_preco
  add column if not exists margem_por_referencia boolean not null default false;

alter table categoria_margens
  add column if not exists referencia_canal_id uuid references canais_preco (id) on delete set null,
  add column if not exists referencia_ajuste_pct numeric not null default 0;

-- Backfill: Tabela que já estava em "por referência" (era por Tabela inteira) vira ligada pra
-- TODAS as categorias, preservando o comportamento atual até o usuário customizar por categoria.
update canais_preco
  set margem_por_referencia = true
  where margem_referencia_canal_id is not null;

update categoria_margens cm
  set referencia_canal_id = cp.margem_referencia_canal_id,
      referencia_ajuste_pct = cp.margem_referencia_ajuste_pct
  from canais_preco cp
  where cm.canal_id = cp.id
    and cp.margem_referencia_canal_id is not null;

alter table canais_preco
  drop column if exists margem_referencia_canal_id,
  drop column if exists margem_referencia_ajuste_pct;
