alter table produto_precos
  add column if not exists precisa_ajuste boolean not null default false;
