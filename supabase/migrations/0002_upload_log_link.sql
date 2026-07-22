-- =====================================================================
-- Vincula cada linha importada ao registro de uploads_log que a gerou,
-- para permitir apagar "o arquivo" (linha do log + todos os dados que ele
-- gerou) de uma vez só, com precisão — sem isso, apagar por nome de
-- arquivo seria ambíguo se o mesmo arquivo fosse enviado mais de uma vez.
-- `on delete cascade`: apagar a linha do log já apaga os dados juntos.
-- =====================================================================

alter table entregas_transportadora
  add column if not exists upload_log_id uuid references uploads_log (id) on delete cascade;

alter table vendas_tabela_preco
  add column if not exists upload_log_id uuid references uploads_log (id) on delete cascade;

create index if not exists idx_entregas_transportadora_upload_log on entregas_transportadora (upload_log_id);
create index if not exists idx_vendas_tabela_preco_upload_log on vendas_tabela_preco (upload_log_id);

-- Observação: uploads feitos ANTES desta migração ficam com upload_log_id
-- nulo — apagar essas linhas antigas do log remove só o histórico, não os
-- dados (não há como saber com segurança quais linhas vieram de qual
-- upload sem esse vínculo). Válido só para uploads a partir de agora.
