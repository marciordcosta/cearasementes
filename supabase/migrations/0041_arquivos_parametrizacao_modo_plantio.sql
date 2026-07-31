-- Modo de plantio padrão por grupo (Cova ou Lanço) — só uma preferência
-- cadastrada, usada pra pré-selecionar o modo ao adicionar o produto no
-- Guia de Plantio (não entra em nenhum cálculo, é só o ponto de partida do
-- item — o operador ainda pode trocar à vontade depois de adicionado).

alter table arquivos_parametrizacao_produtos
  add column if not exists modo_plantio text check (modo_plantio in ('cova', 'lanco'));
