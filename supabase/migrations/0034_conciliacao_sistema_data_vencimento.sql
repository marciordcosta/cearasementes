-- =====================================================================
-- Data de Vencimento do lançamento do Sistema (relatório MAX-Manager) —
-- distinta da Data (recebimento). Só usada de verdade na busca/conciliação
-- de CHEQUE: o banco compensa o cheque no vencimento, não no recebimento.
-- Null nos demais tipos e em lançamentos importados antes desse campo
-- existir (a busca cai pra Data nesse caso).
-- =====================================================================

alter table conciliacao_lancamentos_sistema add column if not exists data_vencimento date;
