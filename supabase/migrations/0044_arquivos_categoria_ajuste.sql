-- Ajusta a fonte da Categoria e da Espécie do Selo (ver migração 0043):
-- Categoria não é fixa por grupo — ela vem do próprio LAUDO (por lote, como
-- Pureza/Germinação/Validade), extraída do documento quando possível
-- (interpretarConteudoLaudo.ts já tenta, ver extras.Categoria) e editável em
-- "Editar Laudo" quando a extração não achar/errar. Espécie deixa de ser um
-- cadastro à parte — o Selo passa a usar direto o nome do produto do laudo.
-- Observação continua igual (fixa por grupo, ver arquivos_parametrizacao_produtos).

alter table arquivos_parametrizacao_produtos
  drop column if exists categoria,
  drop column if exists especie;

alter table arquivos_laudos
  add column if not exists categoria text;
