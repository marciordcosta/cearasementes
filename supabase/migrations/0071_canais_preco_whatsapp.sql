-- =====================================================================
-- WhatsApp por Tabela de Preço (Canal) — cada canal tem seu próprio
-- número, usado no Catálogo Online (botão flutuante + envio de
-- orçamento). Não é mais um número fixo único pro sistema inteiro.
-- =====================================================================

alter table canais_preco add column if not exists whatsapp text;
