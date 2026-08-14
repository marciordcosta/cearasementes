-- =====================================================================
-- Reverte o VC% padrão por grupo (Parametrização) — o cálculo (interno e
-- Catálogo Online) volta a usar SEMPRE o laudo de verdade (o último lote),
-- nunca um valor genérico cadastrado por cima quando o laudo não tem
-- Pureza/Germinação. Sem uso nenhum, tira a coluna.
--
-- Acrescenta PMS "manual" (só exibição no card do Catálogo Online) — igual
-- ao VC%, só mostra quando o laudo escolhido tem PMS digitado NESSE lote,
-- nunca cai pro PMS base da Parametrização (esse fallback continua valendo
-- só pro cálculo de kg/ha, campo plantio_pms, sem mudança).
-- =====================================================================

alter table arquivos_parametrizacao_produtos drop column if exists vc_padrao;
alter table catalogo_publico_itens add column if not exists plantio_pms_manual text;
