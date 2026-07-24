-- Peso mínimo (kg) a partir do qual o comparativo com Frota Própria dispara
-- sozinho na Cotação de Frete de Cidade única — 0 (padrão) desliga o gatilho
-- automático (nenhum peso "mínimo" configurado ainda).
alter table rota_parametros add column if not exists peso_minimo_comparativo numeric(10, 2) not null default 0;
