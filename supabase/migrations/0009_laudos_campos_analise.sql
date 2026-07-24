-- =====================================================================
-- Gerenciador de Arquivos — campos complementares do laudo (Pureza,
-- Germinação, Validade do teste de germinação), lidos automaticamente do
-- Boletim de Análise dentro do documento. Só leitura (informação de
-- consulta) — não passam pelo modal de edição, diferente de
-- Produto/Lote/Ano Safra.
-- =====================================================================

alter table arquivos_laudos add column if not exists pureza text;
alter table arquivos_laudos add column if not exists germinacao text;
alter table arquivos_laudos add column if not exists validade text;
