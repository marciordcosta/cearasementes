-- Cultivar (Produto.cultivar) publicado junto no snapshot público do Catálogo Online — mesma
-- informação usada pra agrupar "mesmo produto" na grade/PDFs internos (ver chaveComparacaoProduto
-- em calculations.ts) passa a valer também no catálogo que o cliente vê e nos PDFs gerados a partir
-- dele. Não é dado sensível (ao contrário de Custo/Margem), então pode ir pro snapshot público.
alter table catalogo_publico_itens add column if not exists cultivar text;
