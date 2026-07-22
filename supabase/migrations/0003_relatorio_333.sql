-- =====================================================================
-- Relatório 333 — Produtos Vendidos (CMV): usado só para sincronizar
-- Código Interno + Custo Unitário no cadastro de produtos da
-- Precificação (sem duplicar produto já cadastrado). Não guarda linha a
-- linha em tabela própria como 124/396 — o efeito é direto em `produtos`.
-- =====================================================================

alter table uploads_log drop constraint if exists uploads_log_tipo_relatorio_check;
alter table uploads_log add constraint uploads_log_tipo_relatorio_check check (tipo_relatorio in ('124', '396', '333'));

alter table upload_mapeamentos drop constraint if exists upload_mapeamentos_tipo_relatorio_check;
alter table upload_mapeamentos add constraint upload_mapeamentos_tipo_relatorio_check check (tipo_relatorio in ('124', '396', '333'));
