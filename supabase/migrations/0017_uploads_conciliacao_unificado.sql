-- =====================================================================
-- Une a Conciliação Bancária (OFX/Sistema) na mesma lista "Arquivos
-- processados recentemente" de Uploads (124/396/333) — mesma lógica de
-- 1 linha por grupo, período do cabeçalho e aviso de atraso. O nome do
-- arquivo deixa de aparecer na tela de Conciliação.
--
-- `uploads_log.tipo_relatorio` passa a aceitar 'ofx'/'sistema' também.
-- `tabela_preco` (já existente) é reaproveitado como o nome do sub-grupo
-- pra esses dois tipos: banco (ex. "Banco do Brasil") pro ofx, tipo de
-- lançamento (ex. "Entrada") pro sistema — mesma ideia da Tabela de Preço
-- no 396, só que com outro significado.
--
-- `conciliacao_arquivos.sub_grupo` guarda o tipo de lançamento (Entrada/
-- Saída) de cada arquivo do Sistema — usado só pra apagar certinho todo
-- mundo daquele sub-grupo quando o usuário apaga a linha mesclada em
-- Uploads (pro ofx já existe `banco_nome`, não precisa de coluna nova).
-- =====================================================================

alter table uploads_log drop constraint if exists uploads_log_tipo_relatorio_check;
alter table uploads_log add constraint uploads_log_tipo_relatorio_check check (tipo_relatorio in ('124', '396', '333', 'ofx', 'sistema'));

alter table conciliacao_arquivos add column if not exists sub_grupo text;
