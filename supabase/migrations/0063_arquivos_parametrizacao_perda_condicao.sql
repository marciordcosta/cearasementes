-- =====================================================================
-- Perda (%) por Condição de Implantação (Média/Baixa), agora também
-- cadastrável POR PRODUTO — a sensibilidade a condição ruim varia muito
-- entre cultivares (Milho aguenta bem menos variação que um capim já
-- estabelecido). Quando não cadastrado, cai no fator GLOBAL de sempre
-- (arquivos_fatores_plantio) — ver resolverFatorCondicao em
-- parametrizacaoProdutos.ts. "Ideal" não precisa de override: é sempre
-- 0% de perda por definição, não tem campo aqui nem lá.
-- =====================================================================

alter table arquivos_parametrizacao_produtos
  add column if not exists perda_media text,
  add column if not exists perda_baixa text;
