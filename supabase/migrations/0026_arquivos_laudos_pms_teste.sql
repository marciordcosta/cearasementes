-- =====================================================================
-- Gerenciador de Arquivos: PMS (Peso de Mil Sementes) e Teste de
-- Germinação de Campo — campos editados manualmente (não vêm do laudo em
-- PDF), usados futuramente pro cálculo de semeadura.
-- =====================================================================

alter table arquivos_laudos add column if not exists pms text;

-- "sementes": conta plantadas/germinadas. "peso": pesa uma amostra
-- plantada (gramas) e conta germinadas — a fórmula de % pro modo peso
-- ainda não foi definida (provavelmente vai usar o PMS), então
-- teste_peso_plantado fica gravado mas sem resultado calculado por ora.
alter table arquivos_laudos add column if not exists teste_forma text check (teste_forma in ('sementes', 'peso'));
alter table arquivos_laudos add column if not exists teste_data date;
alter table arquivos_laudos add column if not exists teste_plantadas numeric(10, 2);
alter table arquivos_laudos add column if not exists teste_germinadas numeric(10, 2);
alter table arquivos_laudos add column if not exists teste_peso_plantado numeric(10, 2);
