-- =====================================================================
-- Módulo Conciliação Bancária — ISOLADO (nenhuma FK para tabelas de BI/
-- Precificação/Uploads). Espelha o modelo de dados do protótipo
-- (conciliacao.js), que hoje só vive em localStorage no navegador —
-- portanto não existe schema anterior a migrar, este é o desenho novo.
--
-- Duas fontes de lançamento (banco = extrato OFX; sistema = relatório
-- "matricial" HTML do Max Data, ou lançamento manual), ligadas em grupos
-- N-para-M por conciliacao_grupos (equivalente ao "parChave" do
-- protótipo) — um grupo pode ligar várias entradas do sistema (várias NFs)
-- a um único lançamento do banco, ou vice-versa.
-- =====================================================================

-- Cada conciliação (manual ou automática) gera um grupo; cancelar a
-- conciliação apenas desvincula os lançamentos (grupo_id = null), não
-- precisa apagar a linha do grupo.
create table if not exists conciliacao_grupos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now()
);

-- Histórico de arquivos importados (um OFX ou um relatório do Max Data por
-- linha) — permite excluir "o arquivo" e, em cascata, os lançamentos que
-- vieram dele, igual ao botão "✕" ao lado de cada arquivo no protótipo.
create table if not exists conciliacao_arquivos (
  id uuid primary key default gen_random_uuid(),
  nome_arquivo text not null,
  tipo text not null check (tipo in ('ofx', 'sistema')),
  banco_codigo text,
  banco_nome text,
  enviado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Lançamentos do BANCO (extrato OFX). `origem = 'manual'` cobre o caso
-- "Conciliar manual (Sistema → OFX)" do protótipo, quando um lançamento do
-- sistema é conciliado sem ter um correspondente real no banco (o
-- protótipo criava um registro OFX "FAKE_"; aqui é só origem='manual').
-- ---------------------------------------------------------------------
create table if not exists conciliacao_lancamentos_banco (
  id uuid primary key default gen_random_uuid(),
  arquivo_id uuid references conciliacao_arquivos (id) on delete cascade,
  origem text not null default 'ofx' check (origem in ('ofx', 'manual')),
  banco_codigo text,
  banco_nome text,
  data date not null,
  valor numeric(14, 2) not null,
  descricao text,
  forma_pagamento text not null default 'OUTRO' check (forma_pagamento in ('PIX', 'CARTAO', 'BOLETO', 'CHEQUE', 'RENDIMENTO', 'OUTRO')),
  conciliado boolean not null default false,
  desativado boolean not null default false,
  marcado boolean not null default false,
  observacao text,
  grupo_id uuid references conciliacao_grupos (id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_concil_banco_data on conciliacao_lancamentos_banco (data);
create index if not exists idx_concil_banco_grupo on conciliacao_lancamentos_banco (grupo_id);
create index if not exists idx_concil_banco_arquivo on conciliacao_lancamentos_banco (arquivo_id);

-- ---------------------------------------------------------------------
-- Lançamentos do SISTEMA (relatório Max Data + manuais + taxa de cartão
-- automática). `origem = 'taxa_automatica'` cobre o registro
-- "AUTO_TAXA_CARTAO" do protótipo: quando um lançamento de cartão do
-- sistema vale mais que o valor creditado no banco, a diferença vira uma
-- linha de despesa automática (taxa da maquininha) que acumula ao longo
-- das conciliações.
-- ---------------------------------------------------------------------
create table if not exists conciliacao_lancamentos_sistema (
  id uuid primary key default gen_random_uuid(),
  arquivo_id uuid references conciliacao_arquivos (id) on delete cascade,
  origem text not null default 'sistema' check (origem in ('sistema', 'manual', 'taxa_automatica')),
  tipo_lancamento text not null default 'Entrada' check (tipo_lancamento in ('Entrada', 'Saída')),
  cliente text,
  documento text,
  nf text,
  vendedor text,
  forma_pagamento_raw text,
  valor numeric(14, 2) not null,
  data date,
  conciliado boolean not null default false,
  desativado boolean not null default false,
  taxa_valor numeric(14, 2) not null default 0,
  taxa_percentual numeric(6, 2) not null default 0,
  grupo_id uuid references conciliacao_grupos (id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_concil_sistema_data on conciliacao_lancamentos_sistema (data);
create index if not exists idx_concil_sistema_grupo on conciliacao_lancamentos_sistema (grupo_id);
create index if not exists idx_concil_sistema_arquivo on conciliacao_lancamentos_sistema (arquivo_id);
create index if not exists idx_concil_sistema_nf on conciliacao_lancamentos_sistema (nf);

-- =====================================================================
-- RLS
-- =====================================================================
alter table conciliacao_grupos enable row level security;
alter table conciliacao_arquivos enable row level security;
alter table conciliacao_lancamentos_banco enable row level security;
alter table conciliacao_lancamentos_sistema enable row level security;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'conciliacao_grupos', 'conciliacao_arquivos',
      'conciliacao_lancamentos_banco', 'conciliacao_lancamentos_sistema'
    ])
  loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = format('acesso_total_%s', t)) then
      execute format('create policy "acesso_total_%1$s" on %1$s for all using (true) with check (true);', t);
    end if;
  end loop;
end $$;
