-- Campos por grupo usados só na impressão do Selo (etiqueta de lote, ver
-- src/features/arquivos/etiqueta.ts): Categoria (S1/S2/C1/C2...), Espécie
-- (nome científico, ex.: "Andropogon Gayanus" — não dá pra derivar do nome
-- do laudo, que só traz o nome comum + cultivar) e Observação (texto livre
-- impresso no selo, ex.: registro RENASEM do produtor). Cultivar e Processo
-- (Tradicional/Incrustado) NÃO entram aqui — são derivados automaticamente
-- do nome do produto, não precisam de cadastro.

alter table arquivos_parametrizacao_produtos
  add column if not exists categoria text,
  add column if not exists especie text,
  add column if not exists observacao_etiqueta text;
