-- Junta pagamento_avista_habilitado + pagamento_boleto_habilitado num único pagamento_habilitado:
-- ligado, o Catálogo Online sempre oferece as duas formas juntas (Pix com desconto + Boleto
-- parcelado); os campos de desconto/valor mínimo/parcelas máx continuam os mesmos de antes.
alter table canais_preco add column if not exists pagamento_habilitado boolean not null default false;
update canais_preco set pagamento_habilitado = (pagamento_avista_habilitado or pagamento_boleto_habilitado);
alter table canais_preco drop column if exists pagamento_avista_habilitado;
alter table canais_preco drop column if exists pagamento_boleto_habilitado;

alter table catalogo_publico_canais add column if not exists pagamento_habilitado boolean not null default false;
update catalogo_publico_canais set pagamento_habilitado = (pagamento_avista_habilitado or pagamento_boleto_habilitado);
alter table catalogo_publico_canais drop column if exists pagamento_avista_habilitado;
alter table catalogo_publico_canais drop column if exists pagamento_boleto_habilitado;
