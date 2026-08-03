-- Consolidado das migrações 0043 a 0047 (sandbox já rodou uma a uma; produção
-- só está em 0042) — resume pro efeito NET final, sem passar pelo vaivém
-- intermediário: 0043 criou categoria/especie em arquivos_parametrizacao_produtos
-- e 0044 desfez essas duas (ficou só observacao_etiqueta por lá), então aqui
-- só cria o que sobrou de fato. Resultado idêntico ao de rodar as 5
-- migrações em sequência.
--
-- Contexto de cada campo novo (Selo/etiqueta de lote, ver
-- src/features/arquivos/etiqueta.ts):
--  - observacao_etiqueta (por GRUPO de produto): texto livre impresso na
--    linha OBSERVAÇÃO do Selo (ex.: registro RENASEM do produtor) — fixo por
--    grupo, não muda por lote.
--  - categoria, especie, processo, peso_embalagem (por LAUDO/lote): lidos do
--    próprio documento quando o laudo traz (Categoria/Espécie/Processo no
--    corpo do texto, Peso por Embalagem na tabela do Boletim de Análise),
--    editáveis em "Editar Laudo" quando a extração não achar/errar.

alter table arquivos_parametrizacao_produtos
  add column if not exists observacao_etiqueta text;

alter table arquivos_laudos
  add column if not exists categoria text,
  add column if not exists especie text,
  add column if not exists processo text,
  add column if not exists peso_embalagem text;
