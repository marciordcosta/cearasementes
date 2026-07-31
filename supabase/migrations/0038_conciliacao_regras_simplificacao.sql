-- =====================================================================
-- Simplifica as regras de conciliação: de 5 cards pra 3.
-- - PIX, Cartão Débito, Cartão Crédito, Boleto, Cheque -> GENERICA (PIX +
--   Cheque + Rendimento + Outro, mesmo mecanismo pros 4), CARTAO (Débito e
--   Crédito compartilham a mesma regra) e BOLETO (continua sozinho).
-- - Campos removidos por não terem mais uso: dias_uteis_min (Boleto/Cartão
--   perdem o mínimo, viram só um teto de dias úteis), taxa_min_percentual/
--   taxa_max_percentual (estimativa de taxa do Cartão do BB por faixa de %,
--   difícil de acertar e obsoleta hoje — Stone já traz o valor exato),
--   exigir_nf_automatica (a Conciliação Automática nunca mais exige NF; a
--   pré-conciliação já resolve esse caso).
-- Reseta as linhas em vez de tentar migrar valor por valor — os campos e a
-- forma de calcular mudaram o suficiente pra um valor antigo não ter
-- correspondência 1:1 direta no novo esquema.
-- =====================================================================

delete from conciliacao_regras;

alter table conciliacao_regras drop constraint if exists conciliacao_regras_forma_pagamento_check;

alter table conciliacao_regras
  drop column if exists dias_uteis_min,
  drop column if exists taxa_min_percentual,
  drop column if exists taxa_max_percentual,
  drop column if exists exigir_nf_automatica;

alter table conciliacao_regras add constraint conciliacao_regras_forma_pagamento_check check (forma_pagamento in ('GENERICA', 'CARTAO', 'BOLETO'));

insert into conciliacao_regras (forma_pagamento, tolerancia_valor, dias_tolerancia, dias_uteis_max, nome_min_contido, nome_min_sobrenome)
values
  ('GENERICA', 0.01, 30, null, 8, 5),
  ('CARTAO', 0.01, 0, 1, null, null),
  ('BOLETO', 0.01, 0, 3, null, null)
on conflict (forma_pagamento) do nothing;
