-- =====================================================================
-- Link "bonito" pro Catálogo Online — em vez de /catalogo/<uuid-do-canal>,
-- /catalogo/<nome-da-tabela-em-slug> (ex.: "revenda-ce"). Slug é gerado a
-- partir do Canal.nome a cada "Publicar" (ver publicarCatalogoOnline em
-- pricing/api.ts) — 1 linha por canal (upsert por canal_id, atualiza o
-- slug se o nome do canal mudou desde a última publicação).
-- =====================================================================

create table if not exists catalogo_publico_canais (
  canal_id uuid primary key references canais_preco(id) on delete cascade,
  slug text not null,
  nome text not null,
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_catalogo_publico_canais_slug on catalogo_publico_canais (slug);

alter table catalogo_publico_canais enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'catalogo_publico_canais' and policyname = 'leitura_publica_catalogo_publico_canais') then
    create policy "leitura_publica_catalogo_publico_canais" on catalogo_publico_canais for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'catalogo_publico_canais' and policyname = 'escrita_autenticada_catalogo_publico_canais') then
    create policy "escrita_autenticada_catalogo_publico_canais" on catalogo_publico_canais for all
      using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;
