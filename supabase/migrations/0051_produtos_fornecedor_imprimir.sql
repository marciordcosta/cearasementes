-- Fornecedor (texto livre, aparece na Tabela de Preços logo depois do nome
-- do produto, seguindo a mesma marcação *negrito*/_itálico_ do nome) e
-- Imprimir (controla só se o produto entra no catálogo em PDF — desmarcado
-- não afeta nada mais, o produto continua normal na tela).
alter table produtos
  add column if not exists fornecedor text,
  add column if not exists imprimir boolean not null default true;
