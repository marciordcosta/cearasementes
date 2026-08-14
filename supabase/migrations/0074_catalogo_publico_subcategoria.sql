-- =====================================================================
-- Nome da Subcategoria (Classe) por item publicado — entra na busca do
-- Catálogo Online (CatalogoPublicoPage.tsx), igual à Categoria já
-- publicada: nem todo nome de produto carrega a Classe dele.
-- =====================================================================

alter table catalogo_publico_itens add column if not exists subcategoria_nome text;
