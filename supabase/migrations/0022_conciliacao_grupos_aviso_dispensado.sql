-- "x" de dispensar a notificação de divergência no modal de pendências do
-- Banco (OFX): o aviso (aviso_diferenca) continua gravado pra sempre — o "!"
-- no lançamento e o modal de detalhe dele nunca somem — só a linha na lista
-- de pendências para de aparecer depois que o usuário dispensa.
alter table conciliacao_grupos add column if not exists aviso_dispensado boolean not null default false;
