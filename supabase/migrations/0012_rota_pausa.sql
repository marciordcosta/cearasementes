-- Rota de Frota Própria — duração fixa de pausa (almoço/descanso) descontada
-- do total de horas dirigíveis por dia, tanto no dia cheio quanto no 1º dia parcial.
alter table rota_parametros add column if not exists pausa_horas numeric(4, 2) not null default 1;
