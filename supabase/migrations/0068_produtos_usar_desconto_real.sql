-- =====================================================================
-- Desconto médio real do BI (última Safra, ver historicoBi.ts) vira
-- OPT-IN por produto, não mais fonte primária automática. Padrão false
-- = continua usando o Canal.desconto cadastrado, igual antes de toda
-- a mudança do BI; marcando o produto, passa a usar o desconto real
-- quando houver dado pra ele.
-- =====================================================================

alter table produtos add column if not exists usar_desconto_real boolean not null default false;
