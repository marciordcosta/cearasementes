alter table canais_preco
  add column if not exists margem_referencia_canal_id uuid references canais_preco (id) on delete set null;
