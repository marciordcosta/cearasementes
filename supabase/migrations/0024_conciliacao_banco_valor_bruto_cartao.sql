-- =====================================================================
-- Substituição do OFX pelo Excel/CSV de extrato como fonte do Banco na
-- Conciliação: Banco do Brasil vem em .xlsx (extrato de conta corrente) e
-- Stone em .csv (relatório de recebíveis, 1 linha por venda de cartão).
--
-- O relatório da Stone já traz o valor BRUTO (o que o cliente pagou) e o
-- valor LÍQUIDO (o que realmente cai na conta, taxa da maquininha já
-- descontada) — grava-se sempre o líquido em `valor` (é o que precisa
-- bater com o saldo real do banco), e o bruto fica guardado à parte só
-- pra tornar a busca de sugestão exata (casa direto com o valor da venda
-- no Sistema, sem precisar da faixa de % de taxa parametrizada). Null
-- pra Banco do Brasil (não é cartão) e pra qualquer lançamento antigo.
-- =====================================================================

alter table conciliacao_lancamentos_banco add column if not exists valor_bruto_cartao numeric(14, 2);
