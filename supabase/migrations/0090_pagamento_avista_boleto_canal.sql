alter table canais_preco add column if not exists pagamento_avista_habilitado boolean not null default false;
alter table canais_preco add column if not exists pagamento_avista_desconto_pct numeric not null default 0;
alter table canais_preco add column if not exists pagamento_boleto_habilitado boolean not null default false;
alter table canais_preco add column if not exists pagamento_boleto_valor_minimo numeric not null default 0;
alter table canais_preco add column if not exists pagamento_boleto_parcelas_max integer not null default 1;

alter table catalogo_publico_canais add column if not exists pagamento_avista_habilitado boolean not null default false;
alter table catalogo_publico_canais add column if not exists pagamento_avista_desconto_pct numeric not null default 0;
alter table catalogo_publico_canais add column if not exists pagamento_boleto_habilitado boolean not null default false;
alter table catalogo_publico_canais add column if not exists pagamento_boleto_valor_minimo numeric not null default 0;
alter table catalogo_publico_canais add column if not exists pagamento_boleto_parcelas_max integer not null default 1;
