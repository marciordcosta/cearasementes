-- =====================================================================
-- Suporte a reenviar o mesmo extrato/relatório sem duplicar nem perder
-- conciliação já feita (upsert em vez de apagar tudo e reinserir):
-- - Banco (OFX): FITID é o identificador único que o próprio banco atribui
--   a cada transação — usado como chave de upsert.
-- - Sistema (HTML): a coluna `documento` (ex.: "VE16791-1/4") sozinha NÃO é
--   única de verdade — despesas recorrentes reais repetem o mesmo nº de
--   documento em datas/valores diferentes (confirmado nos dados já
--   importados: doc. "68133" aparece em 7 lançamentos distintos do mesmo
--   fornecedor). A chave de upsert precisa ser (documento, data, valor).
-- Índice único "normal" (não parcial): em SQL, NULL nunca é igual a NULL,
-- então várias linhas com fitid/documento nulo continuam coexistindo sem
-- violar a unicidade — só os valores preenchidos precisam ser únicos. Um
-- índice parcial (`where ... is not null`) também resolveria isso, mas o
-- upsert do PostgREST (`on_conflict=coluna`) só combina com índice único
-- "cheio"; com parcial ele erra "no unique constraint matching".
-- =====================================================================

alter table conciliacao_lancamentos_banco
  add column if not exists fitid text;

create unique index if not exists idx_conciliacao_banco_fitid_unico
  on conciliacao_lancamentos_banco (fitid);

create unique index if not exists idx_conciliacao_sistema_doc_data_valor_unico
  on conciliacao_lancamentos_sistema (documento, data, valor);
