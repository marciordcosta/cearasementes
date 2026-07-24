-- =====================================================================
-- A chave (documento, data, valor) criada na 0016 não é suficiente: mais
-- da metade das linhas do relatório do Sistema não tem "documento" nenhum
-- (ex.: depósito em dinheiro no banco, sem nº de documento) — confirmado
-- nos dados reais: 506 de ~795 linhas de um teste com "documento" nulo.
-- Sem chave, cada reenvio duplicava essas linhas de novo.
--
-- `chave_dedup` é calculada na aplicação (não em SQL) por linha:
--   documento, se tiver; senão cliente|vendedor|forma_pagamento_raw.
-- Continua não sendo 100% à prova de falha (duas linhas idênticas em
-- todos esses campos, no mesmo dia, mesmo valor, ainda colidiriam), mas
-- já usa todo campo disponível pra reduzir a chance disso ao mínimo.
-- =====================================================================

alter table conciliacao_lancamentos_sistema
  add column if not exists chave_dedup text;

drop index if exists idx_conciliacao_sistema_doc_data_valor_unico;

create unique index if not exists idx_conciliacao_sistema_chave_dedup_unica
  on conciliacao_lancamentos_sistema (chave_dedup, data, valor);
