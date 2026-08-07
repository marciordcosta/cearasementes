create table if not exists subcategorias (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references categorias (id) on delete cascade,
  nome text not null,
  ordem integer not null default 0
);
alter table subcategorias enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'subcategorias' and policyname = 'acesso_total_subcategorias') then
    create policy "acesso_total_subcategorias" on subcategorias for all using (true) with check (true);
  end if;
end $$;

-- Linha só existe quando a subcategoria SOBRESCREVE a margem da categoria
-- pai naquele canal — ausência de linha = "sem override, usa a da categoria".
create table if not exists subcategoria_margens (
  subcategoria_id uuid not null references subcategorias (id) on delete cascade,
  canal_id uuid not null references canais_preco (id) on delete cascade,
  margem_pct numeric not null,
  primary key (subcategoria_id, canal_id)
);
alter table subcategoria_margens enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'subcategoria_margens' and policyname = 'acesso_total_subcategoria_margens') then
    create policy "acesso_total_subcategoria_margens" on subcategoria_margens for all using (true) with check (true);
  end if;
end $$;

alter table produtos
  add column if not exists subcategoria_id uuid references subcategorias (id) on delete set null;
