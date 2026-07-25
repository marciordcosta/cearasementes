-- =====================================================================
-- Parametrização das regras de sugestão/conciliação automática — hoje
-- viviam fixas no código (matching.ts): taxa de maquininha, janela de dias
-- úteis, tolerância de valor, tamanho mínimo de nome pra bater PIX. Uma
-- linha por forma de pagamento/recebimento (cartão débito e crédito são
-- linhas separadas, já que têm faixas de taxa bem diferentes).
-- =====================================================================

create table if not exists conciliacao_regras (
  id uuid primary key default gen_random_uuid(),
  forma_pagamento text not null unique check (forma_pagamento in ('PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'BOLETO', 'CHEQUE')),
  -- Tolerância de diferença de valor (R$) pra considerar "mesmo valor" — usada em PIX/Cheque/Boleto. Cartão não usa (a diferença ali é sempre a taxa, tratada como percentual).
  tolerancia_valor numeric(10, 2) not null default 0.01,
  -- Janela de dias úteis entre a data do sistema e a do OFX. Boleto usa os dois (mín. e máx.); Cartão só usa o máximo (não tem mínimo, aceita qualquer dia até o limite).
  dias_uteis_min integer,
  dias_uteis_max integer,
  -- Faixa de taxa aceitável da maquininha, em percentual (ex.: 1.9 = 1,9%) — só Cartão Débito/Crédito.
  taxa_min_percentual numeric(5, 2),
  taxa_max_percentual numeric(5, 2),
  -- Comparação de nome (só PIX): tamanho mínimo pra considerar "nome contido" um no outro, e tamanho mínimo do sobrenome do sistema pra bater pela inicial do OFX.
  nome_min_contido integer,
  nome_min_sobrenome integer,
  -- Se desligado, a Conciliação Automática não exige NF preenchida nessa forma de pagamento pra fechar sozinha.
  exigir_nf_automatica boolean not null default true,
  atualizado_em timestamptz not null default now()
);

insert into conciliacao_regras
  (forma_pagamento, tolerancia_valor, dias_uteis_min, dias_uteis_max, taxa_min_percentual, taxa_max_percentual, nome_min_contido, nome_min_sobrenome, exigir_nf_automatica)
values
  ('PIX', 0.01, null, null, null, null, 8, 5, true),
  ('CARTAO_DEBITO', 0.01, null, 2, 0.90, 3.00, null, null, true),
  ('CARTAO_CREDITO', 0.01, null, 2, 1.90, 5.00, null, null, true),
  ('BOLETO', 0.01, 2, 3, null, null, null, null, true),
  ('CHEQUE', 0.01, null, null, null, null, null, null, true)
on conflict (forma_pagamento) do nothing;

alter table conciliacao_regras enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'conciliacao_regras' and policyname = 'acesso_total_conciliacao_regras') then
    create policy "acesso_total_conciliacao_regras" on conciliacao_regras for all using (true) with check (true);
  end if;
end $$;
