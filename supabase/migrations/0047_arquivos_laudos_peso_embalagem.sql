-- Peso por Embalagem (kg) também vem do próprio LAUDO (tabela do Boletim de
-- Análise, coluna "Peso por Embalagem"), como Lote/Pureza/Germinação/Validade
-- — extraído do documento quando possível (interpretarConteudoLaudo.ts) e
-- editável em "Editar Laudo" quando não. Usado no Selo impresso (linha
-- PESO): tem prioridade sobre o peso casado por nome na Tabela de Preço
-- (Produto.peso), que continua servindo de fallback pros laudos sem esse
-- dado (ex.: laudos antigos, importados antes desse campo existir). Não
-- confundir com "pms" (Peso de Mil Sementes, outra unidade/uso).

alter table arquivos_laudos
  add column if not exists peso_embalagem text;
