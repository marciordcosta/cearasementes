-- Visibilidade por Fornecedor (Parametrização de Custos > Fornecedores): visivel_grade = false
-- esconde os produtos desse fornecedor da grade da Tabela de Preços (e, por consequência, do PDF
-- também); visivel_pdf = false esconde só do PDF, mantendo normal na grade.
alter table fornecedores
  add column if not exists visivel_grade boolean not null default true,
  add column if not exists visivel_pdf boolean not null default true;
