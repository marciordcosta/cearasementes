-- Observação livre do Teste de Germinação de Campo — mesmo modelo "1 teste
-- por laudo, editar substitui o anterior" das demais colunas teste_*.
alter table arquivos_laudos
  add column if not exists teste_observacao text;
