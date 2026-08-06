-- Fornecedor vira um cadastro próprio (Parametrização de Custos), não texto
-- livre — o campo "Fornecedor" no Editar Produto passa a puxar as opções
-- daqui (mesma ideia de Categoria). O nome cadastrado pode conter a mesma
-- marcação *negrito*/_itálico_ usada no nome do produto (ver
-- NomeComDestaque em PricingTable.tsx), aparece na Tabela de Preços logo
-- depois do nome do produto.
create table if not exists fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ordem integer not null default 0
);

alter table fornecedores enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'fornecedores' and policyname = 'acesso_total_fornecedores') then
    create policy "acesso_total_fornecedores" on fornecedores for all using (true) with check (true);
  end if;
end $$;

alter table produtos
  add column if not exists fornecedor_id uuid references fornecedores (id) on delete set null;

-- Imprimir: controla só se o produto entra no catálogo em PDF — desmarcado
-- não afeta nada mais, o produto continua normal na tela.
alter table produtos
  add column if not exists imprimir boolean not null default true;
