-- =====================================================================
-- Parametrização de Produtos: PMS base, Densidade base (população alvo,
-- plantas/m²) e Índice de Sobrevivência por produto (nome) — usados no
-- cálculo de kg/ha. PMS pode ser sobrescrito por lote (arquivos_laudos.pms)
-- — quando o lote não informa, cai pro PMS base daqui. Densidade e Índice
-- de Sobrevivência só existem aqui (não têm campo por lote).
-- =====================================================================

create table if not exists arquivos_parametrizacao_produtos (
  id uuid primary key default gen_random_uuid(),
  nome_produto text not null,
  pms_base text,
  densidade_base text,
  indice_sobrevivencia text,
  atualizado_em timestamptz not null default now()
);

alter table arquivos_parametrizacao_produtos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'arquivos_parametrizacao_produtos' and policyname = 'acesso_total_arquivos_parametrizacao_produtos') then
    create policy "acesso_total_arquivos_parametrizacao_produtos" on arquivos_parametrizacao_produtos for all using (true) with check (true);
  end if;
end $$;
