-- =====================================================================
-- Novo Modo de Plantio "Linha" (semeadura contínua, independente de
-- Covas) — precisa da própria linha de fator global (categoria 'modo'),
-- igual lanco/linha_cova já têm (ver 0029_arquivos_fatores_plantio.sql).
-- Fator 1.00 (sem desconto extra) — o modo Linha já usa a Densidade
-- cadastrada direto, igual A Lanço.
-- =====================================================================

insert into arquivos_fatores_plantio (chave, categoria, rotulo, fator)
values
  ('linha', 'modo', 'Linha', '1.00')
on conflict (chave) do nothing;
