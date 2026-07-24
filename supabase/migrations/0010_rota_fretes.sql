-- =====================================================================
-- Rota de Frota Própria — dentro de Gestão de Fretes, um modo separado das
-- transportadoras terceirizadas: custo por quilometragem real de rodovia
-- (via API externa de rotas), não por peso/R$-kg de transportadora.
-- =====================================================================

-- Parametrização única (singleton — sempre id=1) da rota de frota própria.
create table if not exists rota_parametros (
  id integer primary key default 1,
  nome_transporte text not null default '',
  cidade_inicio text not null default '',
  valor_km numeric(10, 4) not null default 0,
  media_km_dia numeric(10, 2) not null default 0,
  despesa_extra_dia numeric(10, 2) not null default 0,
  horario_inicio time not null default '06:00',
  atualizado_em timestamptz not null default now(),
  constraint rota_parametros_singleton check (id = 1)
);
insert into rota_parametros (id) values (1) on conflict (id) do nothing;

-- Cache de geocodificação (cidade -> lat/lon) — evita regeocodificar a mesma
-- cidade toda vez e poupa cota diária da API gratuita de rotas.
create table if not exists rota_cidades_cache (
  id uuid primary key default gen_random_uuid(),
  cidade_normalizada text not null unique,
  cidade_exibicao text not null,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  criado_em timestamptz not null default now()
);

alter table rota_parametros enable row level security;
alter table rota_cidades_cache enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'rota_parametros' and policyname = 'acesso_total_rota_parametros') then
    create policy "acesso_total_rota_parametros" on rota_parametros for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'rota_cidades_cache' and policyname = 'acesso_total_rota_cidades_cache') then
    create policy "acesso_total_rota_cidades_cache" on rota_cidades_cache for all using (true) with check (true);
  end if;
end $$;
