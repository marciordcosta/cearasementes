-- =====================================================================
-- Rota de Frota Própria — detalha o cálculo de "km rodado por dia" em
-- velocidade média + janela de jornada diária (início/término), em vez de
-- um número fixo digitado direto. media_km_dia continua na tabela (agora
-- só um valor calculado, gravado a cada save, pra quem quiser consultar
-- direto no banco) mas deixa de ser o campo que o usuário edita.
-- =====================================================================

alter table rota_parametros add column if not exists velocidade_media numeric(6, 1) not null default 60;
alter table rota_parametros add column if not exists jornada_inicio_hora numeric(4, 2) not null default 6;
alter table rota_parametros add column if not exists jornada_fim_hora numeric(4, 2) not null default 18;
