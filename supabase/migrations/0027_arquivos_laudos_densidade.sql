-- =====================================================================
-- Densidade de PLÂNTULAS desejada (plântulas/m², após a germinação — não é
-- quantidade de semente lançada) — manual, editada junto do PMS, usada na
-- fórmula de kg/ha (também serve pra milho e sorgo, não só forrageiras).
-- =====================================================================

alter table arquivos_laudos add column if not exists densidade text;
