-- =====================================================================
-- Rastreio de lançamentos manuais do Sistema que ainda precisam ser
-- replicados no ERP do usuário. `lancado_erp` só vira true depois que o
-- usuário confirma (na "bolha" de registros manuais) que a NF foi de fato
-- emitida — até lá o registro continua aparecendo na lista de pendências.
-- =====================================================================

alter table conciliacao_lancamentos_sistema
  add column if not exists lancado_erp boolean not null default false;
