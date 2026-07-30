-- =====================================================================
-- Manual de Plantio (texto que acompanha o PDF do Guia de Plantio,
-- opcionalmente) — editável na Parametrização de Produtos, uma linha só.
-- =====================================================================

create table if not exists arquivos_manual_plantio (
  id text primary key default 'default',
  titulo text not null,
  corpo text not null,
  atualizado_em timestamptz not null default now()
);

insert into arquivos_manual_plantio (id, titulo, corpo)
values (
  'default',
  'Manual Rápido de Plantio de Pastagem (passo a passo)',
  'Prezado(a) Cliente,

Se você nunca plantou pastagem antes, saiba que o segredo para ter um pasto fechado, limpo e produtivo não está na quantidade de semente jogada, mas sim no capricho do manejo.

Siga estes 4 passos práticos para garantir o sucesso do seu investimento:

1. O preparo do solo é tudo. As sementes precisam de terra fofa para soltar as primeiras raízes. Faça uma boa gradagem e o nivelamento do terreno antes de semear. Nunca jogue as sementes sobre solo duro, compactado ou cheio de grandes torrões de terra.

2. Cuidado com a profundidade (o maior erro de quem começa!). Sementes de capim são miúdas e frágeis. Elas devem ficar enterradas a no máximo 1 a 2 cm de profundidade. Se você usar uma grade niveladora para cobrir a semente, tome muito cuidado: se a semente afundar mais de 3 cm de terra, ela vai morrer sufocada antes de conseguir sair do chão.

3. O rolo compactador é o seu melhor amigo. Se o seu plantio for feito a lanço, passar o rolo compactador logo atrás da semente é indispensável. O rolo aperta a semente contra a terra úmida, o que evita que o vento a leve embora, dificulta o ataque de formigas e garante que ela consiga puxar a água necessária da terra para nascer.

4. Acerte a época da chuva. Só inicie o plantio quando o período de chuvas da sua região estiver totalmente firmado. Se a semente receber apenas uma chuva leve (que mal molha a terra) e depois vier uma sequência de dias de sol escaldante, a semente vai iniciar a germinação e morrer seca antes mesmo de virar uma plantinha.

Nota do consultor: a quantidade de sementes sugerida neste orçamento foi calculada por um sistema técnico inteligente. Ela já prevê as margens de perda natural do campo (como o ataque de pragas e pequenas variações do clima), garantindo o número exato de plantas por metro quadrado que a sua propriedade precisa.'
)
on conflict (id) do nothing;

alter table arquivos_manual_plantio enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'arquivos_manual_plantio' and policyname = 'acesso_total_arquivos_manual_plantio') then
    create policy "acesso_total_arquivos_manual_plantio" on arquivos_manual_plantio for all using (true) with check (true);
  end if;
end $$;
