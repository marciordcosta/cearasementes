-- =====================================================================
-- Fornecedor do laudo — lido automaticamente do documento quando traz
-- ("Fornecedor: ..."), editável em "Editar Laudo" quando não. Mesmo padrão
-- de Categoria/Processo (interpretarConteudoLaudo.ts).
-- =====================================================================

alter table arquivos_laudos add column if not exists fornecedor text;
