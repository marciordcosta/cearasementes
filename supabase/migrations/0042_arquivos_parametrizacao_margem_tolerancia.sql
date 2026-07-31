-- Margem de tolerância (%) por grupo — usada pra decidir se o resto da conta
-- de sacos arredonda pra baixo ou pra cima: até essa % de saco faltando
-- ainda arredonda pra baixo (compra menos), acima arredonda pra cima. Texto
-- livre (paraNumero no app), igual aos demais campos numéricos desta
-- tabela; null cai no padrão de 25% (ver resolverMargemTolerancia).

alter table arquivos_parametrizacao_produtos
  add column if not exists margem_tolerancia text;
