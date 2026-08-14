-- =====================================================================
-- Catálogo Online — link público (sem login) por Tabela de Preço.
--
-- Em vez de calcular preço ao vivo na página pública (o que exigiria
-- mandar Custo/Margem/Encargos pro navegador de qualquer visitante,
-- mesmo escondidos na tela — dado sensível fica visível no DevTools),
-- o operador clica "Publicar" na Precificação (autenticado, já com
-- Custo/Margem em mãos com segurança) e o sistema SALVA só o preço já
-- calculado (nome + preço + peso) nessa tabela — a página pública lê
-- só daqui, nunca de `produtos`/`canais` diretamente. "Publicar" de
-- novo substitui o snapshot anterior inteiro daquele canal.
-- =====================================================================

create table if not exists catalogo_publico_itens (
  id uuid primary key default gen_random_uuid(),
  canal_id uuid not null references canais_preco(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete cascade,
  nome text not null,
  categoria_nome text not null,
  preco numeric not null,
  peso numeric not null,
  ordem integer not null default 0,
  atualizado_em timestamptz not null default now(),
  unique (canal_id, produto_id)
);

create index if not exists idx_catalogo_publico_itens_canal on catalogo_publico_itens (canal_id);

alter table catalogo_publico_itens enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'catalogo_publico_itens' and policyname = 'leitura_publica_catalogo_publico_itens') then
    create policy "leitura_publica_catalogo_publico_itens" on catalogo_publico_itens for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'catalogo_publico_itens' and policyname = 'escrita_autenticada_catalogo_publico_itens') then
    create policy "escrita_autenticada_catalogo_publico_itens" on catalogo_publico_itens for all
      using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- Metadados do canal que a página pública precisa (nome pro título) — sem tabela nova, só uma
-- policy de leitura pública ESPECÍFICA (além da "acesso total" que já existe pra quem tem a anon
-- key de qualquer forma — essa aqui é só pra deixar explícito que leitura de `canais_preco` é
-- intencionalmente pública, não um descuido).
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'canais_preco' and policyname = 'leitura_publica_canais_preco_catalogo') then
    create policy "leitura_publica_canais_preco_catalogo" on canais_preco for select using (true);
  end if;
end $$;
