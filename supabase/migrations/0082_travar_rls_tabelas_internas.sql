-- =====================================================================
-- Trava acesso "só autenticado" em TODA tabela interna do ERP.
--
-- Até aqui, toda tabela nascia com uma política "acesso_total_<tabela>"
-- usando `using (true)` — herdado de antes do Google Login existir (ver
-- comentário original em 0001_init.sql: "o ERP ainda não tem sistema de
-- contas"). `using (true)` libera QUALQUER chamada, inclusive sem login
-- nenhum — a chave anon (pública, visível no bundle do navegador) já
-- basta pra ler/escrever em produtos, canais_preco, laudos, Parametrização,
-- etc. direto pela API do Supabase, pulando a tela toda.
--
-- Como o app já exige Google Login pra qualquer uso normal, não tem
-- motivo pra manter isso aberto. Troca TODA política de TODA tabela do
-- schema public (exceto o snapshot do Catálogo Online, que é
-- intencionalmente público) por `auth.role() = 'authenticated'`.
--
-- Dinâmico (varre pg_tables/pg_policies) em vez de listar tabela por
-- tabela — mais seguro que confiar em lembrar cada nome de política já
-- criada ao longo de ~80 migrations anteriores; qualquer tabela nova
-- também já nasce protegida.
-- =====================================================================

do $$
declare
  t text;
  pol text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename not in ('catalogo_publico_itens', 'catalogo_publico_canais')
  loop
    execute format('alter table %I enable row level security;', t);

    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on %I;', pol, t);
    end loop;

    execute format(
      'create policy %I on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'');',
      'somente_autenticado_' || t,
      t
    );
  end loop;
end $$;
