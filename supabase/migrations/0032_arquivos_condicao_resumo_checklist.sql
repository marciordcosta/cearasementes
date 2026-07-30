-- =====================================================================
-- Resumo técnico por Condição de Implantação (texto curto exibido no Guia
-- de Plantio ao escolher Baixa/Média/Ideal) + Checklist de diagnóstico de
-- campo (perguntas com opções marcáveis, cada opção ligada a uma condição)
-- que o operador preenche pra deixar o sistema decidir a condição real.
-- =====================================================================

alter table arquivos_fatores_plantio add column if not exists resumo text;

update arquivos_fatores_plantio set resumo =
  'Área 100% limpa (sem mato ou pasto velho), solo bem gradeado e fofo, plantio na época de chuva firme (ou irrigado) e sementes cobertas de 1 a 2 cm. Garante o teto máximo de nascimento.'
  where chave = 'ideal' and resumo is null;

update arquivos_fatores_plantio set resumo =
  'Área com pouca sujeira ou palhada seca, preparo padrão do solo, plantio nas chuvas, mas sem o uso de rolo compactador (cobertura feita por grade fechada ou correntes).'
  where chave = 'media' and resumo is null;

update arquivos_fatores_plantio set resumo =
  'Área suja (presença de mato verde, plantas invasoras ou outra gramínea/pasto velho competindo com o capim novo), solo bruto sem preparo, risco de seca/veranico ou sementes jogadas na superfície sem cobertura nenhuma.'
  where chave = 'baixa' and resumo is null;

create table if not exists arquivos_checklist_perguntas (
  id uuid primary key default gen_random_uuid(),
  ordem integer not null,
  pergunta text not null,
  atualizado_em timestamptz not null default now()
);

create table if not exists arquivos_checklist_opcoes (
  id uuid primary key default gen_random_uuid(),
  pergunta_id uuid not null references arquivos_checklist_perguntas(id) on delete cascade,
  ordem integer not null,
  texto text not null,
  -- Qual condição (arquivos_fatores_plantio.chave, categoria='condicao') essa opção representa.
  condicao_chave text not null references arquivos_fatores_plantio(chave),
  atualizado_em timestamptz not null default now()
);

alter table arquivos_checklist_perguntas enable row level security;
alter table arquivos_checklist_opcoes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'arquivos_checklist_perguntas' and policyname = 'acesso_total_arquivos_checklist_perguntas') then
    create policy "acesso_total_arquivos_checklist_perguntas" on arquivos_checklist_perguntas for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'arquivos_checklist_opcoes' and policyname = 'acesso_total_arquivos_checklist_opcoes') then
    create policy "acesso_total_arquivos_checklist_opcoes" on arquivos_checklist_opcoes for all using (true) with check (true);
  end if;
end $$;

-- Seed do checklist padrão (só roda se a tabela de perguntas estiver vazia — não duplica se já foi customizado).
do $$
declare
  p1 uuid; p2 uuid; p3 uuid; p4 uuid;
begin
  if exists (select 1 from arquivos_checklist_perguntas) then
    return;
  end if;

  insert into arquivos_checklist_perguntas (ordem, pergunta) values (1, 'Como está a limpeza da área onde você vai plantar?') returning id into p1;
  insert into arquivos_checklist_opcoes (pergunta_id, ordem, texto, condicao_chave) values
    (p1, 1, 'Área 100% limpa (terra preta à vista, sem mato vivo e sem raiz de pasto velho).', 'ideal'),
    (p1, 2, 'Área com pouca palhada seca ou resto de lavoura anterior, sem mato verde.', 'media'),
    (p1, 3, 'Área suja (com mato verde crescendo, plantas invasoras ou pasto velho competindo).', 'baixa');

  insert into arquivos_checklist_perguntas (ordem, pergunta) values (2, 'Como será feito o preparo mecânico do seu solo?') returning id into p2;
  insert into arquivos_checklist_opcoes (pergunta_id, ordem, texto, condicao_chave) values
    (p2, 1, 'Bem trabalhado (foi feita aração, gradagem pesada e niveladora sem torrões).', 'ideal'),
    (p2, 2, 'Preparo padrão (apenas uma passada de grade rápida, solo com alguns torrões).', 'media'),
    (p2, 3, 'Solo bruto / Plantio direto sobre pasto velho / Sem preparo mecânico.', 'baixa');

  insert into arquivos_checklist_perguntas (ordem, pergunta) values (3, 'Como está a previsão de chuvas na sua região para os próximos 15 dias?') returning id into p3;
  insert into arquivos_checklist_opcoes (pergunta_id, ordem, texto, condicao_chave) values
    (p3, 1, 'Chuva totalmente firmada (chove toda semana) ou a área possui irrigação.', 'ideal'),
    (p3, 2, 'Chuvas normais da época, mas intercaladas com alguns dias de sol forte.', 'media'),
    (p3, 3, 'Pouca chuva / Transição para a seca / Alto risco de veranico (dias de sol quente).', 'baixa');

  insert into arquivos_checklist_perguntas (ordem, pergunta) values (4, 'Como a semente será coberta após cair no chão?') returning id into p4;
  insert into arquivos_checklist_opcoes (pergunta_id, ordem, texto, condicao_chave) values
    (p4, 1, 'Será passado rolo compactador imediatamente OU a chuva forte vai assentar a terra.', 'ideal'),
    (p4, 2, 'Será passada uma grade niveladora bem fechada ou corrente para enterrar levemente.', 'media'),
    (p4, 3, 'A semente vai ficar totalmente na superfície da terra, sem nenhuma cobertura.', 'baixa');
end $$;
