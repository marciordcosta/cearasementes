-- =====================================================================
-- Módulo Gestão de Fretes — conectado à Precificação.
--
-- Cada linha de `transportadoras` representa um par Transportadora+Região
-- (ex.: "Ceará Transportes" atende CE, PI, PB e PE com tarifas DIFERENTES
-- em cada região — por isso a região faz parte da identidade da linha, não
-- é só um filtro). Fiel ao protótipo (frete.js): valor_por_nf e
-- taxa_coleta podem ser um PERCENTUAL do valor da mercadoria OU um valor
-- FIXO em R$ (ex.: Potyguar cobra R$ 11,00 fixos de NF, não %) — por isso
-- os campos "_tipo" existem: o protótipo original decidia isso na hora do
-- cálculo com uma regra frágil ("se <= 1, é percentual"), aqui é explícito.
-- =====================================================================

create table if not exists transportadoras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  uf text not null,
  valor_por_kg numeric(10, 4) not null default 0,
  valor_por_nf numeric(10, 4) not null default 0,
  valor_por_nf_tipo text not null default 'percentual' check (valor_por_nf_tipo in ('percentual', 'fixo')),
  taxa_coleta numeric(10, 4) not null default 0,
  taxa_coleta_tipo text not null default 'fixo' check (taxa_coleta_tipo in ('percentual', 'fixo')),
  frete_minimo numeric(10, 2) not null default 0,
  -- Prazo "representativo" da região (pra exibir na lista/gestão sem
  -- precisar abrir o detalhe por cidade) — o prazo de verdade, usado na
  -- Cotação de Frete, vem de transportadora_prazos por cidade.
  prazo_padrao_horas integer,
  prazo_padrao_texto text,
  ativa boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  unique (nome, uf)
);

create index if not exists idx_transportadoras_uf on transportadoras (uf);

-- Prazo de entrega por cidade — igual ao original: número de horas úteis
-- OU um texto livre (ex.: "Semanal"). Cidade sem linha aqui = não atendida.
create table if not exists transportadora_prazos (
  id uuid primary key default gen_random_uuid(),
  transportadora_id uuid not null references transportadoras (id) on delete cascade,
  cidade text not null,
  prazo_horas integer,
  prazo_texto text,
  criado_em timestamptz not null default now(),
  unique (transportadora_id, cidade)
);

create index if not exists idx_transportadora_prazos_cidade on transportadora_prazos (cidade);
create index if not exists idx_transportadora_prazos_transportadora on transportadora_prazos (transportadora_id);

-- ---------------------------------------------------------------------
-- Vínculo com a Precificação: ao escolher uma Transportadora (par
-- Transportadora+Região) na Parametrização de Custos de uma Tabela de
-- Preço, o front-end copia valor_por_kg -> frete_kg e valor_por_nf (quando
-- percentual) -> frete_pct daquele canal. Guardamos a referência pra
-- também poder reaplicar/atualizar depois, sem perder de onde veio.
-- ---------------------------------------------------------------------
alter table canais_preco add column if not exists transportadora_id uuid references transportadoras (id) on delete set null;

-- =====================================================================
-- RLS — mesmo padrão do restante do projeto (sem autenticação de usuário
-- ainda; ver nota em 0001_init.sql sobre trocar `using(true)` no futuro).
-- =====================================================================
alter table transportadoras enable row level security;
alter table transportadora_prazos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'transportadoras' and policyname = 'acesso_total_transportadoras') then
    create policy "acesso_total_transportadoras" on transportadoras for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'transportadora_prazos' and policyname = 'acesso_total_transportadora_prazos') then
    create policy "acesso_total_transportadora_prazos" on transportadora_prazos for all using (true) with check (true);
  end if;
end $$;
