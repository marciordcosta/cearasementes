-- Espécie também é por LAUDO (por lote), como Categoria (ver migração 0044) —
-- extraída do documento quando possível (interpretarConteudoLaudo.ts já tenta,
-- ver extras.Espécie) e editável em "Editar Laudo" quando a extração não achar.
-- Usada em dois lugares diferentes: o Nome do Produto do laudo passa a ser
-- "Espécie + Cultivar" (ex.: "Andropogon Gayanus Planaltina"), e o Selo
-- impresso usa só a Espécie sozinha na linha ESPÉCIE (ex.: "Andropogon Gayanus").

alter table arquivos_laudos
  add column if not exists especie text;
