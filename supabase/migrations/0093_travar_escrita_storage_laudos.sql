-- =====================================================================
-- Trava escrita (insert/update/delete) no bucket de Storage "laudos" pra
-- "só autenticado" — a leitura (select) continua pública de propósito
-- (mesma exceção deliberada de catalogo_publico_itens/canais em
-- 0082_travar_rls_tabelas_internas.sql): o link do laudo precisa abrir
-- direto no navegador/WhatsApp sem sessão nenhuma, ver comentário
-- original em 0006_gerenciador_arquivos.sql.
--
-- A trava de 0082 varre só pg_tables do schema `public` — storage.objects
-- vive no schema `storage`, então nunca foi alcançado por ela. Até esta
-- migration, QUALQUER pessoa com a anon key (pública, embutida no bundle
-- do navegador) conseguia subir, sobrescrever ou apagar qualquer arquivo
-- do bucket "laudos" sem login nenhum — não só ler.
-- =====================================================================

drop policy if exists "acesso_total_storage_laudos_insert" on storage.objects;
drop policy if exists "acesso_total_storage_laudos_update" on storage.objects;
drop policy if exists "acesso_total_storage_laudos_delete" on storage.objects;

create policy "autenticado_storage_laudos_insert" on storage.objects
  for insert with check (bucket_id = 'laudos' and auth.role() = 'authenticated');

create policy "autenticado_storage_laudos_update" on storage.objects
  for update using (bucket_id = 'laudos' and auth.role() = 'authenticated');

create policy "autenticado_storage_laudos_delete" on storage.objects
  for delete using (bucket_id = 'laudos' and auth.role() = 'authenticated');
