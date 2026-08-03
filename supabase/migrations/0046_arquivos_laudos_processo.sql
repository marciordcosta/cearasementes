-- Processo (Tradicional/Incrustado) passa a ser um campo por LAUDO editável,
-- como Categoria (ver migração 0044) — extraída do documento quando possível
-- (interpretarConteudoLaudo.ts já tenta, ver extras.Processo) e editável em
-- "Editar Laudo" quando não. Antes era só derivado por adivinhação (checando
-- se alguma palavra do Cultivar continha "incrustad"); agora vem direto do
-- laudo e é a linha PROCESSO do Selo impresso. Espécie deixa de ter campo
-- editável nesse modal (o Nome do Produto já cobre essa correção).

alter table arquivos_laudos
  add column if not exists processo text;
