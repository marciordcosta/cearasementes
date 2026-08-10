-- Custos Personalizados (Parametrização de Custos > aba "Custos") — lista
-- global de custos da empresa (aluguel, software, taxas fixas etc.), fora do
-- fluxo de Tabela de Preço/Produto. Puramente informativo: NÃO entra no
-- cálculo do preço sugerido (esse continua só com Custo/Frete/Encargos/
-- Imposto/Margem, como sempre) — só existe pra mostrar, lado a lado, quanto
-- cada custo pesa no total dos custos cadastrados e no total das vendas
-- (essas duas contas são feitas no front-end, não persistidas aqui).
create table if not exists custos_personalizados (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  -- 'reais' = valor fixo em R$; 'percentual' = valor já expresso como % das
  -- vendas (ex.: uma taxa de plataforma) — ver CustosPersonalizadosPanel.tsx
  -- pra como cada tipo vira R$/% na exibição.
  tipo text not null default 'reais' check (tipo in ('reais', 'percentual')),
  valor numeric(12, 2) not null default 0,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);

alter table custos_personalizados enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'custos_personalizados' and policyname = 'acesso_total_custos_personalizados') then
    create policy "acesso_total_custos_personalizados" on custos_personalizados for all using (true) with check (true);
  end if;
end $$;
