-- Cultivar cadastrado explicitamente, tanto no laudo quanto no produto da Tabela de Preço — quando
-- os 2 lados têm esse campo preenchido, o casamento laudo↔produto no Catálogo Online (ver
-- calculoSemeadura.ts) compara os 2 valores diretamente (normalizado, exato), em vez de tentar
-- extrair o Cultivar por heurística de texto a partir do nome. Elimina de vez a classe de bug de
-- casamento por nome (ex.: um laudo de Cultivar totalmente diferente casando com um produto só por
-- coincidência de palavras genéricas como o Processo). Opcional nos 2 lados — sem preencher, o
-- sistema continua casando por nome como hoje (fallback, sem mudança de comportamento).
alter table arquivos_laudos add column if not exists cultivar text;
alter table produtos add column if not exists cultivar text;
