-- =====================================================================
-- Tolerância de dias (PIX): quantos dias de diferença o sistema ainda
-- considera "mesma data" na busca de sugestões de PIX. Reaproveitada
-- também como janela da rede de segurança "Mesmo valor, recebimento
-- diferente" (antes fixa em 30 dias corridos direto no código).
-- =====================================================================

alter table conciliacao_regras add column if not exists dias_tolerancia integer not null default 0;

update conciliacao_regras set dias_tolerancia = 30 where forma_pagamento = 'PIX' and dias_tolerancia = 0;
