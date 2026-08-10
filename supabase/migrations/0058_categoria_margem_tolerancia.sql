-- Tolerância (em PONTOS percentuais) em volta da margem sugerida por categoria+canal —
-- NULL = não configurada (nenhum alerta). Ex.: margem 15% + tolerância 5 = faixa aceitável
-- 10%–20%; o ML% do produto (Tabela de Preços) fica destacado em vermelho se ficar abaixo
-- dessa faixa, ou azul se acima — só quando o canal calcula a margem "por categoria" (não
-- "por referência", onde essa tolerância não se aplica).
alter table categoria_margens
  add column if not exists tolerancia_pct numeric;
