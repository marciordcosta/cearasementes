-- =====================================================================
-- Observação (informações adicionais) no lançamento do Sistema — mesma
-- regra que já existe pro Banco: anotação livre, independente de
-- conciliado/desativado. Aparece na notificação de pendências do Sistema
-- (não na do Banco).
-- =====================================================================

alter table conciliacao_lancamentos_sistema add column if not exists observacao text;
