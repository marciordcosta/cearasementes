-- =====================================================================
-- Tolerância de busca (dias) do Cheque: agora usada de verdade na busca de
-- sugestões (janela em torno do VENCIMENTO, não do recebimento) — antes o
-- Cheque ignorava esse campo por completo. Sobe o padrão de 0 pra 30 dias,
-- mesma ideia do que já foi feito pro PIX na 0025.
-- =====================================================================

update conciliacao_regras set dias_tolerancia = 30 where forma_pagamento = 'CHEQUE' and dias_tolerancia = 0;
