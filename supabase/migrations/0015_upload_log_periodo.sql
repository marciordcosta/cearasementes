-- =====================================================================
-- Suporte a mesclar uploads do mesmo relatório/tabela numa linha só na
-- tela de Uploads, com faixa de datas fechada (só meses inteiros).
-- `tabela_preco`: nome da Tabela de Preço detectado no arquivo — só
-- preenchido pro relatório 396 (cada arquivo pertence a uma tabela só).
-- `data_min`/`data_max`: menor/maior data BRUTA (sem filtro de período
-- fechado) encontrada nas linhas do arquivo — alimenta o recálculo da
-- janela fechada a cada novo upload do mesmo grupo. Null pro 333, que
-- não tem coluna de data.
-- =====================================================================

alter table uploads_log
  add column if not exists tabela_preco text,
  add column if not exists data_min date,
  add column if not exists data_max date;
