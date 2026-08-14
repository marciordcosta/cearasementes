-- =====================================================================
-- VC% padrão por grupo de produto (Parametrização) — usado como reserva no
-- cálculo de kg/ha (Guia de Plantio e calculadora pública do Catálogo
-- Online) quando o laudo escolhido não tem Pureza/Germinação preenchidas
-- (nem teste de campo). Ver germinacaoParaSemeadura em calculoSemeadura.ts.
-- =====================================================================

alter table arquivos_parametrizacao_produtos add column if not exists vc_padrao text;
