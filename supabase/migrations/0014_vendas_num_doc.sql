-- =====================================================================
-- Evita duplicar vendas quando dois uploads do relatório 396 têm datas
-- sobrepostas (ex.: um arquivo Jan-Dez/2025 e outro Jul/2025-Jul/2026) — o
-- N.Doc. do relatório é único por venda, então usamos (tabela_preco,
-- num_doc) como chave de "upsert": reenviar o mesmo documento ATUALIZA a
-- linha existente em vez de duplicar. Uploads que não mapeiam N.Doc. têm
-- num_doc = null, e null nunca conflita com null (nem entre si) — pra esses
-- continua entrando tudo como antes, sem proteção contra duplicata.
-- =====================================================================

alter table vendas_tabela_preco add column if not exists num_doc text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vendas_tabela_preco_tabela_num_doc_key') then
    alter table vendas_tabela_preco add constraint vendas_tabela_preco_tabela_num_doc_key unique (tabela_preco, num_doc);
  end if;
end $$;
