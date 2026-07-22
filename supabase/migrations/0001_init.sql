-- =====================================================================
-- ERP Ceará Sementes — schema inicial
-- Cobre: Relatório 124 (entregas/transportadoras), Relatório 396 (vendas
-- por tabela de preço) e o módulo de Precificação Inteligente.
--
-- Convenção: cada relatório importado guarda só os campos MAPEADOS pelo
-- usuário na tela de Uploads (não a planilha crua) — isso é o que o
-- front-end grava depois de rodar o mapeamento de colunas.
-- =====================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- Relatório 124 — Entregas por Transportadora
-- ---------------------------------------------------------------------
create table if not exists entregas_transportadora (
  id uuid primary key default gen_random_uuid(),
  transportadora text not null,
  valor numeric(14, 2) not null,
  data_pedido date,
  arquivo_origem text not null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_entregas_transportadora_data on entregas_transportadora (data_pedido);
create index if not exists idx_entregas_transportadora_nome on entregas_transportadora (transportadora);

-- ---------------------------------------------------------------------
-- Relatório 396 — Vendas por Tabela de Preço
-- ---------------------------------------------------------------------
create table if not exists vendas_tabela_preco (
  id uuid primary key default gen_random_uuid(),
  tabela_preco text not null,
  codigo_cliente text,
  valor_bruto numeric(14, 2) not null default 0,
  desconto numeric(14, 2) not null default 0,
  valor_liquido numeric(14, 2) not null,
  data_venda date,
  arquivo_origem text not null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_vendas_tabela_preco_data on vendas_tabela_preco (data_venda);
create index if not exists idx_vendas_tabela_preco_tabela on vendas_tabela_preco (tabela_preco);

-- ---------------------------------------------------------------------
-- Uploads — histórico de arquivos processados (substitui o "fileLog" que
-- antes vivia só em memória) e mapeamentos de coluna salvos por tipo de
-- relatório, para o usuário não precisar remapear a cada envio.
-- ---------------------------------------------------------------------
create table if not exists uploads_log (
  id uuid primary key default gen_random_uuid(),
  arquivo_nome text not null,
  tipo_relatorio text not null check (tipo_relatorio in ('124', '396')),
  linhas_importadas integer not null default 0,
  status text not null check (status in ('sucesso', 'aviso', 'erro')),
  mensagem text,
  criado_em timestamptz not null default now()
);

create table if not exists upload_mapeamentos (
  tipo_relatorio text primary key check (tipo_relatorio in ('124', '396')),
  mapeamento jsonb not null,
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Precificação Inteligente — Tabelas de Preço (canais de venda)
-- ---------------------------------------------------------------------
create table if not exists canais_preco (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  desconto numeric(6, 2) not null default 0,
  comissao numeric(6, 2) not null default 0,
  cartao numeric(6, 2) not null default 0,
  outros_encargos numeric(10, 2) not null default 0,
  frete_kg numeric(10, 4) not null default 0,
  frete_pct numeric(6, 2) not null default 0,
  frete_adicional_tipo text not null default 'fixo' check (frete_adicional_tipo in ('fixo', 'kg')),
  frete_adicional_valor numeric(10, 2) not null default 0,
  tipo_imposto text not null default 'estadual' check (tipo_imposto in ('estadual', 'interestadual')),
  visivel boolean not null default true,
  frete_incluso boolean not null default true,
  cor_indice integer not null default 0,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Precificação Inteligente — Categorias de produto (impostos por
-- categoria) + margem-alvo por categoria x canal
-- ---------------------------------------------------------------------
create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  estadual numeric(6, 2) not null default 18,
  interestadual numeric(6, 2) not null default 12,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);

create table if not exists categoria_margens (
  categoria_id uuid not null references categorias (id) on delete cascade,
  canal_id uuid not null references canais_preco (id) on delete cascade,
  margem_pct numeric(6, 2) not null default 20,
  primary key (categoria_id, canal_id)
);

-- ---------------------------------------------------------------------
-- Precificação Inteligente — Produtos + preço por canal (preço sugerido
-- calculado no front-end; "manual" marca que o usuário sobrescreveu)
-- ---------------------------------------------------------------------
create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo text,
  categoria_id uuid not null references categorias (id) on delete restrict,
  custo numeric(12, 2) not null default 0,
  peso numeric(10, 3) not null default 0,
  despesa_extra_valor numeric(10, 2) not null default 0,
  despesa_extra_destino text not null default 'frete' check (despesa_extra_destino in ('frete', 'impostos')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_produtos_categoria on produtos (categoria_id);

create table if not exists produto_precos (
  produto_id uuid not null references produtos (id) on delete cascade,
  canal_id uuid not null references canais_preco (id) on delete cascade,
  preco numeric(12, 2),
  manual boolean not null default false,
  primary key (produto_id, canal_id)
);

-- =====================================================================
-- RLS — habilitado em todas as tabelas. Como o ERP ainda não tem um
-- sistema de contas por usuário, as políticas abaixo liberam leitura e
-- escrita para qualquer chamada autenticada com a anon key. Quando
-- entrar autenticação de usuários, troque `using (true)` por uma
-- checagem de auth.uid() / organização.
-- =====================================================================
alter table entregas_transportadora enable row level security;
alter table vendas_tabela_preco enable row level security;
alter table uploads_log enable row level security;
alter table upload_mapeamentos enable row level security;
alter table canais_preco enable row level security;
alter table categorias enable row level security;
alter table categoria_margens enable row level security;
alter table produtos enable row level security;
alter table produto_precos enable row level security;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'entregas_transportadora', 'vendas_tabela_preco', 'uploads_log',
      'upload_mapeamentos', 'canais_preco', 'categorias', 'categoria_margens',
      'produtos', 'produto_precos'
    ])
  loop
    execute format(
      'create policy "acesso_total_%1$s" on %1$s for all using (true) with check (true);',
      t
    );
  end loop;
end $$;

-- =====================================================================
-- Seed opcional — Tabelas de Preço e categorias padrão, iguais às que já
-- existiam como estado inicial do arquivo local precificacao-inteligente.html.
-- Comente este bloco se preferir começar zerado.
-- =====================================================================
insert into canais_preco (nome, desconto, comissao, cartao, frete_kg, frete_pct, tipo_imposto, cor_indice, ordem)
values
  ('Venda Consumidor', 5, 0, 1, 0.50, 1, 'estadual', 0, 0),
  ('Revenda CE', 5, 0, 0, 0.50, 1, 'estadual', 1, 1),
  ('Revenda PI', 5, 0, 0, 0.50, 0, 'interestadual', 2, 2)
on conflict (nome) do nothing;

insert into categorias (nome, estadual, interestadual, ordem)
values
  ('Capim', 3.5, 7.8, 0),
  ('Milho', 3.5, 7.8, 1),
  ('Sorgo', 3.5, 7.8, 2)
on conflict (nome) do nothing;

insert into categoria_margens (categoria_id, canal_id, margem_pct)
select c.id, ch.id,
  case
    when c.nome = 'Capim' and ch.nome = 'Venda Consumidor' then 20
    when c.nome = 'Capim' then 15
    when ch.nome = 'Venda Consumidor' then 15
    else 10
  end
from categorias c
cross join canais_preco ch
on conflict (categoria_id, canal_id) do nothing;
