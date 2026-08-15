-- Parametrização de Produtos passa a ser identificada por Cultivar + Processo (campos próprios do
-- laudo, ver 0085_cultivar_laudo_e_produto.sql) em vez do "grupo" extraído por heurística de texto
-- (1ª + 3ª palavra do nome_produto, ver grupoDoNome). Substitui de vez, sem fallback: cadastros
-- antigos (cultivar/processo em branco) continuam existindo mas não casam com laudo nenhum até
-- serem preenchidos de novo pela grade — nulos não colidem entre si na constraint de unicidade
-- abaixo (regra padrão do Postgres: NULL nunca é "igual" a outro NULL).
alter table arquivos_parametrizacao_produtos add column if not exists cultivar text;
alter table arquivos_parametrizacao_produtos add column if not exists processo text;

alter table arquivos_parametrizacao_produtos drop constraint if exists arquivos_parametrizacao_produtos_nome_produto_key;
alter table arquivos_parametrizacao_produtos add constraint arquivos_parametrizacao_produtos_cultivar_processo_key unique (cultivar, processo);
