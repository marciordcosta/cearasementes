-- Cubagem (C x L x A, em metros, ex.: "0,60x0,40x0,10") — quando preenchida,
-- o cálculo de frete (Precificação e módulo de Fretes) usa o peso cubado
-- (volume m³ x 300) no lugar do peso cadastrado. Em branco = usa o peso normal.
-- A coluna despesa_extra_destino fica sem uso a partir de agora (a despesa
-- extra do produto passou a entrar sempre como Encargos, nunca mais como
-- Frete — o campo continua existindo na tabela só por compatibilidade, sem
-- efeito no app).
alter table produtos add column if not exists cubagem text null;
