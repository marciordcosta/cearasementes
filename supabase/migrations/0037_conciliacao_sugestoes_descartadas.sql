-- Descartar uma sugestão específica (par Banco+Sistema) sem afetar mais
-- nada: ela some das sugestões (manuais e da conciliação automática) só
-- pra esse par, mas o candidato continua aparecendo normalmente pra
-- qualquer OUTRO lançamento. Cascade nas duas FKs: se um dos dois
-- lançamentos for excluído (reimport, etc.), o descarte também some.
create table if not exists conciliacao_sugestoes_descartadas (
  id uuid primary key default gen_random_uuid(),
  banco_id uuid not null references conciliacao_lancamentos_banco (id) on delete cascade,
  sistema_id uuid not null references conciliacao_lancamentos_sistema (id) on delete cascade,
  criado_em timestamptz not null default now(),
  unique (banco_id, sistema_id)
);

alter table conciliacao_sugestoes_descartadas enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'conciliacao_sugestoes_descartadas' and policyname = 'acesso_total_conciliacao_sugestoes_descartadas') then
    create policy "acesso_total_conciliacao_sugestoes_descartadas" on conciliacao_sugestoes_descartadas for all using (true) with check (true);
  end if;
end $$;
