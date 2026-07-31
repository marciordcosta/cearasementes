-- =====================================================================
-- Nomes editáveis das categorias de sugestão da Conciliação (ex.: "Mesma
-- data", "Registro anterior ao pagamento"...) — separado das regras de
-- conciliação de propósito: aqui só o TEXTO exibido muda, nunca a lógica de
-- casamento. Sem linha pra uma chave = usa o texto padrão (ver
-- ROTULOS_CATEGORIA_PADRAO em types.ts).
-- =====================================================================

create table if not exists conciliacao_rotulos_categoria (
  chave text primary key,
  rotulo text not null
);

alter table conciliacao_rotulos_categoria enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'conciliacao_rotulos_categoria' and policyname = 'acesso_total_conciliacao_rotulos_categoria') then
    create policy "acesso_total_conciliacao_rotulos_categoria" on conciliacao_rotulos_categoria for all using (true) with check (true);
  end if;
end $$;
