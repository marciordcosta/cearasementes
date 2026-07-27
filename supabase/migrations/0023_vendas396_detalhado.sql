-- =====================================================================
-- Novo formato do Relatório 396 (padrão a partir de agora): exportação
-- "matricial" do Max-Manager, uma venda por bloco (cabeçalho da venda +
-- item(ns) + forma(s) de pagamento), em vez do export flat anterior (uma
-- linha = uma venda, só com os totais). Substitui também o Relatório 333
-- (Código/Produto/Custo), que deixa de ser importado — cada item já traz
-- o próprio custo unitário daquele dia, mais preciso que o custo "atual"
-- do 333.
--
-- Em vez de criar uma tabela paralela, ESTENDE vendas_tabela_preco (o
-- upsert por (tabela_preco, num_venda) — não mais num_doc, que agora é
-- por PAGAMENTO, não por venda, já que uma venda pode ter parcelas com
-- documentos diferentes) e soma os itens pra preencher valor_bruto/
-- desconto/valor_liquido, então quem já lê essas colunas continua
-- funcionando sem mudar nada. As duas tabelas novas (itens/pagamentos)
-- guardam o detalhe rico que o formato antigo não tinha.
-- =====================================================================

alter table vendas_tabela_preco
  add column if not exists num_venda integer,
  add column if not exists cliente text,
  add column if not exists vendedor text,
  add column if not exists cpf_cnpj text,
  add column if not exists num_nf text,
  add column if not exists hora_venda time;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vendas_tabela_preco_tabela_num_venda_key') then
    alter table vendas_tabela_preco add constraint vendas_tabela_preco_tabela_num_venda_key unique (tabela_preco, num_venda);
  end if;
end $$;

create index if not exists idx_vendas_tabela_preco_num_nf on vendas_tabela_preco (num_nf);

-- ---------------------------------------------------------------------
-- Itens (produtos) de cada venda — 1 linha por produto vendido.
-- ---------------------------------------------------------------------
create table if not exists vendas_tabela_preco_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas_tabela_preco (id) on delete cascade,
  cod_interno text,
  produto text not null,
  vlr_unitario numeric(14, 2) not null default 0,
  qtd numeric(12, 3) not null default 0,
  vlr_sem_desc numeric(14, 2) not null default 0,
  vlr_desc numeric(14, 2) not null default 0,
  vlr_com_desc numeric(14, 2) not null default 0,
  custo_unitario numeric(14, 4) not null default 0,
  criado_em timestamptz not null default now()
);

create index if not exists idx_vendas_396_itens_venda on vendas_tabela_preco_itens (venda_id);
create index if not exists idx_vendas_396_itens_cod_interno on vendas_tabela_preco_itens (cod_interno);

-- ---------------------------------------------------------------------
-- Pagamentos de cada venda — 1 linha por forma de pagamento (pode ter
-- várias: parcelamento no cartão, split dinheiro+PIX, etc.).
-- ---------------------------------------------------------------------
create table if not exists vendas_tabela_preco_pagamentos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas_tabela_preco (id) on delete cascade,
  forma_pagamento text not null,
  num_doc text,
  vencimento date,
  valor numeric(14, 2) not null default 0,
  criado_em timestamptz not null default now()
);

create index if not exists idx_vendas_396_pagamentos_venda on vendas_tabela_preco_pagamentos (venda_id);
create index if not exists idx_vendas_396_pagamentos_forma on vendas_tabela_preco_pagamentos (forma_pagamento);

alter table vendas_tabela_preco_itens enable row level security;
alter table vendas_tabela_preco_pagamentos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'vendas_tabela_preco_itens' and policyname = 'acesso_total_vendas_tabela_preco_itens') then
    create policy "acesso_total_vendas_tabela_preco_itens" on vendas_tabela_preco_itens for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'vendas_tabela_preco_pagamentos' and policyname = 'acesso_total_vendas_tabela_preco_pagamentos') then
    create policy "acesso_total_vendas_tabela_preco_pagamentos" on vendas_tabela_preco_pagamentos for all using (true) with check (true);
  end if;
end $$;
