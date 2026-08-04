-- Teste de Campo em 2 etapas: "teste_data" passa a significar DATA DO PLANTIO
-- (etapa 1); esta coluna nova guarda a DATA DO RESULTADO (etapa 2, quando as
-- germinadas são contadas) — mesmo modelo "1 teste por laudo" das demais.
alter table arquivos_laudos
  add column if not exists teste_data_resultado date;
