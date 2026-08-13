-- =====================================================================
-- Distância mínima entre plântulas (cm) — só relevante pra Milho/Sorgo
-- (regra própria de Sementes/cova editável, ver GuiaPlantioModal.tsx). É
-- a distância mínima entre PLÂNTULAS estabelecidas na mesma linha (não
-- por semente jogada — nem toda semente vira plântula), usada pra
-- calcular um teto de desconto real (em vez do 40% fixo genérico) quando
-- o espaçamento efetivo aperta demais. Sem cadastro, cai no teto de 40%
-- de sempre.
-- =====================================================================

alter table arquivos_parametrizacao_produtos
  add column if not exists distancia_minima text;
