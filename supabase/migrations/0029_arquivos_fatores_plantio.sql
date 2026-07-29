-- =====================================================================
-- Fatores GLOBAIS de plantio (não são por produto) — Modo de Plantio e
-- Condição de Implantação, usados no "Guia de Plantio" pra corrigir o
-- kg/ha conforme a forma real de semeadura. 5 linhas fixas (2 modos + 3
-- condições); só o valor do fator é editável, as linhas em si não mudam.
-- =====================================================================

create table if not exists arquivos_fatores_plantio (
  chave text primary key,
  categoria text not null check (categoria in ('modo', 'condicao')),
  rotulo text not null,
  fator text not null,
  atualizado_em timestamptz not null default now()
);

insert into arquivos_fatores_plantio (chave, categoria, rotulo, fator)
values
  ('linha_cova', 'modo', 'Em Linha / Cova', '1.00'),
  ('lanco', 'modo', 'A Lanço', '0.80'),
  ('ideal', 'condicao', 'Ideal', '1.00'),
  ('media', 'condicao', 'Média', '0.75'),
  ('baixa', 'condicao', 'Baixa', '0.50')
on conflict (chave) do nothing;

alter table arquivos_fatores_plantio enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'arquivos_fatores_plantio' and policyname = 'acesso_total_arquivos_fatores_plantio') then
    create policy "acesso_total_arquivos_fatores_plantio" on arquivos_fatores_plantio for all using (true) with check (true);
  end if;
end $$;
