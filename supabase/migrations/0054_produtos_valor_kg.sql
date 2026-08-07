-- Custo (R$) deixa de ser digitado direto na Tabela de Preços — passa a ser
-- sempre valor_kg x peso, calculado a partir do Editar Produto. valor_kg
-- novo começa retroalimentado a partir do custo já cadastrado (custo/peso),
-- pra ninguém ser barrado editando um produto existente só por causa desse
-- campo novo ainda vazio.
alter table produtos
  add column if not exists valor_kg numeric not null default 0;

update produtos
set valor_kg = round(custo / peso, 4)
where valor_kg = 0 and peso > 0;
