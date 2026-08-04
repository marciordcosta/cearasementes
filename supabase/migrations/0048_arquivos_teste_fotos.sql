-- Fotos do Teste de Germinação de Campo — array de URLs públicas do bucket
-- "laudos" (mesmo bucket já usado pro PDF do laudo). Segue o mesmo modelo
-- "1 teste por laudo, editar substitui o anterior" já usado pelas colunas
-- teste_* existentes — sem histórico, sem tabela nova.
alter table arquivos_laudos
  add column if not exists teste_fotos text[];
