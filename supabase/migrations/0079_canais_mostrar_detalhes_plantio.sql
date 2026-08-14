-- =====================================================================
-- "Mostrar detalhes" (VC%/Validade) por Tabela de Preço — opt-in, padrão
-- desligado: o card do Catálogo Online só mostra Fornecedor até o operador
-- marcar essa opção pra esse canal (ver ChannelsPanel.tsx). Publicado junto
-- com o resto do snapshot em catalogo_publico_canais.
-- =====================================================================

alter table canais_preco add column if not exists mostrar_detalhes_plantio boolean not null default false;
alter table catalogo_publico_canais add column if not exists mostrar_detalhes_plantio boolean not null default false;
