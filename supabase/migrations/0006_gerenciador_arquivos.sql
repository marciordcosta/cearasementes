-- =====================================================================
-- Módulo Gerenciador de Arquivos (laudos) — metadados na tabela +
-- arquivo de verdade no Supabase Storage (bucket "laudos", público, pra
-- o link poder ser aberto direto no navegador/WhatsApp sem sessão).
-- =====================================================================

create table if not exists arquivos_laudos (
  id uuid primary key default gen_random_uuid(),
  nome_produto text not null,
  lote text,
  ano_safra text,
  arquivo_nome text not null,
  arquivo_url text not null,
  arquivo_tipo text,
  tamanho_bytes bigint,
  enviado_em timestamptz not null default now()
);

create index if not exists idx_arquivos_laudos_produto on arquivos_laudos (nome_produto);
create index if not exists idx_arquivos_laudos_lote on arquivos_laudos (lote);
create index if not exists idx_arquivos_laudos_ano on arquivos_laudos (ano_safra);

alter table arquivos_laudos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'arquivos_laudos' and policyname = 'acesso_total_arquivos_laudos') then
    create policy "acesso_total_arquivos_laudos" on arquivos_laudos for all using (true) with check (true);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Bucket de Storage — público (leitura livre via URL), escrita liberada
-- pela mesma anon key (sem autenticação de usuário ainda, igual ao resto
-- do projeto). Rode este bloco no SQL Editor; se seu projeto Supabase
-- bloquear DDL de storage por SQL, crie o bucket "laudos" manualmente em
-- Storage → New bucket (marcando "Public") e pule para as policies.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('laudos', 'laudos', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname = 'acesso_total_storage_laudos_select') then
    create policy "acesso_total_storage_laudos_select" on storage.objects for select using (bucket_id = 'laudos');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname = 'acesso_total_storage_laudos_insert') then
    create policy "acesso_total_storage_laudos_insert" on storage.objects for insert with check (bucket_id = 'laudos');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname = 'acesso_total_storage_laudos_update') then
    create policy "acesso_total_storage_laudos_update" on storage.objects for update using (bucket_id = 'laudos');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname = 'acesso_total_storage_laudos_delete') then
    create policy "acesso_total_storage_laudos_delete" on storage.objects for delete using (bucket_id = 'laudos');
  end if;
end $$;
